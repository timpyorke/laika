//! Tauri command surface for the workspace.
//!
//! Every function here is a thin adapter: translate arguments, call one
//! repository method, return the contract type. Business rules belong in the
//! repository modules.

use super::history::{HistoryDraft, HistoryResponse};
use super::models::{
    Collection, Folder, HistoryEntry, HistorySummary, KeyValueRecord, RequestSnapshot,
    RequestSummary, SaveRequestInput, SavedRequest, WorkspaceTree,
};
use super::StoreHandle;
use crate::error::ApplicationError;
use crate::http::{
    HttpEngine, HttpRequestInput, HttpResponseOutput, KeyValueEntry, RequestAuth, RequestBody,
};
use tauri::State;

/// Runs the request, then records it. History is best-effort: a storage failure
/// is swallowed so it can never turn a successful response into an error.
#[tauri::command]
pub async fn execute_http_request(
    engine: State<'_, HttpEngine>,
    store: State<'_, StoreHandle>,
    request: HttpRequestInput,
) -> Result<HttpResponseOutput, ApplicationError> {
    let draft = HistoryDraft {
        request_id: request.saved_request_id.clone(),
        name: request
            .name
            .clone()
            .unwrap_or_else(|| "Untitled request".to_owned()),
        snapshot: snapshot_of(&request),
    };
    let result = engine.execute(request).await;

    let outcome = match &result {
        Ok(response) => Some(Ok(history_response(response))),
        // A request rejected before it was sent is a form error, not history.
        Err(error) if error.code.is_pre_flight() => None,
        Err(error) => Some(Err(error.code.as_str())),
    };
    if let (Some(outcome), Ok(store)) = (outcome, store.get()) {
        let _ = store.record_execution(draft, outcome).await;
    }

    result
}

#[tauri::command]
pub fn cancel_http_request(engine: State<'_, HttpEngine>, request_id: String) -> bool {
    engine.cancel(&request_id)
}

#[tauri::command]
pub async fn load_workspace_tree(
    store: State<'_, StoreHandle>,
) -> Result<WorkspaceTree, ApplicationError> {
    store.get()?.load_tree().await
}

#[tauri::command]
pub async fn create_collection(
    store: State<'_, StoreHandle>,
    name: String,
) -> Result<Collection, ApplicationError> {
    store.get()?.create_collection(&name).await
}

#[tauri::command]
pub async fn rename_collection(
    store: State<'_, StoreHandle>,
    id: String,
    name: String,
) -> Result<Collection, ApplicationError> {
    store.get()?.rename_collection(&id, &name).await
}

#[tauri::command]
pub async fn delete_collection(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<(), ApplicationError> {
    store.get()?.delete_collection(&id).await
}

#[tauri::command]
pub async fn create_folder(
    store: State<'_, StoreHandle>,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<Folder, ApplicationError> {
    store
        .get()?
        .create_folder(&collection_id, parent_id.as_deref(), &name)
        .await
}

#[tauri::command]
pub async fn rename_folder(
    store: State<'_, StoreHandle>,
    id: String,
    name: String,
) -> Result<Folder, ApplicationError> {
    store.get()?.rename_folder(&id, &name).await
}

#[tauri::command]
pub async fn delete_folder(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<(), ApplicationError> {
    store.get()?.delete_folder(&id).await
}

#[tauri::command]
pub async fn move_folder(
    store: State<'_, StoreHandle>,
    id: String,
    collection_id: String,
    parent_id: Option<String>,
    position: i64,
) -> Result<(), ApplicationError> {
    store
        .get()?
        .move_folder(&id, &collection_id, parent_id.as_deref(), position)
        .await
}

#[tauri::command]
pub async fn save_request(
    store: State<'_, StoreHandle>,
    request: SaveRequestInput,
) -> Result<SavedRequest, ApplicationError> {
    store.get()?.save_request(request).await
}

#[tauri::command]
pub async fn get_saved_request(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<SavedRequest, ApplicationError> {
    store.get()?.get_request(&id).await
}

#[tauri::command]
pub async fn rename_request(
    store: State<'_, StoreHandle>,
    id: String,
    name: String,
) -> Result<RequestSummary, ApplicationError> {
    store.get()?.rename_request(&id, &name).await
}

#[tauri::command]
pub async fn duplicate_request(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<SavedRequest, ApplicationError> {
    store.get()?.duplicate_request(&id).await
}

#[tauri::command]
pub async fn move_request(
    store: State<'_, StoreHandle>,
    id: String,
    collection_id: String,
    folder_id: Option<String>,
    position: i64,
) -> Result<(), ApplicationError> {
    store
        .get()?
        .move_request(&id, &collection_id, folder_id.as_deref(), position)
        .await
}

#[tauri::command]
pub async fn delete_request(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<(), ApplicationError> {
    store.get()?.delete_request(&id).await
}

#[tauri::command]
pub async fn list_history(
    store: State<'_, StoreHandle>,
    query: Option<String>,
    limit: i64,
    offset: i64,
) -> Result<Vec<HistorySummary>, ApplicationError> {
    store
        .get()?
        .list_history(query.as_deref(), limit, offset)
        .await
}

#[tauri::command]
pub async fn get_history_entry(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<HistoryEntry, ApplicationError> {
    store.get()?.get_history_entry(&id).await
}

#[tauri::command]
pub async fn delete_history_entry(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<(), ApplicationError> {
    store.get()?.delete_history_entry(&id).await
}

#[tauri::command]
pub async fn clear_history(store: State<'_, StoreHandle>) -> Result<u64, ApplicationError> {
    store.get()?.clear_history().await
}

/// Builds the persistable view of an outgoing request. Bearer tokens and basic
/// passwords have no field to land in; header and body redaction is applied by
/// the store when the row is written.
fn snapshot_of(input: &HttpRequestInput) -> RequestSnapshot {
    let (body_mode, body, form) = match &input.body {
        RequestBody::None => ("none", String::new(), Vec::new()),
        RequestBody::Json { content } => ("json", content.clone(), Vec::new()),
        RequestBody::Text { content } => ("text", content.clone(), Vec::new()),
        RequestBody::Form { entries } => ("form", String::new(), to_records(entries)),
    };
    let (auth_type, auth_username) = match &input.auth {
        RequestAuth::None => ("none", String::new()),
        RequestAuth::Bearer { .. } => ("bearer", String::new()),
        RequestAuth::Basic { username, .. } => ("basic", username.clone()),
    };

    RequestSnapshot {
        method: input.method.as_str().to_owned(),
        url: input.url.clone(),
        params: to_records(&input.params),
        headers: to_records(&input.headers),
        body_mode: body_mode.to_owned(),
        body,
        form,
        auth_type: auth_type.to_owned(),
        auth_username,
        timeout_ms: input.timeout_ms as i64,
    }
}

fn to_records(entries: &[KeyValueEntry]) -> Vec<KeyValueRecord> {
    entries
        .iter()
        .map(|entry| KeyValueRecord {
            enabled: entry.enabled,
            key: entry.key.clone(),
            value: entry.value.clone(),
        })
        .collect()
}

fn history_response(response: &HttpResponseOutput) -> HistoryResponse {
    HistoryResponse {
        status: i64::from(response.status),
        status_text: response.status_text.clone(),
        elapsed_ms: response.elapsed_ms as i64,
        size_bytes: response.size_bytes as i64,
        headers: response
            .headers
            .iter()
            .map(|header| KeyValueRecord {
                enabled: true,
                key: header.name.clone(),
                value: header.value.clone(),
            })
            .collect(),
        body: response.body.clone(),
        truncated: response.truncated,
    }
}
