use super::history::{HistoryDraft, HistoryResponse};
use super::models::{
    AuthRecord, KeyValueRecord, RequestSnapshot, SaveRequestInput, MAX_STORED_BODY_BYTES,
};
use super::Store;
use crate::error::ApplicationErrorCode;

fn entry(key: &str, value: &str) -> KeyValueRecord {
    KeyValueRecord {
        enabled: true,
        key: key.to_owned(),
        value: value.to_owned(),
    }
}

fn save_input(collection_id: &str, name: &str) -> SaveRequestInput {
    SaveRequestInput {
        id: None,
        collection_id: collection_id.to_owned(),
        folder_id: None,
        name: name.to_owned(),
        method: "GET".to_owned(),
        url: "https://example.com/users".to_owned(),
        params: vec![entry("page", "2")],
        headers: vec![entry("Accept", "application/json")],
        body_mode: "none".to_owned(),
        body: String::new(),
        form: Vec::new(),
        auth: AuthRecord::None,
        timeout_ms: 30_000,
    }
}

fn draft(name: &str, url: &str) -> HistoryDraft {
    HistoryDraft {
        request_id: None,
        name: name.to_owned(),
        snapshot: RequestSnapshot {
            method: "GET".to_owned(),
            url: url.to_owned(),
            timeout_ms: 30_000,
            ..RequestSnapshot::default()
        },
    }
}

fn response() -> HistoryResponse {
    HistoryResponse {
        status: 200,
        status_text: "OK".to_owned(),
        elapsed_ms: 12,
        size_bytes: 34,
        headers: vec![entry("content-type", "application/json")],
        body: "{\"ok\":true}".to_owned(),
        truncated: false,
    }
}

#[tokio::test]
async fn creates_schema_and_default_workspace() {
    let store = Store::open_in_memory().await.unwrap();
    let tree = store.load_tree().await.unwrap();

    assert!(!store.workspace_id.is_empty());
    assert_eq!(tree.workspace_id, store.workspace_id);
    assert!(tree.collections.is_empty());
    assert!(tree.folders.is_empty());
    assert!(tree.requests.is_empty());
}

/// Covers the "new database" and "already-migrated database" cases from the
/// Phase 3 definition of done: the second open must find the existing workspace
/// rather than migrating again or creating a duplicate.
#[tokio::test]
async fn migrations_are_idempotent_across_restarts() {
    let path = std::env::temp_dir().join(format!("laika-test-{}.db", super::models::new_id()));

    let first = Store::open(&path).await.unwrap();
    let workspace_id = first.workspace_id.clone();
    first.create_collection("Getting started").await.unwrap();
    drop(first);

    let second = Store::open(&path).await.unwrap();
    let tree = second.load_tree().await.unwrap();
    assert_eq!(second.workspace_id, workspace_id);
    assert_eq!(tree.collections.len(), 1);
    assert_eq!(tree.collections[0].name, "Getting started");
    drop(second);

    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}

#[tokio::test]
async fn saves_and_reopens_a_request() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let folder = store
        .create_folder(&collection.id, None, "Users")
        .await
        .unwrap();

    let mut input = save_input(&collection.id, "List users");
    input.folder_id = Some(folder.id.clone());
    let saved = store.save_request(input).await.unwrap();

    let reopened = store.get_request(&saved.id).await.unwrap();
    assert_eq!(reopened.name, "List users");
    assert_eq!(reopened.folder_id.as_deref(), Some(folder.id.as_str()));
    assert_eq!(reopened.params[0].key, "page");
    assert_eq!(reopened.headers[0].value, "application/json");

    let tree = store.load_tree().await.unwrap();
    assert_eq!(tree.collections.len(), 1);
    assert_eq!(tree.folders.len(), 1);
    assert_eq!(tree.requests.len(), 1);
    assert_eq!(tree.requests[0].method, "GET");
}

#[tokio::test]
async fn updates_an_existing_request_instead_of_inserting() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let saved = store
        .save_request(save_input(&collection.id, "List users"))
        .await
        .unwrap();

    let mut update = save_input(&collection.id, "List active users");
    update.id = Some(saved.id.clone());
    update.method = "POST".to_owned();
    let updated = store.save_request(update).await.unwrap();

    assert_eq!(updated.id, saved.id);
    assert_eq!(updated.method, "POST");
    assert_eq!(store.load_tree().await.unwrap().requests.len(), 1);
}

