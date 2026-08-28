//! Local workspace persistence.
//!
//! This module is the repository layer: it owns the SQLite pool, the schema
//! migrations, and every query. Tauri commands live in [`commands`] and do
//! nothing except forward to the methods here, so the same API can back a CLI
//! later without pulling in Tauri.

mod collections;
pub mod commands;
mod history;
pub mod models;
mod requests;
#[cfg(test)]
mod tests;

use crate::error::ApplicationError;
use models::{new_id, now_ms};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::path::Path;
use std::time::Duration;

pub struct Store {
    pool: SqlitePool,
    workspace_id: String,
}

impl Store {
    /// Opens (creating if needed) the workspace database and brings it to the
    /// current schema version.
    pub async fn open(path: &Path) -> Result<Self, ApplicationError> {
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

    async fn bootstrap(pool: SqlitePool) -> Result<Self, ApplicationError> {
        sqlx::migrate!()
            .run(&pool)
            .await
            .map_err(|_| ApplicationError::database())?;
        let workspace_id = ensure_default_workspace(&pool).await?;
        Ok(Self { pool, workspace_id })
    }
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
        self.inner.as_ref().map_err(|error| *error)
    }
}
