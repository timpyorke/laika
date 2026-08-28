//! Encrypted secret storage backed by a Stronghold snapshot.
//!
//! SQLite only receives the random reference returned by `put`. Library
//! errors are intentionally collapsed so neither paths nor secret material can
//! cross the command boundary.

use crate::error::ApplicationError;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_stronghold::stronghold::Stronghold;

const CLIENT_PATH: &[u8] = b"laika-secrets";

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStoreStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

pub struct SecretStore {
    available: bool,
    snapshot_path: PathBuf,
    salt_path: PathBuf,
    inner: Mutex<Option<Stronghold>>,
}

impl SecretStore {
    pub fn new(directory: &Path) -> Self {
        Self {
            available: true,
            snapshot_path: directory.join("laika.stronghold"),
            salt_path: directory.join("laika.stronghold.salt"),
            inner: Mutex::new(None),
        }
    }

    pub fn unavailable() -> Self {
        Self {
            available: false,
            snapshot_path: PathBuf::new(),
            salt_path: PathBuf::new(),
            inner: Mutex::new(None),
        }
    }

    pub fn status(&self) -> Result<SecretStoreStatus, ApplicationError> {
        let unlocked = self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())?
            .is_some();
        Ok(SecretStoreStatus {
            initialized: self.available && self.snapshot_path.exists(),
            unlocked,
        })
    }

    pub fn unlock(&self, password: &str) -> Result<SecretStoreStatus, ApplicationError> {
        if !self.available || password.is_empty() {
            return Err(ApplicationError::secret_store());
        }
        let salt_path = self.salt_path.clone();
        let password_hash = std::panic::catch_unwind(|| {
            tauri_plugin_stronghold::kdf::KeyDerivation::argon2(password, &salt_path)
        })
        .map_err(|_| ApplicationError::secret_store())?;
        let existed = self.snapshot_path.exists();
        let stronghold = Stronghold::new(&self.snapshot_path, password_hash)
            .map_err(|_| ApplicationError::secret_store())?;
        if existed {
            stronghold
                .load_client(CLIENT_PATH)
                .map_err(|_| ApplicationError::secret_store())?;
        } else {
            stronghold
                .create_client(CLIENT_PATH)
                .map_err(|_| ApplicationError::secret_store())?;
            stronghold
                .write_client(CLIENT_PATH)
                .map_err(|_| ApplicationError::secret_store())?;
            stronghold
                .save()
                .map_err(|_| ApplicationError::secret_store())?;
        }
        *self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())? = Some(stronghold);
        self.status()
    }

    pub fn lock(&self) -> Result<SecretStoreStatus, ApplicationError> {
        let stronghold = self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())?
            .take();
        if let Some(stronghold) = stronghold {
            stronghold
                .save()
                .map_err(|_| ApplicationError::secret_store())?;
        }
        self.status()
    }

    pub fn put(&self, secret_ref: Option<&str>, value: &str) -> Result<String, ApplicationError> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())?;
        let stronghold = guard
            .as_ref()
            .ok_or_else(ApplicationError::secret_store_locked)?;
        let secret_ref = secret_ref
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let client = stronghold
            .get_client(CLIENT_PATH)
            .map_err(|_| ApplicationError::secret_store())?;
        client
            .store()
            .insert(
                secret_ref.as_bytes().to_vec(),
                value.as_bytes().to_vec(),
                None,
            )
            .map_err(|_| ApplicationError::secret_store())?;
        stronghold
            .write_client(CLIENT_PATH)
            .map_err(|_| ApplicationError::secret_store())?;
        stronghold
            .save()
            .map_err(|_| ApplicationError::secret_store())?;
        Ok(secret_ref)
    }

    pub fn get(&self, secret_ref: &str) -> Result<String, ApplicationError> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())?;
        let stronghold = guard
            .as_ref()
            .ok_or_else(ApplicationError::secret_store_locked)?;
        let client = stronghold
            .get_client(CLIENT_PATH)
            .map_err(|_| ApplicationError::secret_store())?;
        let value = client
            .store()
            .get(secret_ref.as_bytes())
            .map_err(|_| ApplicationError::secret_store())?
            .ok_or_else(ApplicationError::secret_store)?;
        String::from_utf8(value).map_err(|_| ApplicationError::secret_store())
    }

    pub fn delete(&self, secret_ref: &str) -> Result<(), ApplicationError> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| ApplicationError::secret_store())?;
        let stronghold = guard
            .as_ref()
            .ok_or_else(ApplicationError::secret_store_locked)?;
        let client = stronghold
            .get_client(CLIENT_PATH)
            .map_err(|_| ApplicationError::secret_store())?;
        client
            .store()
            .delete(secret_ref.as_bytes())
            .map_err(|_| ApplicationError::secret_store())?;
        stronghold
            .write_client(CLIENT_PATH)
            .map_err(|_| ApplicationError::secret_store())?;
        stronghold
            .save()
            .map_err(|_| ApplicationError::secret_store())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_reference_survives_lock_and_restart() {
        let directory = std::env::temp_dir().join(format!("laika-vault-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let first = SecretStore::new(&directory);
        first.unlock("correct horse battery staple").unwrap();
        let secret_ref = first.put(None, "phase-four-secret").unwrap();
        first.lock().unwrap();

        let reopened = SecretStore::new(&directory);
        reopened.unlock("correct horse battery staple").unwrap();
        assert_eq!(reopened.get(&secret_ref).unwrap(), "phase-four-secret");
        reopened.lock().unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }
}
