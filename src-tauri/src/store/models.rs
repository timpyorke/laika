use crate::error::ApplicationError;
use crate::testing::RequestAssertion;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row};

/// Largest request or response body kept in SQLite. Anything longer is stored
/// truncated so that a single huge payload cannot bloat the workspace file.
pub const MAX_STORED_BODY_BYTES: usize = 1024 * 1024;
/// Number of history entries kept per workspace; older rows are trimmed after
/// every insert.
pub const HISTORY_RETENTION_LIMIT: i64 = 1_000;
pub const MAX_NAME_LENGTH: usize = 200;

/// Header names whose values are dropped before anything is written to SQLite.
/// Phase 4 replaces this with real secret references; until then the safe
/// behaviour is to keep the header name and forget the value.
const SENSITIVE_HEADERS: [&str; 5] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueRecord {
    pub enabled: bool,
    pub key: String,
    pub value: String,
}

/// Only the non-secret half of an authentication configuration. Bearer tokens
/// and basic passwords never reach this layer.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthRecord {
    None,
    Bearer,
    Basic { username: String },
}

impl AuthRecord {
    pub fn kind(&self) -> &'static str {
        match self {
            AuthRecord::None => "none",
            AuthRecord::Bearer => "bearer",
            AuthRecord::Basic { .. } => "basic",
        }
    }

    pub fn username(&self) -> &str {
        match self {
            AuthRecord::Basic { username } => username,
            _ => "",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub collection_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSummary {
    pub id: String,
    pub collection_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub position: i64,
}

/// The whole tree in one payload. Collections, folders, and requests are
/// returned flat; the UI assembles the hierarchy, which keeps the SQL free of
/// recursive queries.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTree {
    pub workspace_id: String,
    pub collections: Vec<Collection>,
    pub folders: Vec<Folder>,
    pub requests: Vec<RequestSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub position: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVariable {
    pub id: String,
    pub environment_id: Option<String>,
    pub name: String,
    /// Always empty for secret variables.
    pub value: String,
    pub is_secret: bool,
    pub has_secret: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentState {
    pub environments: Vec<Environment>,
    pub variables: Vec<EnvironmentVariable>,
    pub active_environment_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVariableInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Clone, Debug)]
pub struct StoredVariable {
    pub value: String,
    pub is_secret: bool,
    pub secret_ref: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PersistVariableInput {
    pub id: Option<String>,
    pub environment_id: Option<String>,
    pub name: String,
    pub value: String,
    pub is_secret: bool,
    pub secret_ref: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: String,
    pub collection_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub params: Vec<KeyValueRecord>,
    pub headers: Vec<KeyValueRecord>,
    pub body_mode: String,
    pub body: String,
    pub form: Vec<KeyValueRecord>,
    pub auth: AuthRecord,
    pub has_auth_secret: bool,
    #[serde(skip)]
    pub auth_secret_ref: Option<String>,
    pub timeout_ms: i64,
    pub assertions: Vec<RequestAssertion>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequestInput {
    /// `None` creates a new request; `Some` updates the existing one.
    #[serde(default)]
    pub id: Option<String>,
    pub collection_id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValueRecord>,
    #[serde(default)]
    pub headers: Vec<KeyValueRecord>,
    pub body_mode: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub form: Vec<KeyValueRecord>,
    pub auth: AuthRecord,
    #[serde(skip)]
    pub auth_secret_ref: Option<String>,
    pub timeout_ms: i64,
    #[serde(default)]
    pub assertions: Vec<RequestAssertion>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequestCommandInput {
    #[serde(flatten)]
    pub request: SaveRequestInput,
    #[serde(default)]
    pub auth_secret: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub id: String,
    pub request_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub status: Option<i64>,
    pub status_text: Option<String>,
    pub elapsed_ms: Option<i64>,
    pub size_bytes: Option<i64>,
    pub error_code: Option<String>,
    pub created_at: i64,
}

/// The redacted copy of a request as it was executed, stored on the history row
/// so the entry can be reopened even after the saved request changed or was
/// deleted.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSnapshot {
    pub method: String,
    pub url: String,
    pub params: Vec<KeyValueRecord>,
    pub headers: Vec<KeyValueRecord>,
    pub body_mode: String,
    pub body: String,
    pub form: Vec<KeyValueRecord>,
    pub auth_type: String,
    pub auth_username: String,
    pub timeout_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    #[serde(flatten)]
    pub summary: HistorySummary,
    pub request: RequestSnapshot,
    pub response_headers: Vec<KeyValueRecord>,
    pub response_body: Option<String>,
    pub response_truncated: bool,
}

/// Drops the values of well-known credential headers before anything is written
/// to SQLite, keeping the header name so the row still describes the request.
pub fn redact_entries(entries: &[KeyValueRecord]) -> Vec<KeyValueRecord> {
    entries
        .iter()
        .map(|entry| {
            let sensitive =
                SENSITIVE_HEADERS.contains(&entry.key.trim().to_ascii_lowercase().as_str());
            KeyValueRecord {
                enabled: entry.enabled,
                key: entry.key.clone(),
                value: if sensitive {
                    String::new()
                } else {
                    entry.value.clone()
                },
            }
        })
        .collect()
}

pub fn truncate_body(body: &str) -> (String, bool) {
    if body.len() <= MAX_STORED_BODY_BYTES {
        return (body.to_owned(), false);
    }
    let mut end = MAX_STORED_BODY_BYTES;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    (body[..end].to_owned(), true)
}

pub fn validate_name(name: &str) -> Result<String, ApplicationError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(ApplicationError::invalid_input());
    }
    Ok(trimmed.to_owned())
}

pub fn encode_json<T: Serialize>(value: &T) -> Result<String, ApplicationError> {
    serde_json::to_string(value).map_err(|_| ApplicationError::database())
}

/// Decoding never fails the caller: a row written by an older or corrupted
/// build degrades to an empty value rather than making the workspace unreadable.
pub fn decode_entries(raw: &str) -> Vec<KeyValueRecord> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

pub fn map_collection(row: &SqliteRow) -> Collection {
    Collection {
        id: row.get("id"),
        name: row.get("name"),
        description: row.get("description"),
        position: row.get("position"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub fn map_folder(row: &SqliteRow) -> Folder {
    Folder {
        id: row.get("id"),
        collection_id: row.get("collection_id"),
        parent_id: row.get("parent_id"),
        name: row.get("name"),
        position: row.get("position"),
    }
}

pub fn map_request_summary(row: &SqliteRow) -> RequestSummary {
    RequestSummary {
        id: row.get("id"),
        collection_id: row.get("collection_id"),
        folder_id: row.get("folder_id"),
        name: row.get("name"),
        method: row.get("method"),
        url: row.get("url"),
        position: row.get("position"),
    }
}

pub fn map_saved_request(row: &SqliteRow) -> SavedRequest {
    let auth_type: String = row.get("auth_type");
    let auth = match auth_type.as_str() {
        "bearer" => AuthRecord::Bearer,
        "basic" => AuthRecord::Basic {
            username: row.get("auth_username"),
        },
        _ => AuthRecord::None,
    };
    let auth_secret_ref: Option<String> = row.get("auth_secret_ref");
    SavedRequest {
        id: row.get("id"),
        collection_id: row.get("collection_id"),
        folder_id: row.get("folder_id"),
        name: row.get("name"),
        method: row.get("method"),
        url: row.get("url"),
        params: decode_entries(row.get::<String, _>("params_json").as_str()),
        headers: decode_entries(row.get::<String, _>("headers_json").as_str()),
        body_mode: row.get("body_mode"),
        body: row.get("body"),
        form: decode_entries(row.get::<String, _>("form_json").as_str()),
        auth,
        has_auth_secret: auth_secret_ref.is_some(),
        auth_secret_ref,
        timeout_ms: row.get("timeout_ms"),
        assertions: serde_json::from_str(row.get::<String, _>("assertions_json").as_str())
            .unwrap_or_default(),
    }
}

pub fn map_history_summary(row: &SqliteRow) -> HistorySummary {
    HistorySummary {
        id: row.get("id"),
        request_id: row.get("request_id"),
        name: row.get("name"),
        method: row.get("method"),
        url: row.get("url"),
        status: row.get("status"),
        status_text: row.get("status_text"),
        elapsed_ms: row.get("elapsed_ms"),
        size_bytes: row.get("size_bytes"),
        error_code: row.get("error_code"),
        created_at: row.get("created_at"),
    }
}
