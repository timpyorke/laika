//! Coordinated workspace backup and staged restore.
//!
//! A backup is a versioned ZIP containing a consistent SQLite snapshot plus
//! the Stronghold snapshot and KDF salt as one indivisible pair. Restores are
//! validated and staged while the app is running, then swapped in before the
//! database or vault is opened on the next launch.

use crate::error::ApplicationError;
use crate::secrets::SecretStore;
use crate::store::diagnostics::{DiagnosticCategory, DiagnosticOutcome};
use crate::store::{latest_schema_version, Store, StoreHandle};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{Mutex, MutexGuard};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const BACKUP_FORMAT: &str = "laika-workspace-backup";
const BACKUP_FORMAT_VERSION: u32 = 1;
const MANIFEST_NAME: &str = "manifest.json";
const DATABASE_NAME: &str = "laika.db";
const VAULT_NAME: &str = "laika.stronghold";
const SALT_NAME: &str = "laika.stronghold.salt";
const PENDING_RESTORE_DIRECTORY: &str = "pending-restore";
const RECOVERY_DIRECTORY: &str = "restore-recovery";
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_BACKUP_FILE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub file_name: String,
    pub created_at: i64,
    pub includes_secrets: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub backup_app_version: String,
    pub created_at: i64,
    pub includes_secrets: bool,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    format_version: u32,
    app_version: String,
    schema_version: i64,
    created_at: i64,
    files: Vec<BackupFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct BackupFile {
    name: String,
    size: u64,
    sha256: String,
}

pub struct BackupService {
    directory: Option<PathBuf>,
    data_lock: Mutex<()>,
}

impl BackupService {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory: Some(directory),
            data_lock: Mutex::new(()),
        }
    }

    pub fn unavailable() -> Self {
        Self {
            directory: None,
            data_lock: Mutex::new(()),
        }
    }

    pub async fn lock_data(&self) -> MutexGuard<'_, ()> {
        self.data_lock.lock().await
    }

    fn directory(&self) -> Result<&Path, ApplicationError> {
        self.directory
            .as_deref()
            .ok_or_else(ApplicationError::backup)
    }
}

#[tauri::command]
pub async fn create_workspace_backup(
    app: AppHandle,
    service: State<'_, BackupService>,
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
) -> Result<Option<BackupResult>, ApplicationError> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Laika workspace backup", &["laika-backup"])
        .set_file_name(format!(
            "laika-backup-{}.laika-backup",
            crate::store::models::now_ms()
        ))
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|_| ApplicationError::backup())?;
    let destination = normalized_backup_path(&selected);
    let _guard = service.lock_data().await;
    let result = create_backup(
        store.get()?,
        secrets.inner(),
        service.directory()?,
        &destination,
    )
    .await;
    record_diagnostic(store.get().ok(), DiagnosticCategory::Backup, &result).await;
    result.map(Some)
}

#[tauri::command]
pub async fn stage_workspace_restore(
    app: AppHandle,
    service: State<'_, BackupService>,
    store: State<'_, StoreHandle>,
) -> Result<Option<RestoreResult>, ApplicationError> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Laika workspace backup", &["laika-backup"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|_| ApplicationError::invalid_backup())?;
    let _guard = service.lock_data().await;
    let result = stage_restore_archive(&selected, service.directory()?).await;
    record_diagnostic(store.get().ok(), DiagnosticCategory::Restore, &result).await;
    result.map(Some)
}

/// Best-effort diagnostic recording shared by backup and restore: a storage
/// failure here must never affect the command's own result.
async fn record_diagnostic<T>(
    store: Option<&Store>,
    category: DiagnosticCategory,
    result: &Result<T, ApplicationError>,
) {
    let Some(store) = store else {
        return;
    };
    let (outcome, error_code) = match result {
        Ok(_) => (DiagnosticOutcome::Success, None),
        Err(error) => (DiagnosticOutcome::Failure, Some(error.code)),
    };
    let _ = store
        .record_diagnostic_event(category, outcome, error_code, None)
        .await;
}

