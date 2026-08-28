use super::models::{
    new_id, now_ms, validate_name, Environment, EnvironmentState, EnvironmentVariable,
    PersistVariableInput, StoredVariable,
};
use super::{map_sqlx_error, Store};
use crate::error::ApplicationError;
use sqlx::Row;
use std::collections::BTreeMap;

impl Store {
    pub async fn load_environment_state(&self) -> Result<EnvironmentState, ApplicationError> {
        let environments = sqlx::query(
            "SELECT id, name, position FROM environment WHERE workspace_id = ? ORDER BY position, created_at",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .iter()
        .map(|row| Environment {
            id: row.get("id"),
            name: row.get("name"),
            position: row.get("position"),
        })
        .collect();
        let variables = sqlx::query(
            "SELECT id, environment_id, name, value, is_secret, secret_ref FROM environment_variable WHERE workspace_id = ? ORDER BY environment_id, name COLLATE NOCASE",
        )
        .bind(&self.workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .iter()
        .map(map_variable)
        .collect();
        let active_environment_id =
            sqlx::query_scalar("SELECT active_environment_id FROM workspace WHERE id = ?")
                .bind(&self.workspace_id)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        Ok(EnvironmentState {
            environments,
            variables,
            active_environment_id,
        })
    }

    pub async fn create_environment(&self, name: &str) -> Result<Environment, ApplicationError> {
        let name = validate_name(name)?;
        let id = new_id();
        let now = now_ms();
        let position: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position) + 1, 0) FROM environment WHERE workspace_id = ?",
        )
        .bind(&self.workspace_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        sqlx::query("INSERT INTO environment (id, workspace_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(&id).bind(&self.workspace_id).bind(&name).bind(position).bind(now).bind(now)
            .execute(&self.pool).await.map_err(map_sqlx_error)?;
        Ok(Environment { id, name, position })
    }

    pub async fn rename_environment(
        &self,
        id: &str,
        name: &str,
    ) -> Result<Environment, ApplicationError> {
        let name = validate_name(name)?;
        let result = sqlx::query(
            "UPDATE environment SET name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
        )
        .bind(&name)
        .bind(now_ms())
        .bind(id)
        .bind(&self.workspace_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        let position = sqlx::query_scalar("SELECT position FROM environment WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(Environment {
            id: id.to_owned(),
            name,
            position,
        })
    }

    pub async fn delete_environment(&self, id: &str) -> Result<Vec<String>, ApplicationError> {
        let refs = sqlx::query_scalar(
            "SELECT secret_ref FROM environment_variable WHERE environment_id = ? AND workspace_id = ? AND secret_ref IS NOT NULL",
        )
        .bind(id).bind(&self.workspace_id).fetch_all(&self.pool).await.map_err(map_sqlx_error)?;
        let result = sqlx::query("DELETE FROM environment WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        Ok(refs)
    }

    pub async fn set_active_environment(&self, id: Option<&str>) -> Result<(), ApplicationError> {
        if let Some(id) = id {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM environment WHERE id = ? AND workspace_id = ?)",
            )
            .bind(id)
            .bind(&self.workspace_id)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
            if !exists {
                return Err(ApplicationError::not_found());
            }
        }
        sqlx::query("UPDATE workspace SET active_environment_id = ?, updated_at = ? WHERE id = ?")
            .bind(id)
            .bind(now_ms())
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(())
    }

    pub async fn get_variable_secret_ref(
        &self,
        id: &str,
    ) -> Result<Option<String>, ApplicationError> {
        let row = sqlx::query(
            "SELECT secret_ref FROM environment_variable WHERE id = ? AND workspace_id = ?",
        )
        .bind(id)
        .bind(&self.workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(ApplicationError::not_found)?;
        Ok(row.get("secret_ref"))
    }

    pub async fn save_variable(
        &self,
        input: PersistVariableInput,
    ) -> Result<EnvironmentVariable, ApplicationError> {
        let name = validate_variable_name(&input.name)?;
        if let Some(environment_id) = input.environment_id.as_deref() {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM environment WHERE id = ? AND workspace_id = ?)",
            )
            .bind(environment_id)
            .bind(&self.workspace_id)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
            if !exists {
                return Err(ApplicationError::not_found());
            }
        }
        let id = input.id.unwrap_or_else(new_id);
        let now = now_ms();
        let value = if input.is_secret {
            ""
        } else {
            input.value.as_str()
        };
        let secret_ref = if input.is_secret {
            input.secret_ref.as_deref()
        } else {
            None
        };
        let result = sqlx::query(
            "INSERT INTO environment_variable (id, workspace_id, environment_id, name, value, is_secret, secret_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET environment_id = excluded.environment_id, name = excluded.name, value = excluded.value, is_secret = excluded.is_secret, secret_ref = excluded.secret_ref, updated_at = excluded.updated_at WHERE environment_variable.workspace_id = excluded.workspace_id",
        )
        .bind(&id).bind(&self.workspace_id).bind(&input.environment_id).bind(name)
        .bind(value).bind(input.is_secret).bind(secret_ref).bind(now).bind(now)
        .execute(&self.pool).await.map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(ApplicationError::not_found());
        }
        let row = sqlx::query("SELECT id, environment_id, name, value, is_secret, secret_ref FROM environment_variable WHERE id = ?")
            .bind(&id).fetch_one(&self.pool).await.map_err(map_sqlx_error)?;
        Ok(map_variable(&row))
    }

    pub async fn delete_variable(&self, id: &str) -> Result<Option<String>, ApplicationError> {
        let secret_ref = self.get_variable_secret_ref(id).await?;
        sqlx::query("DELETE FROM environment_variable WHERE id = ? AND workspace_id = ?")
            .bind(id)
            .bind(&self.workspace_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_error)?;
        Ok(secret_ref)
    }

    pub async fn effective_variables(
        &self,
    ) -> Result<BTreeMap<String, StoredVariable>, ApplicationError> {
        let active: Option<String> =
            sqlx::query_scalar("SELECT active_environment_id FROM workspace WHERE id = ?")
                .bind(&self.workspace_id)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_error)?;
        let rows = sqlx::query(
            "SELECT name, value, is_secret, secret_ref, environment_id FROM environment_variable WHERE workspace_id = ? AND (environment_id IS NULL OR environment_id = ?) ORDER BY CASE WHEN environment_id IS NULL THEN 0 ELSE 1 END",
        )
        .bind(&self.workspace_id).bind(active).fetch_all(&self.pool).await.map_err(map_sqlx_error)?;
        let mut variables = BTreeMap::new();
        for row in rows {
            let name: String = row.get("name");
            variables.insert(
                name,
                StoredVariable {
                    value: row.get("value"),
                    is_secret: row.get("is_secret"),
                    secret_ref: row.get("secret_ref"),
                },
            );
        }
        Ok(variables)
    }
}

fn validate_variable_name(name: &str) -> Result<String, ApplicationError> {
    let name = name.trim();
    let mut chars = name.chars();
    let valid_first = chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
    if !valid_first
        || name.len() > 200
        || !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err(ApplicationError::invalid_variable());
    }
    Ok(name.to_owned())
}

fn map_variable(row: &sqlx::sqlite::SqliteRow) -> EnvironmentVariable {
    let is_secret: bool = row.get("is_secret");
    let secret_ref: Option<String> = row.get("secret_ref");
    EnvironmentVariable {
        id: row.get("id"),
        environment_id: row.get("environment_id"),
        name: row.get("name"),
        value: if is_secret {
            String::new()
        } else {
            row.get("value")
        },
        is_secret,
        has_secret: secret_ref.is_some(),
    }
}
