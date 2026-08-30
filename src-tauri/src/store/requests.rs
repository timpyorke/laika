use super::environments::validate_variable_name;
use super::models::{
    encode_json, map_request_summary, map_saved_request, new_id, now_ms, redact_entries,
    truncate_body, validate_name, RequestSummary, SaveRequestInput, SavedRequest,
};
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;
use sqlx::{Sqlite, Transaction};

impl Store {
    /// Creates or updates a saved request.
    ///
    /// Secret material itself has no field in this layer; only an opaque
    /// Stronghold reference is persisted. Credential header values are redacted. Bodies larger
    /// than [`MAX_STORED_BODY_BYTES`](super::models::MAX_STORED_BODY_BYTES) are
    /// stored truncated.
    pub async fn save_request(
        &self,
        input: SaveRequestInput,
    ) -> Result<SavedRequest, ApplicationError> {
        let name = validate_name(&input.name)?;
        if input.assertions.len() > 100
            || input.assertions.iter().any(|assertion| {
                assertion.target.chars().count() > 4_096
                    || assertion.expected.chars().count() > 4_096
            })
            || input.extractions.len() > 20
            || input.extractions.iter().any(|extraction| {
                extraction.target.chars().count() > 4_096
                    || validate_variable_name(&extraction.variable_name).is_err()
            })
        {
            return Err(ApplicationError::invalid_input());
        }
        self.assert_collection_exists(&input.collection_id).await?;
        if let Some(folder_id) = input.folder_id.as_deref() {
            self.assert_folder_in_collection(folder_id, &input.collection_id)
                .await?;
        }

        let params_json = encode_json(&redact_entries(&input.params))?;
        let headers_json = encode_json(&redact_entries(&input.headers))?;
        let form_json = encode_json(&redact_entries(&input.form))?;
        let assertions_json = encode_json(&input.assertions)?;
        let extractions_json = encode_json(&input.extractions)?;
        let (body, _) = truncate_body(&input.body);
        let timestamp = now_ms();

        let row = match input.id {
            Some(id) => sqlx::query(
                "UPDATE saved_request SET
                     collection_id = ?, folder_id = ?, name = ?, method = ?, url = ?,
                     params_json = ?, headers_json = ?, body_mode = ?, body = ?, form_json = ?,
                     auth_type = ?, auth_username = ?, auth_secret_ref = ?, timeout_ms = ?, assertions_json = ?,
                     extractions_json = ?, updated_at = ?
                 WHERE id = ?
                 RETURNING *",
            )
            .bind(&input.collection_id)
            .bind(&input.folder_id)
            .bind(&name)
            .bind(&input.method)
            .bind(&input.url)
            .bind(&params_json)
            .bind(&headers_json)
            .bind(&input.body_mode)
            .bind(&body)
            .bind(&form_json)
            .bind(input.auth.kind())
            .bind(input.auth.username())
            .bind(&input.auth_secret_ref)
            .bind(input.timeout_ms)
            .bind(&assertions_json)
            .bind(&extractions_json)
            .bind(timestamp)
            .bind(&id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(ApplicationError::not_found)?,
            None => {
                let position = self
                    .next_request_position(&input.collection_id, input.folder_id.as_deref())
                    .await?;
                sqlx::query(
                    "INSERT INTO saved_request (
                         id, collection_id, folder_id, name, method, url,
                         params_json, headers_json, body_mode, body, form_json,
                         auth_type, auth_username, auth_secret_ref, timeout_ms, assertions_json,
                         extractions_json, position, created_at, updated_at
                     )
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     RETURNING *",
                )
                .bind(new_id())
                .bind(&input.collection_id)
                .bind(&input.folder_id)
                .bind(&name)
                .bind(&input.method)
                .bind(&input.url)
                .bind(&params_json)
                .bind(&headers_json)
                .bind(&input.body_mode)
                .bind(&body)
                .bind(&form_json)
                .bind(input.auth.kind())
                .bind(input.auth.username())
                .bind(&input.auth_secret_ref)
                .bind(input.timeout_ms)
                .bind(&assertions_json)
                .bind(&extractions_json)
                .bind(position)
                .bind(timestamp)
                .bind(timestamp)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_error)?
            }
        };