async fn create_backup(
    store: &Store,
    secrets: &SecretStore,
    app_data_directory: &Path,
    destination: &Path,
) -> Result<BackupResult, ApplicationError> {
    let staging = StagingDirectory::create(app_data_directory, "backup-staging")
        .map_err(|_| ApplicationError::backup())?;
    let database = staging.path().join(DATABASE_NAME);
    store.backup_to(&database).await?;
    let includes_secrets = secrets.snapshot_to(staging.path())?;
    let created_at = crate::store::models::now_ms();
    let mut files = vec![file_record(&database).map_err(|_| ApplicationError::backup())?];
    if includes_secrets {
        files.push(
            file_record(&staging.path().join(VAULT_NAME))
                .map_err(|_| ApplicationError::backup())?,
        );
        files.push(
            file_record(&staging.path().join(SALT_NAME)).map_err(|_| ApplicationError::backup())?,
        );
    }
    let manifest = BackupManifest {
        format: BACKUP_FORMAT.to_owned(),
        format_version: BACKUP_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        schema_version: latest_schema_version(),
        created_at,
        files,
    };
    write_archive(destination, staging.path(), &manifest)?;
    Ok(BackupResult {
        file_name: destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Laika workspace backup")
            .to_owned(),
        created_at,
        includes_secrets,
    })
}

async fn stage_restore_archive(
    archive_path: &Path,
    app_data_directory: &Path,
) -> Result<RestoreResult, ApplicationError> {
    if archive_path
        .metadata()
        .map_err(|_| ApplicationError::invalid_backup())?
        .len()
        > MAX_ARCHIVE_BYTES
    {
        return Err(ApplicationError::invalid_backup());
    }
    let mut staging = StagingDirectory::create(app_data_directory, "restore-staging")
        .map_err(|_| ApplicationError::restore())?;
    let manifest = extract_and_validate_archive(archive_path, staging.path())?;
    let schema_version = Store::validate_backup(&staging.path().join(DATABASE_NAME)).await?;
    if schema_version != manifest.schema_version {
        return Err(ApplicationError::invalid_backup());
    }
    fs::write(
        staging.path().join(MANIFEST_NAME),
        serde_json::to_vec_pretty(&manifest).map_err(|_| ApplicationError::invalid_backup())?,
    )
    .map_err(|_| ApplicationError::restore())?;
    let pending = app_data_directory.join(PENDING_RESTORE_DIRECTORY);
    if pending.exists() {
        retry_transient_fs(|| fs::remove_dir_all(&pending))
            .map_err(|_| ApplicationError::restore())?;
    }
    retry_transient_fs(|| fs::rename(staging.path(), &pending))
        .map_err(|_| ApplicationError::restore())?;
    staging.persist();
    let includes_secrets = manifest_has_secrets(&manifest);
    Ok(RestoreResult {
        backup_app_version: manifest.app_version,
        created_at: manifest.created_at,
        includes_secrets,
        restart_required: true,
    })
}

/// Applies a previously validated restore before SQLite or Stronghold are
/// opened. The previous active files are retained as an automatic rollback set.
pub fn apply_pending_restore(app_data_directory: &Path) -> Result<bool, ApplicationError> {
    let pending = app_data_directory.join(PENDING_RESTORE_DIRECTORY);
    if !pending.exists() {
        return Ok(false);
    }
    let manifest = read_staged_manifest(&pending)?;
    validate_staged_files(&pending, &manifest)?;
    swap_pending_files(app_data_directory, &pending, &manifest)?;
    Ok(true)
}

/// Restores the pre-restore files when the newly applied database cannot be
/// opened. This runs before any store or vault handles are created.
pub fn rollback_last_restore(app_data_directory: &Path) -> Result<(), ApplicationError> {
    let recovery = app_data_directory.join(RECOVERY_DIRECTORY);
    if !recovery.exists() {
        return Err(ApplicationError::restore());
    }
    for name in active_file_names() {
        let active = app_data_directory.join(name);
        if active.exists() {
            retry_transient_fs(|| fs::remove_file(&active))
                .map_err(|_| ApplicationError::restore())?;
        }
    }
    for entry in fs::read_dir(&recovery).map_err(|_| ApplicationError::restore())? {
        let entry = entry.map_err(|_| ApplicationError::restore())?;
        let destination = app_data_directory.join(entry.file_name());
        retry_transient_fs(|| fs::rename(entry.path(), &destination))
            .map_err(|_| ApplicationError::restore())?;
    }
    retry_transient_fs(|| fs::remove_dir_all(&recovery)).map_err(|_| ApplicationError::restore())
}

