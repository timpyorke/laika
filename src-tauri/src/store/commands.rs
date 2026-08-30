//! Tauri command surface for the workspace.
//!
//! Every function here is a thin adapter: translate arguments, call one
//! repository method, return the contract type. Business rules belong in the
//! repository modules.

use super::diagnostics::{
    DiagnosticCategory, DiagnosticOutcome, DiagnosticsExport, DiagnosticsSettings, TimingBucket,
};
use super::history::{HistoryDraft, HistoryResponse};
use super::models::{
    Collection, Environment, EnvironmentState, EnvironmentVariable, Folder, HistoryEntry,
    HistorySummary, KeyValueRecord, PersistVariableInput, RequestSnapshot, RequestSummary,
    SaveRequestCommandInput, SaveVariableInput, SavedRequest, StoredVariable, WorkspaceTree,
};
use super::StoreHandle;
use crate::backup::BackupService;
use crate::chaining::{self, ChainPreflightReport};
use crate::error::ApplicationError;
use crate::http::{
    HttpEngine, HttpRequestInput, HttpResponseOutput, KeyValueEntry, RequestAuth, RequestBody,
};
use crate::secrets::{SecretStore, SecretStoreStatus};
use crate::testing::{
    evaluate_assertions, evaluate_extractions, AssertionResult, ExtractionResult,
    RunCollectionInput, TestCaseResult, TestRun, TestRunSummary,
};
use crate::variables::{resolve_assertions, resolve_request};
use std::time::Instant;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use zeroize::{Zeroize, Zeroizing};

