//! Local workspace persistence.
//!
//! This module is the repository layer: it owns the SQLite pool, the schema
//! migrations, and every query. Tauri commands live in [`commands`] and do
//! nothing except forward to the methods here, so the same API can back a CLI
//! later without pulling in Tauri.

mod collections;
pub mod commands;
pub(crate) mod diagnostics;
mod environments;
mod history;
pub mod models;
#[cfg(any(test, feature = "performance"))]
mod performance;
mod requests;
mod test_runs;
#[cfg(test)]
mod tests;

use crate::error::ApplicationError;
#[cfg(feature = "performance")]
pub(crate) use history::{HistoryDraft, HistoryResponse};
use models::{new_id, now_ms};
#[cfg(feature = "performance")]
pub(crate) use performance::FixtureProfile;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::path::Path;
use std::time::Duration;

static MIGRATOR: Migrator = sqlx::migrate!();

pub struct Store {
    pool: SqlitePool,
    workspace_id: String,
}

impl Store {
    /// Opens (creating if needed) the workspace database and brings it to the
    /// current schema version.
    pub async fn open(path: &Path) -> Result<Self, ApplicationError> {
        let existing_database = path
            .metadata()
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false);
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await
            .map_err(map_sqlx_error)?;
        if existing_database {
            ensure_integrity(&pool).await?;
            create_pre_migration_recovery(&pool, path).await?;
        }
        Self::bootstrap(pool).await
    }

    /// A private in-memory database for tests. `max_connections(1)` matters:
    /// each new connection to `sqlite::memory:` would otherwise get its own
    /// empty database.
    #[cfg(test)]
    pub async fn open_in_memory() -> Result<Self, ApplicationError> {
        let options = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .idle_timeout(None)
            .max_lifetime(None)
            .connect_with(options)
            .await
            .map_err(map_sqlx_error)?;
        Self::bootstrap(pool).await
    }

    #[cfg(any(test, feature = "performance"))]
    pub async fn close(self) {
        self.pool.close().await;
    }

    async fn bootstrap(pool: SqlitePool) -> Result<Self, ApplicationError> {
        MIGRATOR
            .run(&pool)
            .await
            .map_err(|_| ApplicationError::database())?;
        ensure_integrity(&pool).await?;
        let workspace_id = ensure_default_workspace(&pool).await?;
        Ok(Self { pool, workspace_id })
    }

    /// Creates a compact, transactionally consistent snapshot of the live WAL
    /// database without exposing the pool or copying the database file directly.
    pub async fn backup_to(&self, path: &Path) -> Result<(), ApplicationError> {
        backup_pool_to(&self.pool, path)
            .await
            .map_err(|_| ApplicationError::backup())
    }

    /// Validates a staged database before it is allowed to replace the active
    /// workspace. Backups from a newer schema are rejected rather than opened
    /// and potentially downgraded.
    pub async fn validate_backup(path: &Path) -> Result<i64, ApplicationError> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .read_only(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(|_| ApplicationError::invalid_backup())?;
        let validation = async {
            ensure_integrity(&pool)
                .await
                .map_err(|_| ApplicationError::invalid_backup())?;
            applied_schema_version(&pool)
                .await
                .map_err(|_| ApplicationError::invalid_backup())
        }
        .await;
        pool.close().await;
        let version = validation?;
        if version <= 0 || version > latest_schema_version() {
            return Err(ApplicationError::invalid_backup());
        }
        Ok(version)
    }
}

pub fn latest_schema_version() -> i64 {
    MIGRATOR
        .migrations
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or_default()
}

async fn ensure_integrity(pool: &SqlitePool) -> Result<(), ApplicationError> {
    let result: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(pool)
        .await
        .map_err(map_sqlx_error)?;
    if result == "ok" {
        Ok(())
    } else {
        Err(ApplicationError::database())
    }
}

async fn applied_schema_version(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let table_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(pool)
    .await?;
    if table_exists == 0 {
        return Ok(0);
    }
    Ok(
        sqlx::query_scalar::<_, Option<i64>>("SELECT MAX(version) FROM _sqlx_migrations")
            .fetch_one(pool)
            .await?
            .unwrap_or_default(),
    )
}

async fn create_pre_migration_recovery(
    pool: &SqlitePool,
    database_path: &Path,
) -> Result<(), ApplicationError> {
    let current = applied_schema_version(pool).await.map_err(map_sqlx_error)?;
    let latest = latest_schema_version();
    if current >= latest {
        return Ok(());
    }
    let parent = database_path
        .parent()
        .ok_or_else(ApplicationError::database)?;
    let recovery = parent.join("recovery");
    std::fs::create_dir_all(&recovery).map_err(|_| ApplicationError::database())?;
    let snapshot = recovery.join(format!(
        "pre-migration-{current}-to-{latest}-{}.db",
        new_id()
    ));
    backup_pool_to(pool, &snapshot)
        .await
        .map_err(map_sqlx_error)
}

async fn backup_pool_to(pool: &SqlitePool, path: &Path) -> Result<(), sqlx::Error> {
    if path.exists() {
        std::fs::remove_file(path).map_err(sqlx::Error::Io)?;
    }
    sqlx::query("VACUUM INTO ?")
        .bind(path.to_string_lossy().as_ref())
        .execute(pool)
        .await?;
    Ok(())
}

/// Laika currently exposes a single implicit workspace. The row still exists so
/// collections and history have a stable owner, and so multiple workspaces can
/// be added later without a schema change.
async fn ensure_default_workspace(pool: &SqlitePool) -> Result<String, ApplicationError> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT id FROM workspace ORDER BY created_at LIMIT 1")
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx_error)?;
    if let Some((id,)) = existing {
        return Ok(id);
    }

    let id = new_id();
    let timestamp = now_ms();
    sqlx::query("INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind("Personal workspace")
        .bind(timestamp)
        .bind(timestamp)
        .execute(pool)
        .await
        .map_err(map_sqlx_error)?;
    Ok(id)
}

/// Driver errors are collapsed into the two outcomes the UI can act on. The
/// original message is deliberately dropped so file paths and row contents
/// never reach the frontend.
pub fn map_sqlx_error(error: sqlx::Error) -> ApplicationError {
    match error {
        sqlx::Error::RowNotFound => ApplicationError::not_found(),
        _ => ApplicationError::database(),
    }
}

/// Wraps the store so a failed startup degrades the app instead of stopping it:
/// the window still opens and every workspace command reports a recoverable
/// error.
pub struct StoreHandle {
    inner: Result<Store, ApplicationError>,
}

impl StoreHandle {
    pub fn ready(store: Store) -> Self {
        Self { inner: Ok(store) }
    }

    pub fn unavailable() -> Self {
        Self {
            inner: Err(ApplicationError::database_unavailable()),
        }
    }

    pub fn get(&self) -> Result<&Store, ApplicationError> {
        self.inner.as_ref().map_err(Clone::clone)
    }
}