fn write_archive(
    destination: &Path,
    staging: &Path,
    manifest: &BackupManifest,
) -> Result<(), ApplicationError> {
    let temporary =
        destination.with_extension(format!("laika-backup-{}.tmp", uuid::Uuid::new_v4()));
    let output = File::create(&temporary).map_err(|_| ApplicationError::backup())?;
    let mut archive = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    archive
        .start_file(MANIFEST_NAME, options)
        .map_err(|_| ApplicationError::backup())?;
    archive
        .write_all(&serde_json::to_vec_pretty(manifest).map_err(|_| ApplicationError::backup())?)
        .map_err(|_| ApplicationError::backup())?;
    for record in &manifest.files {
        archive
            .start_file(&record.name, options)
            .map_err(|_| ApplicationError::backup())?;
        let mut input =
            File::open(staging.join(&record.name)).map_err(|_| ApplicationError::backup())?;
        io::copy(&mut input, &mut archive).map_err(|_| ApplicationError::backup())?;
    }
    if archive.finish().is_err() {
        let _ = fs::remove_file(&temporary);
        return Err(ApplicationError::backup());
    }
    if destination.exists() {
        retry_transient_fs(|| fs::remove_file(destination))
            .map_err(|_| ApplicationError::backup())?;
    }
    if retry_transient_fs(|| fs::rename(&temporary, destination)).is_err() {
        let _ = fs::remove_file(&temporary);
        return Err(ApplicationError::backup());
    }
    Ok(())
}

fn extract_and_validate_archive(
    archive_path: &Path,
    destination: &Path,
) -> Result<BackupManifest, ApplicationError> {
    let input = File::open(archive_path).map_err(|_| ApplicationError::invalid_backup())?;
    let mut archive = ZipArchive::new(input).map_err(|_| ApplicationError::invalid_backup())?;
    let allowed = HashSet::from([MANIFEST_NAME, DATABASE_NAME, VAULT_NAME, SALT_NAME]);
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| ApplicationError::invalid_backup())?;
        let name = entry.name().to_owned();
        if !allowed.contains(name.as_str()) || !names.insert(name) {
            return Err(ApplicationError::invalid_backup());
        }
    }
    let manifest = {
        let entry = archive
            .by_name(MANIFEST_NAME)
            .map_err(|_| ApplicationError::invalid_backup())?;
        if entry.size() > MAX_MANIFEST_BYTES {
            return Err(ApplicationError::invalid_backup());
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .take(MAX_MANIFEST_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| ApplicationError::invalid_backup())?;
        serde_json::from_slice::<BackupManifest>(&bytes)
            .map_err(|_| ApplicationError::invalid_backup())?
    };
    validate_manifest(&manifest, &names)?;
    for record in &manifest.files {
        let mut entry = archive
            .by_name(&record.name)
            .map_err(|_| ApplicationError::invalid_backup())?;
        if entry.size() != record.size || record.size > MAX_BACKUP_FILE_BYTES {
            return Err(ApplicationError::invalid_backup());
        }
        let output_path = destination.join(&record.name);
        let mut output = File::create(&output_path).map_err(|_| ApplicationError::restore())?;
        let copied = io::copy(&mut entry, &mut output).map_err(|_| ApplicationError::restore())?;
        if copied != record.size
            || sha256_file(&output_path).map_err(|_| ApplicationError::restore())? != record.sha256
        {
            return Err(ApplicationError::invalid_backup());
        }
    }
    Ok(manifest)
}

fn validate_manifest(
    manifest: &BackupManifest,
    archive_names: &HashSet<String>,
) -> Result<(), ApplicationError> {
    if manifest.format != BACKUP_FORMAT
        || manifest.format_version != BACKUP_FORMAT_VERSION
        || manifest.created_at <= 0
        || manifest.schema_version <= 0
        || manifest.schema_version > latest_schema_version()
    {
        return Err(ApplicationError::invalid_backup());
    }
    let file_names: HashSet<_> = manifest
        .files
        .iter()
        .map(|file| file.name.as_str())
        .collect();
    let has_database = file_names.contains(DATABASE_NAME);
    let has_vault = file_names.contains(VAULT_NAME);
    let has_salt = file_names.contains(SALT_NAME);
    let expected_archive_names: HashSet<_> = manifest
        .files
        .iter()
        .map(|file| file.name.clone())
        .chain(std::iter::once(MANIFEST_NAME.to_owned()))
        .collect();
    let total_size = manifest
        .files
        .iter()
        .try_fold(0_u64, |total, file| total.checked_add(file.size));
    if !has_database
        || has_vault != has_salt
        || file_names.len() != manifest.files.len()
        || &expected_archive_names != archive_names
        || manifest
            .files
            .iter()
            .any(|file| file.size > MAX_BACKUP_FILE_BYTES || file.sha256.len() != 64)
        || total_size.is_none_or(|size| size > MAX_ARCHIVE_BYTES)
    {
        return Err(ApplicationError::invalid_backup());
    }
    Ok(())
}