/// Runs the request, then records it. History is best-effort: a storage failure
/// is swallowed so it can never turn a successful response into an error.
#[tauri::command]
pub async fn execute_http_request(
    engine: State<'_, HttpEngine>,
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    mut request: HttpRequestInput,
) -> Result<HttpResponseOutput, ApplicationError> {
    let draft = HistoryDraft {
        request_id: request.saved_request_id.clone(),
        name: request
            .name
            .clone()
            .unwrap_or_else(|| "Untitled request".to_owned()),
        snapshot: snapshot_of(&request),
    };
    let variables = match store.get() {
        Ok(store) => store.effective_variables().await?,
        Err(_) => Default::default(),
    };
    let mut redactions = Zeroizing::new(direct_auth_secrets(&request));
    if let Some(secret) = hydrate_saved_auth(store.get().ok(), &secrets, &mut request).await? {
        redactions.push(secret);
    }
    redactions.extend(resolve_request(&mut request, &variables, &secrets)?);
    let started = Instant::now();
    let result = engine.execute(request).await;
    let elapsed_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

    let outcome = match &result {
        Ok(response) => Some(Ok(history_response(response, &redactions))),
        // A request rejected before it was sent is a form error, not history.
        Err(error) if error.code.is_pre_flight() => None,
        Err(error) => Some(Err(error.code.as_str())),
    };
    if let Ok(store) = store.get() {
        let (diagnostic_outcome, error_code) = match &result {
            Ok(_) => (DiagnosticOutcome::Success, None),
            Err(error) => (DiagnosticOutcome::Failure, Some(error.code)),
        };
        let _ = store
            .record_diagnostic_event(
                DiagnosticCategory::HttpRequest,
                diagnostic_outcome,
                error_code,
                Some(TimingBucket::from_millis(elapsed_ms)),
            )
            .await;
        if let Some(outcome) = outcome {
            let _ = store.record_execution(draft, outcome).await;
        }
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
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    mut request: SaveRequestCommandInput,
) -> Result<SavedRequest, ApplicationError> {
    let auth_secret = request.auth_secret.take().map(Zeroizing::new);
    let _data_guard = backup.lock_data().await;
    let existing_ref = match request.request.id.as_deref() {
        Some(id) => store.get()?.get_request(id).await?.auth_secret_ref,
        None => None,
    };
    let needs_secret = !matches!(request.request.auth, super::models::AuthRecord::None);
    let secret_ref = if needs_secret {
        match auth_secret.as_deref().filter(|value| !value.is_empty()) {
            Some(value) => Some(secrets.put(None, value)?),
            None => existing_ref.clone(),
        }
    } else {
        None
    };
    request.request.auth_secret_ref = secret_ref;
    let saved = store.get()?.save_request(request.request).await?;
    if saved.auth_secret_ref != existing_ref {
        if let Some(secret_ref) = existing_ref {
            let _ = secrets.delete(&secret_ref);
        }
    }
    Ok(saved)
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
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    id: String,
) -> Result<SavedRequest, ApplicationError> {
    let _data_guard = backup.lock_data().await;
    let source = store.get()?.get_request(&id).await?;
    let mut duplicate = store.get()?.duplicate_request(&id).await?;
    if let Some(source_ref) = source.auth_secret_ref {
        let value = Zeroizing::new(secrets.get(&source_ref)?);
        let new_ref = secrets.put(None, &value)?;
        store
            .get()?
            .set_request_auth_secret_ref(&duplicate.id, Some(&new_ref))
            .await?;
        duplicate.auth_secret_ref = Some(new_ref);
        duplicate.has_auth_secret = true;
    }
    Ok(duplicate)
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
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    id: String,
) -> Result<(), ApplicationError> {
    let _data_guard = backup.lock_data().await;
    let secret_ref = store.get()?.get_request(&id).await?.auth_secret_ref;
    store.get()?.delete_request(&id).await?;
    if let Some(secret_ref) = secret_ref {
        let _ = secrets.delete(&secret_ref);
    }
    Ok(())
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

#[tauri::command]
pub async fn load_environment_state(
    store: State<'_, StoreHandle>,
) -> Result<EnvironmentState, ApplicationError> {
    store.get()?.load_environment_state().await
}

#[tauri::command]
pub async fn create_environment(
    store: State<'_, StoreHandle>,
    name: String,
) -> Result<Environment, ApplicationError> {
    store.get()?.create_environment(&name).await
}

#[tauri::command]
pub async fn rename_environment(
    store: State<'_, StoreHandle>,
    id: String,
    name: String,
) -> Result<Environment, ApplicationError> {
    store.get()?.rename_environment(&id, &name).await
}

#[tauri::command]
pub async fn delete_environment(
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    id: String,
) -> Result<(), ApplicationError> {
    let _data_guard = backup.lock_data().await;
    let secret_refs = store.get()?.delete_environment(&id).await?;
    for secret_ref in secret_refs {
        let _ = secrets.delete(&secret_ref);
    }
    Ok(())
}

#[tauri::command]
pub async fn set_active_environment(
    store: State<'_, StoreHandle>,
    id: Option<String>,
) -> Result<(), ApplicationError> {
    store.get()?.set_active_environment(id.as_deref()).await
}

#[tauri::command]
pub async fn save_environment_variable(
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    mut variable: SaveVariableInput,
) -> Result<EnvironmentVariable, ApplicationError> {
    let secret_value = variable
        .is_secret
        .then(|| Zeroizing::new(std::mem::take(&mut variable.value)));
    let _data_guard = backup.lock_data().await;
    let existing_ref = match variable.id.as_deref() {
        Some(id) => store.get()?.get_variable_secret_ref(id).await?,
        None => None,
    };
    let secret_ref = if variable.is_secret {
        let value = secret_value.as_deref().expect("secret value was captured");
        if value.is_empty() {
            existing_ref.clone()
        } else {
            Some(secrets.put(None, value)?)
        }
    } else {
        None
    };
    if variable.is_secret && secret_ref.is_none() {
        return Err(ApplicationError::invalid_input());
    }
    let persisted_value = if variable.is_secret {
        String::new()
    } else {
        variable.value
    };
    let secret_changed = secret_ref != existing_ref;
    let saved = store
        .get()?
        .save_variable(PersistVariableInput {
            id: variable.id,
            environment_id: variable.environment_id,
            name: variable.name,
            value: persisted_value,
            is_secret: variable.is_secret,
            secret_ref,
        })
        .await?;
    if saved.is_secret {
        if saved.has_secret && secret_changed {
            if let Some(secret_ref) = existing_ref {
                let _ = secrets.delete(&secret_ref);
            }
        }
    } else {
        if let Some(secret_ref) = existing_ref {
            let _ = secrets.delete(&secret_ref);
        }
    }
    Ok(saved)
}

#[tauri::command]
pub async fn delete_environment_variable(
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    id: String,
) -> Result<(), ApplicationError> {
    let _data_guard = backup.lock_data().await;
    if let Some(secret_ref) = store.get()?.delete_variable(&id).await? {
        let _ = secrets.delete(&secret_ref);
    }
    Ok(())
}

#[tauri::command]
pub async fn reveal_environment_variable(
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    id: String,
) -> Result<String, ApplicationError> {
    let secret_ref = store
        .get()?
        .get_variable_secret_ref(&id)
        .await?
        .ok_or_else(ApplicationError::not_found)?;
    secrets.get(&secret_ref)
}

#[tauri::command]
pub fn secret_store_status(
    secrets: State<'_, SecretStore>,
) -> Result<SecretStoreStatus, ApplicationError> {
    secrets.status()
}

#[tauri::command]
pub async fn unlock_secret_store(
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
    mut password: String,
) -> Result<SecretStoreStatus, ApplicationError> {
    let _data_guard = backup.lock_data().await;
    let result = secrets.unlock(&password);
    password.zeroize();
    result
}

#[tauri::command]
pub async fn lock_secret_store(
    secrets: State<'_, SecretStore>,
    backup: State<'_, BackupService>,
) -> Result<SecretStoreStatus, ApplicationError> {
    let _data_guard = backup.lock_data().await;
    secrets.lock()
}

#[tauri::command]
pub async fn run_collection(
    engine: State<'_, HttpEngine>,
    store: State<'_, StoreHandle>,
    secrets: State<'_, SecretStore>,
    input: RunCollectionInput,
) -> Result<TestRun, ApplicationError> {
    let repository = store.get()?;
    run_collection_core(engine.inner(), repository, secrets.inner(), input).await
}

pub(crate) async fn run_collection_core(
    engine: &HttpEngine,
    repository: &super::Store,
    secrets: &SecretStore,
    input: RunCollectionInput,
) -> Result<TestRun, ApplicationError> {
    let collection_name = repository.collection_name(&input.collection_id).await?;
    let environment_name = repository
        .environment_name(input.environment_id.as_deref())
        .await?;
    let mut variables = repository
        .effective_variables_for_environment(input.environment_id.as_deref())
        .await?;
    let requests = repository.collection_requests(&input.collection_id).await?;
    if requests.is_empty() {
        return Err(ApplicationError::invalid_input());
    }
    let started = Instant::now();
    let mut results = Vec::with_capacity(requests.len());
    let mut ephemeral_secret_refs: Vec<String> = Vec::new();

    for (position, saved) in requests.into_iter().enumerate() {
        let request_name = saved.name.clone();
        let request_url = saved.url.clone();
        let method = saved.method.clone();
        let request_id = saved.id.clone();
        let mut request = request_input_from_saved(&saved);
        let history_draft = HistoryDraft {
            request_id: Some(request_id.clone()),
            name: request_name.clone(),
            snapshot: snapshot_of(&request),
        };
        let mut assertions = saved.assertions.clone();
        let prepared = async {
            let mut redactions = Vec::new();
            if let Some(secret) =
                hydrate_saved_auth(Some(repository), secrets, &mut request).await?
            {
                redactions.push(secret);
            }
            redactions.extend(resolve_request(&mut request, &variables, secrets)?);
            redactions.extend(resolve_assertions(&mut assertions, &variables, secrets)?);
            Ok::<_, ApplicationError>(redactions)
        }
        .await;

        let result = match prepared {
            Ok(redactions) => match engine.execute(request).await {
                Ok(response) => {
                    let mut assertion_results = evaluate_assertions(&assertions, &response);
                    redact_assertion_results(&mut assertion_results, &redactions);
                    let passed = assertion_results.iter().all(|assertion| assertion.passed);
                    let mut extraction_results = Vec::with_capacity(saved.extractions.len());
                    for (rule, raw) in evaluate_extractions(&saved.extractions, &response) {
                        match raw {
                            Some(raw_value) => {
                                let value_preview = if rule.is_secret {
                                    None
                                } else {
                                    Some(bounded_text(&redact_text(&raw_value, &redactions)))
                                };
                                let stored = if rule.is_secret {
                                    let secret_ref = secrets.put(None, &raw_value)?;
                                    ephemeral_secret_refs.push(secret_ref.clone());
                                    StoredVariable {
                                        value: String::new(),
                                        is_secret: true,
                                        secret_ref: Some(secret_ref),
                                    }
                                } else {
                                    StoredVariable {
                                        value: raw_value,
                                        is_secret: false,
                                        secret_ref: None,
                                    }
                                };
                                variables.insert(rule.variable_name.clone(), stored);
                                extraction_results.push(ExtractionResult {
                                    extraction_id: rule.id,
                                    variable_name: rule.variable_name,
                                    found: true,
                                    value_preview,
                                });
                            }
                            None => extraction_results.push(ExtractionResult {
                                extraction_id: rule.id,
                                variable_name: rule.variable_name,
                                found: false,
                                value_preview: None,
                            }),
                        }
                    }
                    let _ = repository
                        .record_execution(
                            history_draft,
                            Ok(history_response(&response, &redactions)),
                        )
                        .await;
                    TestCaseResult {
                        id: super::models::new_id(),
                        request_id: Some(request_id),
                        request_name,
                        method,
                        url: request_url,
                        status: if passed { "passed" } else { "failed" }.to_owned(),
                        response_status: Some(response.status),
                        elapsed_ms: Some(response.elapsed_ms),
                        error_code: None,
                        assertion_results,
                        extraction_results,
                        position: position as i64,
                    }
                }
                Err(error) => {
                    if !error.code.is_pre_flight() {
                        let _ = repository
                            .record_execution(history_draft, Err(error.code.as_str()))
                            .await;
                    }
                    failed_case(
                        position,
                        request_id,
                        request_name,
                        method,
                        request_url,
                        error,
                    )
                }
            },
            Err(error) => failed_case(
                position,
                request_id,
                request_name,
                method,
                request_url,
                error,
            ),
        };
        results.push(result);
    }

    for secret_ref in ephemeral_secret_refs {
        let _ = secrets.delete(&secret_ref);
    }

    let passed_requests = results
        .iter()
        .filter(|result| result.status == "passed")
        .count() as i64;
    let total_requests = results.len() as i64;
    let failed_requests = total_requests - passed_requests;
    let run = TestRun {
        summary: TestRunSummary {
            id: super::models::new_id(),
            collection_id: Some(input.collection_id),
            collection_name,
            environment_id: input.environment_id,
            environment_name,
            status: if failed_requests == 0 {
                "passed"
            } else {
                "failed"
            }
            .to_owned(),
            total_requests,
            passed_requests,
            failed_requests,
            duration_ms: started.elapsed().as_millis().min(i64::MAX as u128) as i64,
            created_at: super::models::now_ms(),
        },
        results,
    };
    let run_outcome = if run.summary.failed_requests == 0 {
        DiagnosticOutcome::Success
    } else {
        DiagnosticOutcome::Failure
    };
    let _ = repository
        .record_diagnostic_event(
            DiagnosticCategory::CollectionRun,
            run_outcome,
            None,
            Some(TimingBucket::from_millis(
                run.summary.duration_ms.max(0) as u64
            )),
        )
        .await;
    repository.save_test_run(&run).await?;
    Ok(run)
}

/// Read-only check for whether every `{{variable}}` a collection's requests
/// reference will actually be available when its turn comes to run — either
/// already defined, or extracted by an earlier request in the same run.
/// Performs no execution and no writes, so it's safe to call before every run
/// and on every editor change.
#[tauri::command]
pub async fn preflight_collection_run(
    store: State<'_, StoreHandle>,
    input: RunCollectionInput,
) -> Result<ChainPreflightReport, ApplicationError> {
    preflight_collection_run_core(store.get()?, input).await
}

pub(crate) async fn preflight_collection_run_core(
    repository: &super::Store,
    input: RunCollectionInput,
) -> Result<ChainPreflightReport, ApplicationError> {
    let variables = repository
        .effective_variables_for_environment(input.environment_id.as_deref())
        .await?;
    let requests = repository.collection_requests(&input.collection_id).await?;
    Ok(ChainPreflightReport {
        warnings: chaining::preflight(&requests, &variables),
    })
}

#[tauri::command]
pub async fn list_test_runs(
    store: State<'_, StoreHandle>,
    limit: i64,
) -> Result<Vec<TestRunSummary>, ApplicationError> {
    store.get()?.list_test_runs(limit).await
}

#[tauri::command]
pub async fn get_test_run(
    store: State<'_, StoreHandle>,
    id: String,
) -> Result<TestRun, ApplicationError> {
    store.get()?.get_test_run(&id).await
}

#[tauri::command]
pub async fn get_diagnostics_settings(
    store: State<'_, StoreHandle>,
) -> Result<DiagnosticsSettings, ApplicationError> {
    Ok(DiagnosticsSettings {
        enabled: store.get()?.diagnostics_enabled().await?,
    })
}

#[tauri::command]
pub async fn set_diagnostics_enabled(
    store: State<'_, StoreHandle>,
    enabled: bool,
) -> Result<(), ApplicationError> {
    store.get()?.set_diagnostics_enabled(enabled).await
}

#[tauri::command]
pub async fn clear_diagnostics(store: State<'_, StoreHandle>) -> Result<(), ApplicationError> {
    store.get()?.clear_diagnostic_events().await
}

/// Writes an allowlisted JSON export to a user-chosen location. Returns
/// `None` if the user cancels the save dialog.
#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle,
    store: State<'_, StoreHandle>,
) -> Result<Option<String>, ApplicationError> {
    let events = store.get()?.list_diagnostic_events().await?;
    let selected = app
        .dialog()
        .file()
        .add_filter("Laika diagnostics export", &["json"])
        .set_file_name(format!(
            "laika-diagnostics-{}.json",
            super::models::now_ms()
        ))
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| ApplicationError::database())?;
    let export = DiagnosticsExport {
        exported_at: super::models::now_ms(),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        os: std::env::consts::OS.to_owned(),
        events,
    };
    let bytes = serde_json::to_vec_pretty(&export).map_err(|_| ApplicationError::database())?;
    std::fs::write(&path, bytes).map_err(|_| ApplicationError::database())?;
    Ok(path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned))
}

