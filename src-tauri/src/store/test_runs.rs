use super::models::encode_json;
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;
use crate::testing::{AssertionResult, ExtractionResult, TestCaseResult, TestRun, TestRunSummary};
use sqlx::Row;

impl Store {
    pub async fn save_test_run(&self, run: &TestRun) -> Result<(), ApplicationError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query(
            "INSERT INTO test_run (
                 id, workspace_id, collection_id, collection_name, environment_id,
                 environment_name, status, total_requests, passed_requests,
                 failed_requests, duration_ms, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&run.summary.id)
        .bind(&self.workspace_id)
        .bind(&run.summary.collection_id)
        .bind(&run.summary.collection_name)
        .bind(&run.summary.environment_id)
        .bind(&run.summary.environment_name)
        .bind(&run.summary.status)
        .bind(run.summary.total_requests)
        .bind(run.summary.passed_requests)
        .bind(run.summary.failed_requests)
        .bind(run.summary.duration_ms)
        .bind(run.summary.created_at)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        for result in &run.results {
            sqlx::query(
                "INSERT INTO test_case_result (
                     id, run_id, request_id, request_name, method, url, status,
                     response_status, elapsed_ms, error_code, assertion_results_json,
                     extraction_results_json, position
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&result.id)
            .bind(&run.summary.id)
            .bind(&result.request_id)
            .bind(&result.request_name)
            .bind(&result.method)
            .bind(&result.url)
            .bind(&result.status)
            .bind(result.response_status.map(i64::from))
            .bind(
                result
                    .elapsed_ms
                    .and_then(|value| i64::try_from(value).ok()),
            )
            .bind(&result.error_code)
            .bind(encode_json(&result.assertion_results)?)
            .bind(encode_json(&result.extraction_results)?)
            .bind(result.position)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        self.trim_test_runs().await
    }

    pub async fn list_test_runs(
        &self,
        limit: i64,
    ) -> Result<Vec<TestRunSummary>, ApplicationError> {
        let rows = sqlx::query(
            "SELECT * FROM test_run WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(&self.workspace_id)
        .bind(limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(rows.iter().map(map_run_summary).collect())
    }

    pub async fn get_test_run(&self, id: &str) -> Result<TestRun, ApplicationError> {
        let row = sqlx::query("SELECT * FROM test_run WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(ApplicationError::not_found)?;
        let result_rows =
            sqlx::query("SELECT * FROM test_case_result WHERE run_id = ? ORDER BY position")
                .bind(id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        let results = result_rows
            .iter()
            .map(|row| TestCaseResult {
                id: row.get("id"),
                request_id: row.get("request_id"),
                request_name: row.get("request_name"),
                method: row.get("method"),
                url: row.get("url"),
                status: row.get("status"),
                response_status: row
                    .get::<Option<i64>, _>("response_status")
                    .and_then(|value| u16::try_from(value).ok()),
                elapsed_ms: row
                    .get::<Option<i64>, _>("elapsed_ms")
                    .and_then(|value| u64::try_from(value).ok()),
                error_code: row.get("error_code"),
                assertion_results: serde_json::from_str::<Vec<AssertionResult>>(
                    row.get::<String, _>("assertion_results_json").as_str(),
                )
                .unwrap_or_default(),
                extraction_results: serde_json::from_str::<Vec<ExtractionResult>>(
                    row.get::<String, _>("extraction_results_json").as_str(),
                )
                .unwrap_or_default(),
                position: row.get("position"),
            })
            .collect();
        Ok(TestRun {
            summary: map_run_summary(&row),
            results,
        })
    }

    pub async fn collection_name(&self, id: &str) -> Result<String, ApplicationError> {
        sqlx::query_scalar("SELECT name FROM collection WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(ApplicationError::not_found)
    }

    pub async fn environment_name(
        &self,
        id: Option<&str>,
    ) -> Result<Option<String>, ApplicationError> {
        let Some(id) = id else {
            return Ok(None);
        };
        sqlx::query_scalar("SELECT name FROM environment WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .ok_or_else(ApplicationError::not_found)
            .map(Some)
    }

    pub async fn collection_requests(
        &self,
        id: &str,
    ) -> Result<Vec<super::models::SavedRequest>, ApplicationError> {
        let rows = sqlx::query(
            "SELECT saved_request.* FROM saved_request
             JOIN collection ON collection.id = saved_request.collection_id
             LEFT JOIN folder ON folder.id = saved_request.folder_id
             WHERE saved_request.collection_id = ? AND collection.workspace_id = ?
             ORDER BY COALESCE(folder.position, -1), saved_request.position, saved_request.created_at",
        )
        .bind(id)
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(rows.iter().map(super::models::map_saved_request).collect())
    }

    async fn trim_test_runs(&self) -> Result<(), ApplicationError> {
        sqlx::query(
            "DELETE FROM test_run WHERE workspace_id = ?1 AND id NOT IN (
                 SELECT id FROM test_run WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT 100
             )",
        )
        .bind(&self.workspace_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }
}

fn map_run_summary(row: &sqlx::sqlite::SqliteRow) -> TestRunSummary {
    TestRunSummary {
        id: row.get("id"),
        collection_id: row.get("collection_id"),
        collection_name: row.get("collection_name"),
        environment_id: row.get("environment_id"),
        environment_name: row.get("environment_name"),
        status: row.get("status"),
        total_requests: row.get("total_requests"),
        passed_requests: row.get("passed_requests"),
        failed_requests: row.get("failed_requests"),
        duration_ms: row.get("duration_ms"),
        created_at: row.get("created_at"),
    }
}