fn read_staged_manifest(directory: &Path) -> Result<BackupManifest, ApplicationError> {
    let bytes = fs::read(directory.join(MANIFEST_NAME)).map_err(|_| ApplicationError::restore())?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(ApplicationError::restore());
    }
    let manifest = serde_json::from_slice::<BackupManifest>(&bytes)
        .map_err(|_| ApplicationError::restore())?;
    let names = manifest
        .files
        .iter()
        .map(|file| file.name.clone())
        .chain(std::iter::once(MANIFEST_NAME.to_owned()))
        .collect();
    validate_manifest(&manifest, &names).map_err(|_| ApplicationError::restore())?;
    Ok(manifest)
}

fn validate_staged_files(
    directory: &Path,
    manifest: &BackupManifest,
) -> Result<(), ApplicationError> {
    for record in &manifest.files {
        let path = directory.join(&record.name);
        let size = path
            .metadata()
            .map_err(|_| ApplicationError::restore())?
            .len();
        if size != record.size
            || sha256_file(&path).map_err(|_| ApplicationError::restore())? != record.sha256
        {
            return Err(ApplicationError::restore());
        }
    }
    Ok(())
}

fn swap_pending_files(
    app_data_directory: &Path,
    pending: &Path,
    manifest: &BackupManifest,
) -> Result<(), ApplicationError> {
    let recovery_next = app_data_directory.join("restore-recovery-next");
    if recovery_next.exists() {
        retry_transient_fs(|| fs::remove_dir_all(&recovery_next))
            .map_err(|_| ApplicationError::restore())?;
    }
    fs::create_dir_all(&recovery_next).map_err(|_| ApplicationError::restore())?;
    let restored_names: HashSet<_> = manifest
        .files
        .iter()
        .map(|file| file.name.as_str())
        .collect();
    for name in [DATABASE_NAME, VAULT_NAME, SALT_NAME] {
        let temporary = app_data_directory.join(format!("{name}.restore-new"));
        if temporary.exists() {
            retry_transient_fs(|| fs::remove_file(&temporary))
                .map_err(|_| ApplicationError::restore())?;
        }
        if restored_names.contains(name) {
            retry_transient_fs(|| fs::copy(pending.join(name), &temporary))
                .map_err(|_| ApplicationError::restore())?;
        }
    }

    let swap_result = (|| -> Result<(), ApplicationError> {
        for name in active_file_names() {
            let active = app_data_directory.join(name);
            if active.exists() {
                retry_transient_fs(|| fs::rename(&active, recovery_next.join(name)))
                    .map_err(|_| ApplicationError::restore())?;
            }
        }
        for name in [DATABASE_NAME, VAULT_NAME, SALT_NAME] {
            let temporary = app_data_directory.join(format!("{name}.restore-new"));
            if temporary.exists() {
                retry_transient_fs(|| fs::rename(&temporary, app_data_directory.join(name)))
                    .map_err(|_| ApplicationError::restore())?;
            }
        }
        Ok(())
    })();

    if swap_result.is_err() {
        for name in active_file_names() {
            let active = app_data_directory.join(name);
            if active.exists() {
                let _ = fs::remove_file(active);
            }
            let previous = recovery_next.join(name);
            if previous.exists() {
                let _ = fs::rename(previous, app_data_directory.join(name));
            }
            let temporary = app_data_directory.join(format!("{name}.restore-new"));
            if temporary.exists() {
                let _ = fs::remove_file(temporary);
            }
        }
        let _ = fs::remove_dir_all(&recovery_next);
        return Err(ApplicationError::restore());
    }

    let recovery = app_data_directory.join(RECOVERY_DIRECTORY);
    if recovery.exists() {
        retry_transient_fs(|| fs::remove_dir_all(&recovery))
            .map_err(|_| ApplicationError::restore())?;
    }
    retry_transient_fs(|| fs::rename(&recovery_next, &recovery))
        .map_err(|_| ApplicationError::restore())?;
    retry_transient_fs(|| fs::remove_dir_all(pending)).map_err(|_| ApplicationError::restore())?;
    Ok(())
}

