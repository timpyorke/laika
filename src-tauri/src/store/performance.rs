use super::models::HISTORY_RETENTION_LIMIT;
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;

#[derive(Clone, Copy)]
pub(crate) struct FixtureProfile {
    pub collections: usize,
    pub folders_per_collection: usize,
    pub requests_per_folder: usize,
    pub history_entries: usize,
}

impl FixtureProfile {
    pub(crate) const TYPICAL: Self = Self {
        collections: 5,
        folders_per_collection: 5,
        requests_per_folder: 10,
        history_entries: 100,
    };

    pub(crate) const MAXIMUM: Self = Self {
        collections: 10,
        folders_per_collection: 10,
        requests_per_folder: 10,
        history_entries: HISTORY_RETENTION_LIMIT as usize,
    };
}

impl Store {
    /// Populates a deterministic, secret-free workspace without timing fixture
    /// construction as part of the operations under test.
    pub(crate) async fn seed_performance_fixture(
        &self,
        profile: FixtureProfile,
    ) -> Result<(), ApplicationError> {
        if profile.history_entries > HISTORY_RETENTION_LIMIT as usize {
            return Err(ApplicationError::invalid_input());
        }

        let mut transaction = self.pool.begin().await.map_err(map_sqlx_error)?;
        let timestamp = 1_700_000_000_000_i64;

        for collection_index in 0..profile.collections {
            let collection_id = format!("perf-collection-{collection_index:04}");
            sqlx::query(
                "INSERT INTO collection
                 (id, workspace_id, name, description, position, created_at, updated_at)
                 VALUES (?, ?, ?, '', ?, ?, ?)",
            )
            .bind(&collection_id)
            .bind(&self.workspace_id)
            .bind(format!("Collection {collection_index:04}"))
            .bind(collection_index as i64)
            .bind(timestamp)
            .bind(timestamp)
            .execute(&mut *transaction)
            .await
            .map_err(map_sqlx_error)?;

            for folder_index in 0..profile.folders_per_collection {
                let folder_id = format!("perf-folder-{collection_index:04}-{folder_index:04}");
                sqlx::query(
                    "INSERT INTO folder
                     (id, collection_id, parent_id, name, position, created_at, updated_at)
                     VALUES (?, ?, NULL, ?, ?, ?, ?)",
                )
                .bind(&folder_id)
                .bind(&collection_id)
                .bind(format!("Folder {collection_index:04}-{folder_index:04}"))
                .bind(folder_index as i64)
                .bind(timestamp)
                .bind(timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(map_sqlx_error)?;

                for request_index in 0..profile.requests_per_folder {
                    let request_id = format!(
                        "perf-request-{collection_index:04}-{folder_index:04}-{request_index:04}"
                    );
                    sqlx::query(
                        "INSERT INTO saved_request (
                            id, collection_id, folder_id, name, method, url,
                            params_json, headers_json, body_mode, body, form_json,
                            auth_type, auth_username, auth_secret_ref, timeout_ms,
                            assertions_json, position, created_at, updated_at
                         ) VALUES (?, ?, ?, ?, 'GET', ?, '[]', '[]', 'none', '',
                                   '[]', 'none', '', NULL, 30000, '[]', ?, ?, ?)",
                    )
                    .bind(&request_id)
                    .bind(&collection_id)
                    .bind(&folder_id)
                    .bind(format!(
                        "Request {collection_index:04}-{folder_index:04}-{request_index:04}"
                    ))
                    .bind(format!(
                        "https://api.example.test/{collection_index}/{folder_index}/{request_index}"
                    ))
                    .bind(request_index as i64)
                    .bind(timestamp)
                    .bind(timestamp)
                    .execute(&mut *transaction)
                    .await
                    .map_err(map_sqlx_error)?;
                }
            }
        }

        let request_json = r#"{"method":"GET","url":"https://api.example.test/orders","params":[],"headers":[],"bodyMode":"none","body":"","form":[],"authType":"none","authUsername":"","timeoutMs":30000}"#;
        for history_index in 0..profile.history_entries {
            let searchable = if history_index % 10 == 0 {
                "matching-order"
            } else {
                "request"
            };
            sqlx::query(
                "INSERT INTO history_entry (
                    id, workspace_id, request_id, name, method, url, request_json,
                    status, status_text, elapsed_ms, size_bytes,
                    response_headers_json, response_body, response_truncated,
                    error_code, created_at
                 ) VALUES (?, ?, NULL, ?, 'GET', ?, ?, 200, 'OK', 12, 34,
                           '[]', '{\"ok\":true}', 0, NULL, ?)",
            )
            .bind(format!("perf-history-{history_index:04}"))
            .bind(&self.workspace_id)
            .bind(format!("{searchable} {history_index:04}"))
            .bind(format!(
                "https://api.example.test/{searchable}/{history_index:04}"
            ))
            .bind(request_json)
            .bind(timestamp + history_index as i64)
            .execute(&mut *transaction)
            .await
            .map_err(map_sqlx_error)?;
        }

        transaction.commit().await.map_err(map_sqlx_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fixture_profiles_are_deterministic_and_respect_retention() {
        let typical = Store::open_in_memory().await.unwrap();
        typical
            .seed_performance_fixture(FixtureProfile::TYPICAL)
            .await
            .unwrap();
        let typical_tree = typical.load_tree().await.unwrap();
        assert_eq!(typical_tree.collections.len(), 5);
        assert_eq!(typical_tree.folders.len(), 25);
        assert_eq!(typical_tree.requests.len(), 250);
        assert_eq!(typical.list_history(None, 200, 0).await.unwrap().len(), 100);

        let store = Store::open_in_memory().await.unwrap();
        store
            .seed_performance_fixture(FixtureProfile::MAXIMUM)
            .await
            .unwrap();

        let tree = store.load_tree().await.unwrap();
        assert_eq!(tree.collections.len(), 10);
        assert_eq!(tree.folders.len(), 100);
        assert_eq!(tree.requests.len(), 1_000);

        let history = store.list_history(None, 200, 0).await.unwrap();
        assert_eq!(history.len(), 200);
        assert_eq!(history[0].name, "request 0999");
        let matches = store
            .list_history(Some("matching-order"), 200, 0)
            .await
            .unwrap();
        assert_eq!(matches.len(), 100);
    }
}
