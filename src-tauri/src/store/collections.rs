use super::models::{
    map_collection, map_folder, map_request_summary, new_id, now_ms, validate_name, Collection,
    Folder, WorkspaceTree,
};
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;
use sqlx::{Sqlite, Transaction};

impl Store {
    /// Loads every collection, folder, and request summary in one round trip.
    /// The tree is small enough that incremental loading would cost more in
    /// complexity than it saves.
    pub async fn load_tree(&self) -> Result<WorkspaceTree, ApplicationError> {
        let collections = sqlx::query(
            "SELECT * FROM collection WHERE workspace_id = ? ORDER BY position, created_at",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        let folders = sqlx::query(
            "SELECT folder.* FROM folder
             JOIN collection ON collection.id = folder.collection_id
             WHERE collection.workspace_id = ?
             ORDER BY folder.position, folder.created_at",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        let requests = sqlx::query(
            "SELECT saved_request.* FROM saved_request
             JOIN collection ON collection.id = saved_request.collection_id
             WHERE collection.workspace_id = ?
             ORDER BY saved_request.position, saved_request.created_at",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(WorkspaceTree {
            workspace_id: self.workspace_id.clone(),
            collections: collections.iter().map(map_collection).collect(),
            folders: folders.iter().map(map_folder).collect(),
            requests: requests.iter().map(map_request_summary).collect(),
        })
    }

    pub async fn create_collection(&self, name: &str) -> Result<Collection, ApplicationError> {
        let name = validate_name(name)?;
        let id = new_id();
        let timestamp = now_ms();
        let position: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM collection WHERE workspace_id = ?",
        )
        .bind(&self.workspace_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        let row = sqlx::query(
            "INSERT INTO collection (id, workspace_id, name, description, position, created_at, updated_at)
             VALUES (?, ?, ?, '', ?, ?, ?)
             RETURNING *",
        )
        .bind(&id)
        .bind(&self.workspace_id)
        .bind(&name)
        .bind(position)
        .bind(timestamp)
        .bind(timestamp)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(map_collection(&row))
    }

