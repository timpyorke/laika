use super::diagnostics::{DiagnosticCategory, DiagnosticOutcome, TimingBucket};
use super::history::{HistoryDraft, HistoryResponse};
use super::models::{
    AuthRecord, KeyValueRecord, PersistVariableInput, RequestSnapshot, SaveRequestInput,
    DIAGNOSTICS_RETENTION_LIMIT, MAX_STORED_BODY_BYTES,
};
use super::Store;
use crate::error::ApplicationErrorCode;
use crate::http::HttpEngine;
use crate::secrets::SecretStore;
use crate::testing::{
    AssertionKind, AssertionOperator, AssertionResult, ExtractionSource, RequestAssertion,
    RunCollectionInput, TestCaseResult, TestRun, TestRunSummary, VariableExtraction,
};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

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
        auth_secret_ref: None,
        timeout_ms: 30_000,
        assertions: Vec::new(),
        extractions: Vec::new(),
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
async fn upgrades_a_version_one_database_without_losing_workspace_data() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    let token = super::models::new_id();
    let directory = std::env::temp_dir().join(format!("laika-v1-{token}"));
    let migrations = directory.join("migrations");
    std::fs::create_dir_all(&migrations).unwrap();
    std::fs::write(
        migrations.join("0001_initial.sql"),
        include_str!("../../migrations/0001_initial.sql"),
    )
    .unwrap();
    let database = directory.join("laika.db");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&database)
                .create_if_missing(true)
                .foreign_keys(true),
        )
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(migrations.as_path())
        .await
        .unwrap()
        .run(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('workspace-v1', 'Existing', 1, 1)")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO collection (id, workspace_id, name, position, created_at, updated_at) VALUES ('collection-v1', 'workspace-v1', 'Preserved', 0, 1, 1)")
        .execute(&pool).await.unwrap();
    pool.close().await;

    let upgraded = Store::open(&database).await.unwrap();
    let tree = upgraded.load_tree().await.unwrap();
    assert_eq!(tree.collections[0].name, "Preserved");
    assert!(upgraded
        .load_environment_state()
        .await
        .unwrap()
        .environments
        .is_empty());
    drop(upgraded);
    let recovery_files: Vec<_> = std::fs::read_dir(directory.join("recovery"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(recovery_files.len(), 1);
    assert!(recovery_files[0]
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("pre-migration-1-to-"));
    assert_eq!(Store::validate_backup(&recovery_files[0]).await.unwrap(), 1);
    let _ = std::fs::remove_dir_all(directory);
}

#[tokio::test]
async fn active_environment_overrides_workspace_variables() {
    let store = Store::open_in_memory().await.unwrap();
    let environment = store.create_environment("Production").await.unwrap();
    store
        .save_variable(PersistVariableInput {
            id: None,
            environment_id: None,
            name: "baseUrl".to_owned(),
            value: "https://workspace.example".to_owned(),
            is_secret: false,
            secret_ref: None,
        })
        .await
        .unwrap();
    store
        .save_variable(PersistVariableInput {
            id: None,
            environment_id: Some(environment.id.clone()),
            name: "baseUrl".to_owned(),
            value: "https://production.example".to_owned(),
            is_secret: false,
            secret_ref: None,
        })
        .await
        .unwrap();

    assert_eq!(
        store.effective_variables().await.unwrap()["baseUrl"].value,
        "https://workspace.example"
    );
    store
        .set_active_environment(Some(&environment.id))
        .await
        .unwrap();
    assert_eq!(
        store.effective_variables().await.unwrap()["baseUrl"].value,
        "https://production.example"
    );
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
async fn saves_request_assertions_and_persisted_run_results() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let mut input = save_input(&collection.id, "Health");
    input.assertions = vec![RequestAssertion {
        id: "assertion-1".to_owned(),
        kind: AssertionKind::Status,
        operator: AssertionOperator::Equals,
        target: String::new(),
        expected: "200".to_owned(),
    }];
    let request = store.save_request(input).await.unwrap();
    assert_eq!(request.assertions.len(), 1);

    let run = TestRun {
        summary: TestRunSummary {
            id: "run-1".to_owned(),
            collection_id: Some(collection.id.clone()),
            collection_name: collection.name,
            environment_id: None,
            environment_name: None,
            status: "passed".to_owned(),
            total_requests: 1,
            passed_requests: 1,
            failed_requests: 0,
            duration_ms: 12,
            created_at: super::models::now_ms(),
        },
        results: vec![TestCaseResult {
            id: "case-1".to_owned(),
            request_id: Some(request.id),
            request_name: "Health".to_owned(),
            method: "GET".to_owned(),
            url: "https://example.com/users".to_owned(),
            status: "passed".to_owned(),
            response_status: Some(200),
            elapsed_ms: Some(12),
            error_code: None,
            assertion_results: vec![AssertionResult {
                assertion_id: "assertion-1".to_owned(),
                kind: AssertionKind::Status,
                operator: AssertionOperator::Equals,
                target: String::new(),
                expected: "200".to_owned(),
                actual: Some("200".to_owned()),
                passed: true,
                message: "status matched".to_owned(),
            }],
            extraction_results: Vec::new(),
            position: 0,
        }],
    };
    store.save_test_run(&run).await.unwrap();
    assert_eq!(store.list_test_runs(20).await.unwrap().len(), 1);
    let reopened = store.get_test_run("run-1").await.unwrap();
    assert_eq!(
        reopened.results[0].assertion_results[0].actual.as_deref(),
        Some("200")
    );
}

#[tokio::test]
async fn collection_runner_uses_the_selected_environment_and_persists_results() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
        .mount(&server)
        .await;
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let environment = store.create_environment("Test").await.unwrap();
    store
        .save_variable(PersistVariableInput {
            id: None,
            environment_id: Some(environment.id.clone()),
            name: "baseUrl".to_owned(),
            value: server.uri(),
            is_secret: false,
            secret_ref: None,
        })
        .await
        .unwrap();
    let mut input = save_input(&collection.id, "Health");
    input.url = "{{baseUrl}}/health".to_owned();
    input.assertions = vec![RequestAssertion {
        id: "status".to_owned(),
        kind: AssertionKind::Status,
        operator: AssertionOperator::Equals,
        target: String::new(),
        expected: "200".to_owned(),
    }];
    store.save_request(input).await.unwrap();
    let temporary = std::env::temp_dir().join(super::models::new_id());
    let run = super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &SecretStore::new(&temporary),
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: Some(environment.id),
        },
    )
    .await
    .unwrap();
    assert_eq!(run.summary.status, "passed");
    assert_eq!(run.results[0].response_status, Some(200));
    assert!(run.results[0].assertion_results[0].passed);
    assert_eq!(store.list_test_runs(20).await.unwrap().len(), 1);
}