fn failed_case(
    position: usize,
    request_id: String,
    request_name: String,
    method: String,
    url: String,
    error: ApplicationError,
) -> TestCaseResult {
    TestCaseResult {
        id: super::models::new_id(),
        request_id: Some(request_id),
        request_name,
        method,
        url,
        status: "error".to_owned(),
        response_status: None,
        elapsed_ms: None,
        error_code: Some(error.code.as_str().to_owned()),
        assertion_results: Vec::new(),
        extraction_results: Vec::new(),
        position: position as i64,
    }
}

fn redact_assertion_results(results: &mut [AssertionResult], redactions: &[String]) {
    for result in results {
        result.target = bounded_text(&redact_text(&result.target, redactions));
        result.expected = bounded_text(&redact_text(&result.expected, redactions));
        if let Some(actual) = result.actual.as_mut() {
            *actual = bounded_text(&redact_text(actual, redactions));
        }
        result.message = bounded_text(&redact_text(&result.message, redactions));
    }
}

fn bounded_text(value: &str) -> String {
    const LIMIT: usize = 2_048;
    if value.len() <= LIMIT {
        return value.to_owned();
    }
    let mut end = LIMIT;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

fn request_input_from_saved(saved: &SavedRequest) -> HttpRequestInput {
    let method = match saved.method.as_str() {
        "POST" => crate::http::HttpMethod::Post,
        "PUT" => crate::http::HttpMethod::Put,
        "PATCH" => crate::http::HttpMethod::Patch,
        "DELETE" => crate::http::HttpMethod::Delete,
        "HEAD" => crate::http::HttpMethod::Head,
        "OPTIONS" => crate::http::HttpMethod::Options,
        _ => crate::http::HttpMethod::Get,
    };
    let body = match saved.body_mode.as_str() {
        "json" => RequestBody::Json {
            content: saved.body.clone(),
        },
        "text" => RequestBody::Text {
            content: saved.body.clone(),
        },
        "form" => RequestBody::Form {
            entries: saved.form.iter().map(record_to_entry).collect(),
        },
        _ => RequestBody::None,
    };
    let auth = match &saved.auth {
        super::models::AuthRecord::Bearer => RequestAuth::Bearer {
            token: String::new(),
        },
        super::models::AuthRecord::Basic { username } => RequestAuth::Basic {
            username: username.clone(),
            password: String::new(),
        },
        super::models::AuthRecord::None => RequestAuth::None,
    };
    HttpRequestInput {
        request_id: super::models::new_id(),
        saved_request_id: Some(saved.id.clone()),
        name: Some(saved.name.clone()),
        method,
        url: saved.url.clone(),
        params: saved.params.iter().map(record_to_entry).collect(),
        headers: saved.headers.iter().map(record_to_entry).collect(),
        body,
        auth,
        timeout_ms: saved.timeout_ms.max(0) as u64,
        max_response_bytes: 10 * 1024 * 1024,
    }
}

fn record_to_entry(record: &KeyValueRecord) -> KeyValueEntry {
    KeyValueEntry {
        enabled: record.enabled,
        key: record.key.clone(),
        value: record.value.clone(),
    }
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

fn history_response(response: &HttpResponseOutput, redactions: &[String]) -> HistoryResponse {
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
                value: redact_text(&header.value, redactions),
            })
            .collect(),
        body: redact_text(&response.body, redactions),
        truncated: response.truncated,
    }
}