#[tokio::test]
async fn never_persists_authentication_secrets() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();

    let mut input = save_input(&collection.id, "Authenticated");
    input.headers = vec![
        entry("Authorization", "Bearer super-secret"),
        entry("Cookie", "session=super-secret"),
        entry("Accept", "application/json"),
    ];
    input.auth = AuthRecord::Basic {
        username: "laika".to_owned(),
    };
    let saved = store.save_request(input).await.unwrap();

    assert_eq!(saved.headers[0].key, "Authorization");
    assert_eq!(saved.headers[0].value, "");
    assert_eq!(saved.headers[1].value, "");
    assert_eq!(saved.headers[2].value, "application/json");
    assert!(matches!(saved.auth, AuthRecord::Basic { ref username } if username == "laika"));

    let stored: String =
        sqlx::query_scalar("SELECT group_concat(headers_json || auth_username) FROM saved_request")
            .fetch_one(&store.pool)
            .await
            .unwrap();
    assert!(!stored.contains("super-secret"));
    let secret_ref: Option<String> =
        sqlx::query_scalar("SELECT auth_secret_ref FROM saved_request")
            .fetch_one(&store.pool)
            .await
            .unwrap();
    assert!(secret_ref.is_none());
}

#[tokio::test]
async fn truncates_oversized_bodies() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();

    let mut input = save_input(&collection.id, "Big payload");
    input.body_mode = "json".to_owned();
    input.body = "x".repeat(MAX_STORED_BODY_BYTES + 5_000);
    let saved = store.save_request(input).await.unwrap();

    assert_eq!(saved.body.len(), MAX_STORED_BODY_BYTES);
}

#[tokio::test]
async fn duplicates_and_deletes_requests() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let saved = store
        .save_request(save_input(&collection.id, "List users"))
        .await
        .unwrap();

    let copy = store.duplicate_request(&saved.id).await.unwrap();
    assert_eq!(copy.name, "List users copy");
    assert_ne!(copy.id, saved.id);
    assert_eq!(store.load_tree().await.unwrap().requests.len(), 2);

    store.delete_request(&copy.id).await.unwrap();
    assert_eq!(store.load_tree().await.unwrap().requests.len(), 1);
    assert_eq!(
        store.delete_request(&copy.id).await.unwrap_err().code,
        ApplicationErrorCode::NotFound
    );
}

#[tokio::test]
async fn moves_a_request_into_another_folder() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let source = store
        .create_folder(&collection.id, None, "Draft")
        .await
        .unwrap();
    let target = store
        .create_folder(&collection.id, None, "Live")
        .await
        .unwrap();

    let mut input = save_input(&collection.id, "List users");
    input.folder_id = Some(source.id.clone());
    let saved = store.save_request(input).await.unwrap();

    store
        .move_request(&saved.id, &collection.id, Some(&target.id), 0)
        .await
        .unwrap();

    let moved = store.get_request(&saved.id).await.unwrap();
    assert_eq!(moved.folder_id.as_deref(), Some(target.id.as_str()));
}

#[tokio::test]
async fn rejects_moving_a_folder_into_its_own_subtree() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let parent = store
        .create_folder(&collection.id, None, "Parent")
        .await
        .unwrap();
    let child = store
        .create_folder(&collection.id, Some(&parent.id), "Child")
        .await
        .unwrap();

    let error = store
        .move_folder(&parent.id, &collection.id, Some(&child.id), 0)
        .await
        .unwrap_err();
    assert_eq!(error.code, ApplicationErrorCode::InvalidInput);
}

#[tokio::test]
async fn deleting_a_collection_removes_its_contents() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let folder = store
        .create_folder(&collection.id, None, "Users")
        .await
        .unwrap();
    let mut input = save_input(&collection.id, "List users");
    input.folder_id = Some(folder.id.clone());
    store.save_request(input).await.unwrap();

    store.delete_collection(&collection.id).await.unwrap();

    let tree = store.load_tree().await.unwrap();
    assert!(tree.collections.is_empty());
    assert!(tree.folders.is_empty());
    assert!(tree.requests.is_empty());
}