fn extraction(
    source: ExtractionSource,
    target: &str,
    variable_name: &str,
    is_secret: bool,
) -> VariableExtraction {
    VariableExtraction {
        id: format!("extraction-{variable_name}"),
        source,
        target: target.to_owned(),
        variable_name: variable_name.to_owned(),
        is_secret,
    }
}

#[tokio::test]
async fn collection_run_chains_extracted_variable_into_a_later_request() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/login"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "token": "abc123" })),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/profile"))
        .and(header("X-Session", "abc123"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
        .mount(&server)
        .await;

    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();

    let mut login = save_input(&collection.id, "Login");
    login.url = format!("{}/login", server.uri());
    login.extractions = vec![extraction(
        ExtractionSource::JsonPath,
        "$.token",
        "authToken",
        false,
    )];
    store.save_request(login).await.unwrap();

    let mut profile = save_input(&collection.id, "Profile");
    profile.url = format!("{}/profile", server.uri());
    profile.headers = vec![entry("X-Session", "{{authToken}}")];
    store.save_request(profile).await.unwrap();

    let temporary = std::env::temp_dir().join(super::models::new_id());
    let run = super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &SecretStore::new(&temporary),
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    assert!(run.results[0].extraction_results[0].found);
    assert_eq!(
        run.results[0].extraction_results[0]
            .value_preview
            .as_deref(),
        Some("abc123")
    );
    assert_eq!(run.results[1].response_status, Some(200));
    assert_eq!(run.summary.status, "passed");
}

#[tokio::test]
async fn collection_run_masks_chained_secret_in_later_history_and_results() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/login"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "token": "abc123" })),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/profile"))
        .and(header("X-Session", "abc123"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "echo": "abc123" })),
        )
        .mount(&server)
        .await;

    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();

    let mut login = save_input(&collection.id, "Login");
    login.url = format!("{}/login", server.uri());
    login.extractions = vec![extraction(
        ExtractionSource::JsonPath,
        "$.token",
        "authToken",
        true,
    )];
    store.save_request(login).await.unwrap();

    let mut profile = save_input(&collection.id, "Profile");
    profile.url = format!("{}/profile", server.uri());
    profile.headers = vec![entry("X-Session", "{{authToken}}")];
    profile.assertions = vec![RequestAssertion {
        id: "echo".to_owned(),
        kind: AssertionKind::JsonPath,
        operator: AssertionOperator::Equals,
        target: "$.echo".to_owned(),
        expected: "abc123".to_owned(),
    }];
    store.save_request(profile).await.unwrap();

    let temporary = std::env::temp_dir().join(super::models::new_id());
    std::fs::create_dir_all(&temporary).unwrap();
    let secrets = SecretStore::new(&temporary);
    secrets.unlock("correct horse battery staple").unwrap();
    let run = super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &secrets,
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    assert!(run.results[0].extraction_results[0].found);
    assert_eq!(run.results[0].extraction_results[0].value_preview, None);
    let assertion_actual = run.results[1].assertion_results[0].actual.as_deref();
    assert_ne!(assertion_actual, Some("abc123"));

    let history = store.list_history(Some("Profile"), 20, 0).await.unwrap();
    let entry = store.get_history_entry(&history[0].id).await.unwrap();
    let body = entry.response_body.unwrap_or_default();
    assert!(!body.contains("abc123"));
}