async fn hydrate_saved_auth(
    store: Option<&super::Store>,
    secrets: &SecretStore,
    request: &mut HttpRequestInput,
) -> Result<Option<String>, ApplicationError> {
    let needs_secret = matches!(&request.auth, RequestAuth::Bearer { token } if token.is_empty())
        || matches!(&request.auth, RequestAuth::Basic { password, .. } if password.is_empty());
    if !needs_secret {
        return Ok(None);
    }
    let (Some(store), Some(request_id)) = (store, request.saved_request_id.as_deref()) else {
        return Ok(None);
    };
    let saved = store.get_request(request_id).await?;
    let Some(secret_ref) = saved.auth_secret_ref else {
        return Ok(None);
    };
    let secret = secrets.get(&secret_ref)?;
    match &mut request.auth {
        RequestAuth::Bearer { token } => *token = secret.clone(),
        RequestAuth::Basic { password, .. } => *password = secret.clone(),
        RequestAuth::None => {}
    }
    Ok((secret.len() >= 3).then_some(secret))
}

fn direct_auth_secrets(request: &HttpRequestInput) -> Vec<String> {
    match &request.auth {
        RequestAuth::Bearer { token } if token.len() >= 3 => vec![token.clone()],
        RequestAuth::Basic { password, .. } if password.len() >= 3 => vec![password.clone()],
        _ => Vec::new(),
    }
}

fn redact_text(value: &str, redactions: &[String]) -> String {
    redactions
        .iter()
        .filter(|secret| secret.len() >= 3)
        .fold(value.to_owned(), |text, secret| {
            text.replace(secret, "[REDACTED]")
        })
}