    pub async fn rename_collection(
        &self,
        id: &str,
        name: &str,
    ) -> Result<Collection, ApplicationError> {
        let name = validate_name(name)?;
        let row = sqlx::query(
            "UPDATE collection SET name = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ?
             RETURNING *",
        )
        .bind(&name)
        .bind(now_ms())
        .bind(id)
        .bind(&self.workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(ApplicationError::not_found)?;

        Ok(map_collection(&row))
    }

    /// Deletes a collection along with its folders and requests. History rows
    /// survive: their `request_id` is cleared by the schema instead of
    /// cascading.
    pub async fn delete_collection(&self, id: &str) -> Result<(), ApplicationError> {
        let result = sqlx::query("DELETE FROM collection WHERE id = ? AND workspace_id = ?")
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

    pub async fn create_folder(
        &self,
        collection_id: &str,
        parent_id: Option<&str>,
        name: &str,
    ) -> Result<Folder, ApplicationError> {
        let name = validate_name(name)?;
        self.assert_collection_exists(collection_id).await?;
        if let Some(parent_id) = parent_id {
            self.assert_folder_in_collection(parent_id, collection_id)
                .await?;
        }

        let id = new_id();
        let timestamp = now_ms();
        let position: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM folder
             WHERE collection_id = ? AND parent_id IS ?",
        )
        .bind(collection_id)
        .bind(parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        let row = sqlx::query(
            "INSERT INTO folder (id, collection_id, parent_id, name, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             RETURNING *",
        )
        .bind(&id)
        .bind(collection_id)
        .bind(parent_id)
        .bind(&name)
        .bind(position)
        .bind(timestamp)
        .bind(timestamp)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(map_folder(&row))
    }

    pub async fn rename_folder(&self, id: &str, name: &str) -> Result<Folder, ApplicationError> {
        let name = validate_name(name)?;
        let row =
            sqlx::query("UPDATE folder SET name = ?, updated_at = ? WHERE id = ? RETURNING *")
                .bind(&name)
                .bind(now_ms())
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?
                .ok_or_else(ApplicationError::not_found)?;

        Ok(map_folder(&row))
    }

    pub async fn delete_folder(&self, id: &str) -> Result<(), ApplicationError> {
        let result = sqlx::query("DELETE FROM folder WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        Ok(())
    }

    /// Moves a folder to another parent and/or ordinal position. Runs in one
    /// transaction so siblings are never left with duplicate positions.
    pub async fn move_folder(
        &self,
        id: &str,
        collection_id: &str,
        parent_id: Option<&str>,
        position: i64,
    ) -> Result<(), ApplicationError> {
        if parent_id == Some(id) || self.is_descendant_folder(parent_id, id).await? {
            return Err(ApplicationError::invalid_input());
        }
        self.assert_collection_exists(collection_id).await?;
        if let Some(parent_id) = parent_id {
            self.assert_folder_in_collection(parent_id, collection_id)
                .await?;
        }

        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let updated = sqlx::query(
            "UPDATE folder SET collection_id = ?, parent_id = ?, position = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(collection_id)
        .bind(parent_id)
        .bind(position.max(0) * 2)
        .bind(now_ms())
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if updated.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }

        // A moved subtree keeps its descendants, so they follow their new
        // collection.
        sqlx::query(
            "WITH RECURSIVE subtree(id) AS (
                 SELECT id FROM folder WHERE id = ?
                 UNION ALL
                 SELECT folder.id FROM folder JOIN subtree ON folder.parent_id = subtree.id
             )
             UPDATE folder SET collection_id = ? WHERE id IN (SELECT id FROM subtree)",
        )
        .bind(id)
        .bind(collection_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        sqlx::query(
            "WITH RECURSIVE subtree(id) AS (
                 SELECT id FROM folder WHERE id = ?
                 UNION ALL
                 SELECT folder.id FROM folder JOIN subtree ON folder.parent_id = subtree.id
             )
             UPDATE saved_request SET collection_id = ?
             WHERE folder_id IN (SELECT id FROM subtree)",
        )
        .bind(id)
        .bind(collection_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        resequence_folders(&mut tx, collection_id, parent_id).await?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(())
    }

    pub(super) async fn assert_collection_exists(
        &self,
        collection_id: &str,
    ) -> Result<(), ApplicationError> {
        let exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM collection WHERE id = ? AND workspace_id = ?")
                .bind(collection_id)
                .bind(&self.workspace_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        exists.map(|_| ()).ok_or_else(ApplicationError::not_found)
    }

    pub(super) async fn assert_folder_in_collection(
        &self,
        folder_id: &str,
        collection_id: &str,
    ) -> Result<(), ApplicationError> {
        let exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM folder WHERE id = ? AND collection_id = ?")
                .bind(folder_id)
                .bind(collection_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        exists
            .map(|_| ())
            .ok_or_else(ApplicationError::invalid_input)
    }

    /// Walks up from `candidate` to detect the cycle a move would create.
    async fn is_descendant_folder(
        &self,
        candidate: Option<&str>,
        ancestor: &str,
    ) -> Result<bool, ApplicationError> {
        let Some(candidate) = candidate else {
            return Ok(false);
        };
        let found: Option<(String,)> = sqlx::query_as(
            "WITH RECURSIVE ancestors(id, parent_id) AS (
                 SELECT id, parent_id FROM folder WHERE id = ?
                 UNION ALL
                 SELECT folder.id, folder.parent_id
                 FROM folder JOIN ancestors ON folder.id = ancestors.parent_id
             )
             SELECT id FROM ancestors WHERE id = ?",
        )
        .bind(candidate)
        .bind(ancestor)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(found.is_some())
    }
}

/// Rewrites sibling positions to a dense 0..n sequence. Move sets the incoming
/// row to `index * 2` so it lands between two existing rows before this runs.
pub(super) async fn resequence_folders(
    tx: &mut Transaction<'_, Sqlite>,
    collection_id: &str,
    parent_id: Option<&str>,
) -> Result<(), ApplicationError> {
    sqlx::query(
        "WITH ordered AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS seq
             FROM folder WHERE collection_id = ? AND parent_id IS ?
         )
         UPDATE folder SET position = (SELECT seq FROM ordered WHERE ordered.id = folder.id)
         WHERE id IN (SELECT id FROM ordered)",
    )
    .bind(collection_id)
    .bind(parent_id)
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;
    Ok(())
}