#[tokio::test]
async fn collection_run_reports_missing_extraction_without_failing_the_request() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
        .mount(&server)
        .await;

    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let mut input = save_input(&collection.id, "Health");
    input.url = format!("{}/health", server.uri());
    input.extractions = vec![extraction(
        ExtractionSource::JsonPath,
        "$.missing",
        "value",
        false,
    )];
    store.save_request(input).await.unwrap();

    let temporary = std::env::temp_dir().join(super::models::new_id());
    let run = super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &SecretStore::new(&temporary),
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(run.results[0].status, "passed");
    assert!(!run.results[0].extraction_results[0].found);
}

#[tokio::test]
async fn collection_run_fails_the_downstream_request_when_extraction_never_ran() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
        .mount(&server)
        .await;

    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let mut first = save_input(&collection.id, "Health");
    first.url = format!("{}/health", server.uri());
    store.save_request(first).await.unwrap();

    let mut second = save_input(&collection.id, "Needs token");
    second.url = format!("{}/health", server.uri());
    second.headers = vec![entry("X-Session", "{{authToken}}")];
    store.save_request(second).await.unwrap();

    let temporary = std::env::temp_dir().join(super::models::new_id());
    let run = super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &SecretStore::new(&temporary),
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(run.results[1].status, "error");
    assert_eq!(
        run.results[1].error_code.as_deref(),
        Some("UNRESOLVED_VARIABLES")
    );
}