        Ok(map_saved_request(&row))
    }

    pub async fn get_request(&self, id: &str) -> Result<SavedRequest, ApplicationError> {
        let row = sqlx::query(
            "SELECT saved_request.* FROM saved_request
             JOIN collection ON collection.id = saved_request.collection_id
             WHERE saved_request.id = ? AND collection.workspace_id = ?",
        )
        .bind(id)
        .bind(&self.workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(ApplicationError::not_found)?;

        Ok(map_saved_request(&row))
    }

    pub async fn rename_request(
        &self,
        id: &str,
        name: &str,
    ) -> Result<RequestSummary, ApplicationError> {
        let name = validate_name(name)?;
        let row = sqlx::query(
            "UPDATE saved_request SET name = ?, updated_at = ? WHERE id = ? RETURNING *",
        )
        .bind(&name)
        .bind(now_ms())
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(ApplicationError::not_found)?;

        Ok(map_request_summary(&row))
    }

    pub async fn duplicate_request(&self, id: &str) -> Result<SavedRequest, ApplicationError> {
        let source = self.get_request(id).await?;
        let position = self
            .next_request_position(&source.collection_id, source.folder_id.as_deref())
            .await?;
        let timestamp = now_ms();

        let row = sqlx::query(
            "INSERT INTO saved_request (
                 id, collection_id, folder_id, name, method, url,
                 params_json, headers_json, body_mode, body, form_json,
                 auth_type, auth_username, auth_secret_ref, timeout_ms, assertions_json,
                 extractions_json, position, created_at, updated_at
             )
             SELECT ?, collection_id, folder_id, ?, method, url,
                    params_json, headers_json, body_mode, body, form_json,
                    auth_type, auth_username, auth_secret_ref, timeout_ms, assertions_json,
                    extractions_json, ?, ?, ?
             FROM saved_request WHERE id = ?
             RETURNING *",
        )
        .bind(new_id())
        .bind(truncate_name(&source.name))
        .bind(position)
        .bind(timestamp)
        .bind(timestamp)
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(map_saved_request(&row))
    }

    pub async fn set_request_auth_secret_ref(
        &self,
        id: &str,
        secret_ref: Option<&str>,
    ) -> Result<(), ApplicationError> {
        let result = sqlx::query(
            "UPDATE saved_request SET auth_secret_ref = ?, updated_at = ? WHERE id = ?",
        )
        .bind(secret_ref)
        .bind(now_ms())
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        Ok(())
    }

    pub async fn move_request(
        &self,
        id: &str,
        collection_id: &str,
        folder_id: Option<&str>,
        position: i64,
    ) -> Result<(), ApplicationError> {
        self.assert_collection_exists(collection_id).await?;
        if let Some(folder_id) = folder_id {
            self.assert_folder_in_collection(folder_id, collection_id)
                .await?;
        }

        let (source_collection_id, source_folder_id, source_position): (
            String,
            Option<String>,
            i64,
        ) = sqlx::query_as(
            "SELECT collection_id, folder_id, position FROM saved_request WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(ApplicationError::not_found)?;

        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query("UPDATE saved_request SET position = position - 1 WHERE collection_id = ? AND folder_id IS ? AND id <> ? AND position > ?")
            .bind(&source_collection_id).bind(&source_folder_id).bind(id).bind(source_position)
            .execute(&mut *tx).await.map_err(map_sqlx_error)?;
        let destination_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM saved_request WHERE collection_id = ? AND folder_id IS ? AND id <> ?")
            .bind(collection_id).bind(folder_id).bind(id).fetch_one(&mut *tx).await.map_err(map_sqlx_error)?;
        let same_parent =
            source_collection_id == collection_id && source_folder_id.as_deref() == folder_id;
        let desired_position = if same_parent && source_position < position {
            position.saturating_sub(1)
        } else {
            position
        }
        .clamp(0, destination_count);
        sqlx::query("UPDATE saved_request SET position = position + 1 WHERE collection_id = ? AND folder_id IS ? AND id <> ? AND position >= ?")
            .bind(collection_id).bind(folder_id).bind(id).bind(desired_position)
            .execute(&mut *tx).await.map_err(map_sqlx_error)?;
        let updated = sqlx::query(
            "UPDATE saved_request SET collection_id = ?, folder_id = ?, position = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(collection_id)
        .bind(folder_id)
        .bind(desired_position)
        .bind(now_ms())
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if updated.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }

        resequence_requests(&mut tx, &source_collection_id, source_folder_id.as_deref()).await?;
        if !same_parent {
            resequence_requests(&mut tx, collection_id, folder_id).await?;
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(())
    }

    pub async fn delete_request(&self, id: &str) -> Result<(), ApplicationError> {
        let result = sqlx::query(
            "DELETE FROM saved_request WHERE id IN (
                 SELECT saved_request.id FROM saved_request
                 JOIN collection ON collection.id = saved_request.collection_id
                 WHERE saved_request.id = ? AND collection.workspace_id = ?
             )",
        )
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

    async fn next_request_position(
        &self,
        collection_id: &str,
        folder_id: Option<&str>,
    ) -> Result<i64, ApplicationError> {
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM saved_request
             WHERE collection_id = ? AND folder_id IS ?",
        )
        .bind(collection_id)
        .bind(folder_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)
    }
}

/// Keeps a duplicated name inside the column limit instead of failing the copy.
fn truncate_name(name: &str) -> String {
    let suffix = " copy";
    let budget = super::models::MAX_NAME_LENGTH - suffix.len();
    let base: String = name.chars().take(budget).collect();
    format!("{base}{suffix}")
}

async fn resequence_requests(
    tx: &mut Transaction<'_, Sqlite>,
    collection_id: &str,
    folder_id: Option<&str>,
) -> Result<(), ApplicationError> {
    sqlx::query(
        "WITH ordered AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS seq
             FROM saved_request WHERE collection_id = ? AND folder_id IS ?
         )
         UPDATE saved_request SET position = (SELECT seq FROM ordered WHERE ordered.id = saved_request.id)
         WHERE id IN (SELECT id FROM ordered)",
    )
    .bind(collection_id)
    .bind(folder_id)
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}
