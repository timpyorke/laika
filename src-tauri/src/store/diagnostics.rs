//! Local, opt-in diagnostic events.
//!
//! [`DiagnosticEvent`] is deliberately narrow: an id, a timestamp, the app
//! version and OS, and a handful of closed enums. There is no field a
//! request URL, header, parameter, body, environment value, or secret could
//! ever be written into, so nothing sensitive can leak through this path by
//! construction rather than by redaction. Recording is local-only; nothing
//! here ever leaves the device except through the explicit export command.

use super::models::{new_id, now_ms, DIAGNOSTICS_RETENTION_LIMIT};
use super::{map_sqlx_error, Store};
use crate::error::{ApplicationError, ApplicationErrorCode};
use serde::Serialize;
use sqlx::Row;

/// The operation an event describes. Closed on purpose: callers pass one of
/// these variants, never a free-form string.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiagnosticCategory {
    HttpRequest,
    CollectionRun,
    Backup,
    Restore,
}

impl DiagnosticCategory {
    fn as_str(self) -> &'static str {
        match self {
            Self::HttpRequest => "HTTP_REQUEST",
            Self::CollectionRun => "COLLECTION_RUN",
            Self::Backup => "BACKUP",
            Self::Restore => "RESTORE",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiagnosticOutcome {
    Success,
    Failure,
}

impl DiagnosticOutcome {
    fn as_str(self) -> &'static str {
        match self {
            Self::Success => "SUCCESS",
            Self::Failure => "FAILURE",
        }
    }
}

/// Coarse timing buckets rather than raw milliseconds, so an exported event
/// carries no precise timing that could help fingerprint a request.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimingBucket {
    UnderMs100,
    Ms100To500,
    Ms500To1000,
    S1To5,
    Over5s,
}

impl TimingBucket {
    pub fn from_millis(elapsed_ms: u64) -> Self {
        match elapsed_ms {
            0..=99 => Self::UnderMs100,
            100..=499 => Self::Ms100To500,
            500..=999 => Self::Ms500To1000,
            1_000..=4_999 => Self::S1To5,
            _ => Self::Over5s,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::UnderMs100 => "UNDER_100MS",
            Self::Ms100To500 => "100MS_TO_500MS",
            Self::Ms500To1000 => "500MS_TO_1S",
            Self::S1To5 => "1S_TO_5S",
            Self::Over5s => "OVER_5S",
        }
    }
}

/// A stored event as read back for display or export. Every field here is
/// either an id/timestamp or one of the fixed strings this module itself
/// wrote, so exposing it as plain `String` carries no additional risk.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub id: String,
    pub created_at: i64,
    pub app_version: String,
    pub os: String,
    pub category: String,
    pub outcome: String,
    pub error_code: Option<String>,
    pub timing_bucket: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSettings {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsExport {
    pub exported_at: i64,
    pub app_version: String,
    pub os: String,
    pub events: Vec<DiagnosticEvent>,
}

impl Store {
    pub async fn diagnostics_enabled(&self) -> Result<bool, ApplicationError> {
        let enabled: i64 =
            sqlx::query_scalar("SELECT diagnostics_enabled FROM workspace WHERE id = ?")
                .bind(&self.workspace_id)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        Ok(enabled != 0)
    }

    pub async fn set_diagnostics_enabled(&self, enabled: bool) -> Result<(), ApplicationError> {
        sqlx::query("UPDATE workspace SET diagnostics_enabled = ?, updated_at = ? WHERE id = ?")
            .bind(i64::from(enabled))
            .bind(now_ms())
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }

    /// Best-effort and a no-op when diagnostics are disabled, so every call
    /// site can record unconditionally without checking the setting itself.
    pub async fn record_diagnostic_event(
        &self,
        category: DiagnosticCategory,
        outcome: DiagnosticOutcome,
        error_code: Option<ApplicationErrorCode>,
        timing_bucket: Option<TimingBucket>,
    ) -> Result<(), ApplicationError> {
        if !self.diagnostics_enabled().await? {
            return Ok(());
        }
        sqlx::query(
            "INSERT INTO diagnostic_event (
                 id, workspace_id, created_at, app_version, os, category, outcome, error_code, timing_bucket
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(&self.workspace_id)
        .bind(now_ms())
        .bind(env!("CARGO_PKG_VERSION"))
        .bind(std::env::consts::OS)
        .bind(category.as_str())
        .bind(outcome.as_str())
        .bind(error_code.map(ApplicationErrorCode::as_str))
        .bind(timing_bucket.map(TimingBucket::as_str))
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        self.trim_diagnostic_events().await
    }

    /// Newest first.
    pub async fn list_diagnostic_events(&self) -> Result<Vec<DiagnosticEvent>, ApplicationError> {
        let rows = sqlx::query(
            "SELECT id, created_at, app_version, os, category, outcome, error_code, timing_bucket
             FROM diagnostic_event WHERE workspace_id = ? ORDER BY created_at DESC",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(rows
            .iter()
            .map(|row| DiagnosticEvent {
                id: row.get("id"),
                created_at: row.get("created_at"),
                app_version: row.get("app_version"),
                os: row.get("os"),
                category: row.get("category"),
                outcome: row.get("outcome"),
                error_code: row.get("error_code"),
                timing_bucket: row.get("timing_bucket"),
            })
            .collect())
    }

    pub async fn clear_diagnostic_events(&self) -> Result<(), ApplicationError> {
        sqlx::query("DELETE FROM diagnostic_event WHERE workspace_id = ?")
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }

    /// Retention policy: keep the newest [`DIAGNOSTICS_RETENTION_LIMIT`] events.
    async fn trim_diagnostic_events(&self) -> Result<(), ApplicationError> {
        sqlx::query(
            "DELETE FROM diagnostic_event
             WHERE workspace_id = ?1
               AND id NOT IN (
                   SELECT id FROM diagnostic_event WHERE workspace_id = ?1
                   ORDER BY created_at DESC LIMIT ?2
               )",
        )
        .bind(&self.workspace_id)
        .bind(DIAGNOSTICS_RETENTION_LIMIT)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }
}