#[tokio::test]
async fn preflight_collection_run_command_reports_unresolved_variable() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let mut first = save_input(&collection.id, "First");
    first.url = "https://example.com/health".to_owned();
    store.save_request(first).await.unwrap();
    let mut second = save_input(&collection.id, "Second");
    second.url = "https://example.com/{{authToken}}".to_owned();
    store.save_request(second).await.unwrap();

    let report = super::commands::preflight_collection_run_core(
        &store,
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(report.warnings.len(), 1);
    assert_eq!(report.warnings[0].variable_name, "authToken");
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
        entry("X-Client-Secret", "super-secret"),
        entry("Accept", "application/json"),
    ];
    input.params = vec![entry("api_key", "super-secret"), entry("page", "2")];
    input.form = vec![entry("access_token", "super-secret")];
    input.auth = AuthRecord::Basic {
        username: "laika".to_owned(),
    };
    let saved = store.save_request(input).await.unwrap();

    assert_eq!(saved.headers[0].key, "Authorization");
    assert_eq!(saved.headers[0].value, "");
    assert_eq!(saved.headers[1].value, "");
    assert_eq!(saved.headers[2].value, "");
    assert_eq!(saved.headers[3].value, "application/json");
    assert_eq!(saved.params[0].value, "");
    assert_eq!(saved.params[1].value, "2");
    assert_eq!(saved.form[0].value, "");
    assert!(matches!(saved.auth, AuthRecord::Basic { ref username } if username == "laika"));

    let stored: String =
        sqlx::query_scalar("SELECT group_concat(headers_json || params_json || form_json || auth_username) FROM saved_request")
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
async fn reorders_requests_within_the_same_parent() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    let first = store
        .save_request(save_input(&collection.id, "First"))
        .await
        .unwrap();
    store
        .save_request(save_input(&collection.id, "Second"))
        .await
        .unwrap();
    let third = store
        .save_request(save_input(&collection.id, "Third"))
        .await
        .unwrap();

    store
        .move_request(&third.id, &collection.id, None, 0)
        .await
        .unwrap();
    let names: Vec<_> = store
        .load_tree()
        .await
        .unwrap()
        .requests
        .into_iter()
        .map(|request| request.name)
        .collect();
    assert_eq!(names, ["Third", "First", "Second"]);

    store
        .move_request(&first.id, &collection.id, None, 3)
        .await
        .unwrap();
    let names: Vec<_> = store
        .load_tree()
        .await
        .unwrap()
        .requests
        .into_iter()
        .map(|request| request.name)
        .collect();
    assert_eq!(names, ["Third", "Second", "First"]);
}