fn active_file_names() -> [&'static str; 5] {
    [
        DATABASE_NAME,
        "laika.db-wal",
        "laika.db-shm",
        VAULT_NAME,
        SALT_NAME,
    ]
}

fn manifest_has_secrets(manifest: &BackupManifest) -> bool {
    manifest.files.iter().any(|file| file.name == VAULT_NAME)
}

/// Windows can transiently deny a rename, copy, or delete immediately after a
/// file in that tree was just written or read closed its handle — real-time
/// antivirus scanning can briefly hold its own handle on a fresh file. This
/// has been observed to intermittently fail the backup/restore round trip on
/// Windows CI runners with no retry; retry a few times with a short backoff
/// before treating the failure as real.
fn retry_transient_fs<T>(mut operation: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    const ATTEMPTS: u32 = 5;
    const DELAY: Duration = Duration::from_millis(50);
    let mut last_error = None;
    for attempt in 0..ATTEMPTS {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < ATTEMPTS {
                    std::thread::sleep(DELAY);
                }
            }
        }
    }
    Err(last_error.expect("the loop runs at least once"))
}

fn file_record(path: &Path) -> io::Result<BackupFile> {
    Ok(BackupFile {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid backup name"))?
            .to_owned(),
        size: path.metadata()?.len(),
        sha256: sha256_file(path)?,
    })
}

fn sha256_file(path: &Path) -> io::Result<String> {
    let mut input = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn normalized_backup_path(path: &Path) -> PathBuf {
    if path.extension().and_then(|extension| extension.to_str()) == Some("laika-backup") {
        path.to_owned()
    } else {
        let mut normalized = path.to_owned();
        normalized.set_extension("laika-backup");
        normalized
    }
}

struct StagingDirectory {
    path: PathBuf,
    persisted: bool,
}

impl StagingDirectory {
    fn create(parent: &Path, prefix: &str) -> io::Result<Self> {
        let path = parent.join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path)?;
        Ok(Self {
            path,
            persisted: false,
        })
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn persist(&mut self) {
        self.persisted = true;
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        if !self.persisted {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn backup_restore_round_trip_preserves_workspace_and_vault() {
        let root = test_directory("round-trip");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();

        let store = Store::open(&source.join(DATABASE_NAME)).await.unwrap();
        store.create_collection("Source APIs").await.unwrap();
        let secrets = SecretStore::new(&source);
        secrets.unlock("correct horse battery staple").unwrap();
        let secret_ref = secrets.put(None, "restored-secret").unwrap();
        let archive = root.join("workspace.laika-backup");
        create_backup(&store, &secrets, &source, &archive)
            .await
            .unwrap();
        store.close().await;
        secrets.lock().unwrap();

        let current = Store::open(&target.join(DATABASE_NAME)).await.unwrap();
        current.create_collection("Current APIs").await.unwrap();
        current.close().await;
        stage_restore_archive(&archive, &target).await.unwrap();
        assert!(apply_pending_restore(&target).unwrap());

        let restored = Store::open(&target.join(DATABASE_NAME)).await.unwrap();
        let tree = restored.load_tree().await.unwrap();
        assert_eq!(tree.collections[0].name, "Source APIs");
        let restored_secrets = SecretStore::new(&target);
        restored_secrets
            .unlock("correct horse battery staple")
            .unwrap();
        assert_eq!(
            restored_secrets.get(&secret_ref).unwrap(),
            "restored-secret"
        );
        assert!(target.join(RECOVERY_DIRECTORY).join(DATABASE_NAME).exists());
        restored.close().await;
        restored_secrets.lock().unwrap();
        drop(restored_secrets);
        drop(secrets);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn invalid_archive_is_rejected_without_staging_restore() {
        let root = test_directory("invalid");
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("broken.laika-backup");
        fs::write(&archive, b"not a zip archive").unwrap();

        let error = stage_restore_archive(&archive, &root).await.unwrap_err();
        assert_eq!(
            error.code,
            crate::error::ApplicationErrorCode::InvalidBackup
        );
        assert!(!root.join(PENDING_RESTORE_DIRECTORY).exists());
        fs::remove_dir_all(root).unwrap();
    }

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("laika-backup-{label}-{}", uuid::Uuid::new_v4()))
    }
}