#[tokio::test]
async fn rejects_empty_and_overlong_names() {
    let store = Store::open_in_memory().await.unwrap();

    assert_eq!(
        store.create_collection("   ").await.unwrap_err().code,
        ApplicationErrorCode::InvalidInput
    );
    assert_eq!(
        store
            .create_collection(&"n".repeat(201))
            .await
            .unwrap_err()
            .code,
        ApplicationErrorCode::InvalidInput
    );
}

#[tokio::test]
async fn records_successful_and_failed_executions() {
    let store = Store::open_in_memory().await.unwrap();

    store
        .record_execution(
            draft("List users", "https://example.com/users"),
            Ok(response()),
        )
        .await
        .unwrap();
    store
        .record_execution(
            draft("Broken", "https://offline.example.com"),
            Err(ApplicationErrorCode::NetworkError.as_str()),
        )
        .await
        .unwrap();

    let entries = store.list_history(None, 50, 0).await.unwrap();
    assert_eq!(entries.len(), 2);
    // Newest first.
    assert_eq!(entries[0].name, "Broken");
    assert_eq!(entries[0].error_code.as_deref(), Some("NETWORK_ERROR"));
    assert!(entries[0].status.is_none());
    assert_eq!(entries[1].status, Some(200));
    assert_eq!(entries[1].elapsed_ms, Some(12));

    let detail = store.get_history_entry(&entries[1].id).await.unwrap();
    assert_eq!(detail.request.url, "https://example.com/users");
    assert_eq!(detail.response_body.as_deref(), Some("{\"ok\":true}"));
    assert_eq!(detail.response_headers[0].key, "content-type");
}

#[tokio::test]
async fn searches_history_and_treats_wildcards_literally() {
    let store = Store::open_in_memory().await.unwrap();
    store
        .record_execution(draft("Users", "https://example.com/users"), Ok(response()))
        .await
        .unwrap();
    store
        .record_execution(
            draft("Orders", "https://example.com/orders"),
            Ok(response()),
        )
        .await
        .unwrap();

    assert_eq!(
        store
            .list_history(Some("order"), 50, 0)
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(store.list_history(Some("%"), 50, 0).await.unwrap().len(), 0);
    assert_eq!(
        store.list_history(Some("  "), 50, 0).await.unwrap().len(),
        2
    );
}

#[tokio::test]
async fn history_outlives_the_request_it_came_from() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let saved = store
        .save_request(save_input(&collection.id, "List users"))
        .await
        .unwrap();

    let mut with_request = draft("List users", "https://example.com/users");
    with_request.request_id = Some(saved.id.clone());
    store
        .record_execution(with_request, Ok(response()))
        .await
        .unwrap();

    store.delete_request(&saved.id).await.unwrap();

    let entries = store.list_history(None, 50, 0).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert!(entries[0].request_id.is_none());
}

#[tokio::test]
async fn clears_history() {
    let store = Store::open_in_memory().await.unwrap();
    store
        .record_execution(draft("Users", "https://example.com/users"), Ok(response()))
        .await
        .unwrap();

    assert_eq!(store.clear_history().await.unwrap(), 1);
    assert!(store.list_history(None, 50, 0).await.unwrap().is_empty());
}

#[tokio::test]
async fn redacts_credential_headers_in_history() {
    let store = Store::open_in_memory().await.unwrap();
    let mut with_secret = draft("Authenticated", "https://example.com/me");
    with_secret.snapshot.headers = vec![entry("Authorization", "Bearer super-secret")];
    let mut response_with_cookie = response();
    response_with_cookie.headers = vec![entry("set-cookie", "session=super-secret")];

    store
        .record_execution(with_secret, Ok(response_with_cookie))
        .await
        .unwrap();

    let stored: String = sqlx::query_scalar(
        "SELECT request_json || COALESCE(response_headers_json, '') FROM history_entry",
    )
    .fetch_one(&store.pool)
    .await
    .unwrap();
    assert!(!stored.contains("super-secret"));
}