#[tokio::test]
async fn reorders_folders_within_the_same_parent() {
    let store = Store::open_in_memory().await.unwrap();
    let collection = store.create_collection("APIs").await.unwrap();
    store
        .create_folder(&collection.id, None, "First")
        .await
        .unwrap();
    store
        .create_folder(&collection.id, None, "Second")
        .await
        .unwrap();
    let third = store
        .create_folder(&collection.id, None, "Third")
        .await
        .unwrap();

    store
        .move_folder(&third.id, &collection.id, None, 0)
        .await
        .unwrap();
    let names: Vec<_> = store
        .load_tree()
        .await
        .unwrap()
        .folders
        .into_iter()
        .map(|folder| folder.name)
        .collect();
    assert_eq!(names, ["Third", "First", "Second"]);
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
async fn moves_a_folder_subtree_and_its_requests_to_another_collection() {
    let store = Store::open_in_memory().await.unwrap();
    let source_collection = store.create_collection("Draft APIs").await.unwrap();
    let target_collection = store.create_collection("Production APIs").await.unwrap();
    let parent = store
        .create_folder(&source_collection.id, None, "Users")
        .await
        .unwrap();
    let child = store
        .create_folder(&source_collection.id, Some(&parent.id), "Archived")
        .await
        .unwrap();
    let mut input = save_input(&source_collection.id, "List archived users");
    input.folder_id = Some(child.id.clone());
    let saved = store.save_request(input).await.unwrap();

    store
        .move_folder(&parent.id, &target_collection.id, None, 0)
        .await
        .unwrap();

    let tree = store.load_tree().await.unwrap();
    assert!(tree
        .folders
        .iter()
        .filter(|folder| folder.id == parent.id || folder.id == child.id)
        .all(|folder| folder.collection_id == target_collection.id));
    let moved_request = tree
        .requests
        .iter()
        .find(|request| request.id == saved.id)
        .unwrap();
    assert_eq!(moved_request.collection_id, target_collection.id);
    assert_eq!(moved_request.folder_id.as_deref(), Some(child.id.as_str()));
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

#[tokio::test]
async fn diagnostic_events_are_a_no_op_when_disabled() {
    let store = Store::open_in_memory().await.unwrap();
    assert!(!store.diagnostics_enabled().await.unwrap());

    store
        .record_diagnostic_event(
            DiagnosticCategory::HttpRequest,
            DiagnosticOutcome::Success,
            None,
            Some(TimingBucket::from_millis(42)),
        )
        .await
        .unwrap();

    assert!(store.list_diagnostic_events().await.unwrap().is_empty());
}

#[tokio::test]
async fn enabling_diagnostics_records_and_trims_to_the_retention_limit() {
    let store = Store::open_in_memory().await.unwrap();
    store.set_diagnostics_enabled(true).await.unwrap();

    for _ in 0..(DIAGNOSTICS_RETENTION_LIMIT + 5) {
        store
            .record_diagnostic_event(
                DiagnosticCategory::HttpRequest,
                DiagnosticOutcome::Success,
                None,
                Some(TimingBucket::from_millis(10)),
            )
            .await
            .unwrap();
    }

    let events = store.list_diagnostic_events().await.unwrap();
    assert_eq!(events.len() as i64, DIAGNOSTICS_RETENTION_LIMIT);
    assert_eq!(events[0].category, "HTTP_REQUEST");
    assert_eq!(events[0].timing_bucket.as_deref(), Some("UNDER_100MS"));
}

#[tokio::test]
async fn clear_diagnostics_removes_every_event() {
    let store = Store::open_in_memory().await.unwrap();
    store.set_diagnostics_enabled(true).await.unwrap();
    store
        .record_diagnostic_event(
            DiagnosticCategory::Backup,
            DiagnosticOutcome::Failure,
            Some(ApplicationErrorCode::BackupError),
            None,
        )
        .await
        .unwrap();

    assert_eq!(store.list_diagnostic_events().await.unwrap().len(), 1);
    store.clear_diagnostic_events().await.unwrap();
    assert!(store.list_diagnostic_events().await.unwrap().is_empty());
}

/// Adversarial redaction check: a collection run whose URL, headers, and body
/// are stuffed with secret-shaped tokens must never let any of those tokens
/// reach a diagnostic row, because the schema has no field they could be
/// written into.
#[tokio::test]
async fn diagnostic_events_never_contain_request_content_or_secrets() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/health"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;
    let store = Store::open_in_memory().await.unwrap();
    store.set_diagnostics_enabled(true).await.unwrap();
    let collection = store.create_collection("Checks").await.unwrap();
    let mut input = save_input(&collection.id, "Health");
    input.url = format!("{}/health?token=adversarial-secret-token", server.uri());
    input.headers = vec![
        entry("Authorization", "Bearer adversarial-bearer-token"),
        entry("X-Api-Key", "adversarial-api-key"),
    ];
    input.body_mode = "json".to_owned();
    input.body = "{\"password\":\"hunter2-adversarial\"}".to_owned();
    store.save_request(input).await.unwrap();
    let temporary = std::env::temp_dir().join(super::models::new_id());
    super::commands::run_collection_core(
        &HttpEngine::new().unwrap(),
        &store,
        &SecretStore::new(&temporary),
        RunCollectionInput {
            collection_id: collection.id,
            environment_id: None,
        },
    )
    .await
    .unwrap();

    let events = store.list_diagnostic_events().await.unwrap();
    assert!(!events.is_empty());
    let planted = [
        "adversarial-secret-token".to_owned(),
        "adversarial-bearer-token".to_owned(),
        "adversarial-api-key".to_owned(),
        "hunter2-adversarial".to_owned(),
        server.uri(),
    ];
    let serialized = serde_json::to_string(&events).unwrap();
    for token in planted {
        assert!(
            !serialized.contains(&token),
            "diagnostic event leaked {token}"
        );
    }
}
