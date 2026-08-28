use super::models::{
    decode_entries, encode_json, map_history_summary, new_id, now_ms, redact_entries,
    truncate_body, HistoryEntry, HistorySummary, KeyValueRecord, RequestSnapshot,
    HISTORY_RETENTION_LIMIT,
};
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;
use sqlx::Row;

const MAX_HISTORY_PAGE: i64 = 200;

/// What the caller knows about a request before it runs. Credential values in
/// the snapshot are redacted by [`Store::record_execution`], not by the caller.
pub struct HistoryDraft {
    pub request_id: Option<String>,
    pub name: String,
    pub snapshot: RequestSnapshot,
}

/// A transport-neutral copy of a response, so the store does not depend on the
/// HTTP engine's types.
pub struct HistoryResponse {
    pub status: i64,
    pub status_text: String,
    pub elapsed_ms: i64,
    pub size_bytes: i64,
    pub headers: Vec<KeyValueRecord>,
    pub body: String,
    pub truncated: bool,
}

impl Store {
    /// Writes one history row for a request that reached the network, whether
    /// it succeeded or failed.
    pub async fn record_execution(
        &self,
        draft: HistoryDraft,
        outcome: Result<HistoryResponse, &'static str>,
    ) -> Result<(), ApplicationError> {
        // A request saved and then deleted while in flight must not fail the
        // insert on the foreign key.
        let request_id = match draft.request_id {
            Some(id) if self.get_request(&id).await.is_ok() => Some(id),
            _ => None,
        };
        // Redaction happens here rather than at the call site so that every
        // path into history, including a future CLI, gets the same guarantee.
        let snapshot = RequestSnapshot {
            params: redact_entries(&draft.snapshot.params),
            headers: redact_entries(&draft.snapshot.headers),
            form: redact_entries(&draft.snapshot.form),
            body: truncate_body(&draft.snapshot.body).0,
            ..draft.snapshot
        };
        let request_json = encode_json(&snapshot)?;
        let (response, error_code) = match outcome {
            Ok(response) => (Some(response), None),
            Err(code) => (None, Some(code)),
        };
        let stored_body = response
            .as_ref()
            .map(|response| truncate_body(&response.body));
        let response_truncated = response.as_ref().is_some_and(|response| response.truncated)
            || stored_body
                .as_ref()
                .is_some_and(|(_, truncated)| *truncated);
        let response_headers_json = match response.as_ref() {
            Some(response) => Some(encode_json(&redact_entries(&response.headers))?),
            None => None,
        };

        sqlx::query(
            "INSERT INTO history_entry (
                 id, workspace_id, request_id, name, method, url, request_json,
                 status, status_text, elapsed_ms, size_bytes,
                 response_headers_json, response_body, response_truncated, error_code, created_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(&self.workspace_id)
        .bind(&request_id)
        .bind(&draft.name)
        .bind(&snapshot.method)
        .bind(&snapshot.url)
        .bind(&request_json)
        .bind(response.as_ref().map(|response| response.status))
        .bind(
            response
                .as_ref()
                .map(|response| response.status_text.clone()),
        )
        .bind(response.as_ref().map(|response| response.elapsed_ms))
        .bind(response.as_ref().map(|response| response.size_bytes))
        .bind(&response_headers_json)
        .bind(stored_body.map(|(body, _)| body))
        .bind(i64::from(response_truncated))
        .bind(error_code)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        self.trim_history().await
    }

    /// Newest first. `query` matches the request name or URL.
    pub async fn list_history(
        &self,
        query: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<HistorySummary>, ApplicationError> {
        let limit = limit.clamp(1, MAX_HISTORY_PAGE);
        let offset = offset.max(0);
        let pattern = query
            .map(str::trim)
            .filter(|query| !query.is_empty())
            .map(|query| format!("%{}%", escape_like(query)));

        let rows = match pattern {
            Some(pattern) => {
                sqlx::query(
                    "SELECT * FROM history_entry
                 WHERE workspace_id = ?1
                   AND (name LIKE ?2 ESCAPE '\\' OR url LIKE ?2 ESCAPE '\\')
                 ORDER BY created_at DESC LIMIT ?3 OFFSET ?4",
                )
                .bind(&self.workspace_id)
                .bind(pattern)
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await
            }
            None => {
                sqlx::query(
                    "SELECT * FROM history_entry WHERE workspace_id = ?
                 ORDER BY created_at DESC LIMIT ? OFFSET ?",
                )
                .bind(&self.workspace_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(&self.pool)
                .await
            }
        }
        .map_err(map_sqlx_error)?;

        Ok(rows.iter().map(map_history_summary).collect())
    }

    pub async fn get_history_entry(&self, id: &str) -> Result<HistoryEntry, ApplicationError> {
        let row = sqlx::query("SELECT * FROM history_entry WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(ApplicationError::not_found)?;

        let request: RequestSnapshot =
            serde_json::from_str(row.get::<String, _>("request_json").as_str()).unwrap_or_default();
        let response_headers = row
            .get::<Option<String>, _>("response_headers_json")
            .map(|raw| decode_entries(&raw))
            .unwrap_or_default();

        Ok(HistoryEntry {
            summary: map_history_summary(&row),
            request,
            response_headers,
            response_body: row.get("response_body"),
            response_truncated: row.get::<i64, _>("response_truncated") != 0,
        })
    }

    pub async fn delete_history_entry(&self, id: &str) -> Result<(), ApplicationError> {
        let result = sqlx::query("DELETE FROM history_entry WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        Ok(())
    }

    pub async fn clear_history(&self) -> Result<u64, ApplicationError> {
        let result = sqlx::query("DELETE FROM history_entry WHERE workspace_id = ?")
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(result.rows_affected())
    }

    /// Retention policy: keep the newest [`HISTORY_RETENTION_LIMIT`] entries.
    async fn trim_history(&self) -> Result<(), ApplicationError> {
        sqlx::query(
            "DELETE FROM history_entry
             WHERE workspace_id = ?1
               AND id NOT IN (
                   SELECT id FROM history_entry WHERE workspace_id = ?1
                   ORDER BY created_at DESC LIMIT ?2
               )",
        )
        .bind(&self.workspace_id)
        .bind(HISTORY_RETENTION_LIMIT)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }
}

/// Stops user input from being read as `LIKE` wildcards.
fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}
