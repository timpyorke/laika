//! Pre-flight checks for request chaining: which variables a collection run's
//! requests reference, and whether an earlier request (or the existing
//! environment/workspace variables) actually produces each one before it's
//! needed.
//!
//! This module has no Tauri or database dependencies, matching `testing.rs`.

use crate::store::models::{SavedRequest, StoredVariable};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainPreflightWarning {
    pub request_id: String,
    pub request_name: String,
    pub variable_name: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainPreflightReport {
    pub warnings: Vec<ChainPreflightWarning>,
}

/// Names referenced via `{{name}}` in a request's URL, enabled params/headers,
/// body (json/text modes), enabled form rows, and assertion targets/expected
/// values.
///
/// A `{{name}}` embedded in a saved auth secret (bearer token / basic
/// password) is invisible here — only an opaque `secret_ref` is stored on
/// `SavedRequest`, never the plaintext. Such references still surface via the
/// existing per-request `UnresolvedVariables` error at execution time; they
/// just aren't caught by this whole-run pre-check.
pub fn referenced_variable_names(saved: &SavedRequest) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    scan(&saved.url, &mut names);
    for entry in saved.params.iter().filter(|entry| entry.enabled) {
        scan(&entry.key, &mut names);
        scan(&entry.value, &mut names);
    }
    for entry in saved.headers.iter().filter(|entry| entry.enabled) {
        scan(&entry.key, &mut names);
        scan(&entry.value, &mut names);
    }
    if matches!(saved.body_mode.as_str(), "json" | "text") {
        scan(&saved.body, &mut names);
    }
    if saved.body_mode == "form" {
        for entry in saved.form.iter().filter(|entry| entry.enabled) {
            scan(&entry.key, &mut names);
            scan(&entry.value, &mut names);
        }
    }
    for assertion in &saved.assertions {
        scan(&assertion.target, &mut names);
        scan(&assertion.expected, &mut names);
    }
    names
}

fn scan(text: &str, names: &mut BTreeSet<String>) {
    let mut cursor = 0;
    while let Some(relative_start) = text[cursor..].find("{{") {
        let start = cursor + relative_start;
        let value_start = start + 2;
        let Some(relative_end) = text[value_start..].find("}}") else {
            break;
        };
        let end = value_start + relative_end;
        let name = text[value_start..end].trim();
        if !name.is_empty() {
            names.insert(name.to_owned());
        }
        cursor = end + 2;
    }
}

/// Walks `requests` in the same position order the collection runner
/// executes them, and flags any variable a request needs that is available
/// neither in `variables` (the pre-run snapshot) nor produced by an earlier
/// request's extraction rules. A variable only produced by a *later* request
/// is correctly flagged too, since it genuinely isn't available yet when the
/// earlier request runs.
pub fn preflight(
    requests: &[SavedRequest],
    variables: &BTreeMap<String, StoredVariable>,
) -> Vec<ChainPreflightWarning> {
    let mut produced: BTreeSet<String> = BTreeSet::new();
    let mut warnings = Vec::new();
    for request in requests {
        for name in referenced_variable_names(request) {
            if !variables.contains_key(&name) && !produced.contains(&name) {
                warnings.push(ChainPreflightWarning {
                    request_id: request.id.clone(),
                    request_name: request.name.clone(),
                    variable_name: name,
                });
            }
        }
        for extraction in &request.extractions {
            produced.insert(extraction.variable_name.clone());
        }
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::models::{AuthRecord, KeyValueRecord};
    use crate::testing::{
        AssertionKind, AssertionOperator, ExtractionSource, RequestAssertion, VariableExtraction,
    };

    fn request(id: &str, name: &str) -> SavedRequest {
        SavedRequest {
            id: id.to_owned(),
            collection_id: "collection-1".to_owned(),
            folder_id: None,
            name: name.to_owned(),
            method: "GET".to_owned(),
            url: String::new(),
            params: Vec::new(),
            headers: Vec::new(),
            body_mode: "none".to_owned(),
            body: String::new(),
            form: Vec::new(),
            auth: AuthRecord::None,
            has_auth_secret: false,
            auth_secret_ref: None,
            timeout_ms: 30_000,
            assertions: Vec::new(),
            extractions: Vec::new(),
        }
    }

    fn extraction(variable_name: &str) -> VariableExtraction {
        VariableExtraction {
            id: "extraction-1".to_owned(),
            source: ExtractionSource::JsonPath,
            target: "$.token".to_owned(),
            variable_name: variable_name.to_owned(),
            is_secret: false,
        }
    }

    #[test]
    fn referenced_variable_names_scans_url_headers_body_and_assertions() {
        let mut saved = request("request-1", "Login");
        saved.url = "https://{{host}}/api".to_owned();
        saved.headers.push(KeyValueRecord {
            enabled: true,
            key: "Authorization".to_owned(),
            value: "Bearer {{token}}".to_owned(),
        });
        saved.headers.push(KeyValueRecord {
            enabled: false,
            key: "X-Disabled".to_owned(),
            value: "{{shouldNotAppear}}".to_owned(),
        });
        saved.body_mode = "json".to_owned();
        saved.body = r#"{"id":"{{id}}"}"#.to_owned();
        saved.assertions.push(RequestAssertion {
            id: "assertion-1".to_owned(),
            kind: AssertionKind::JsonPath,
            operator: AssertionOperator::Equals,
            target: "$.id".to_owned(),
            expected: "{{expectedId}}".to_owned(),
        });

        let names = referenced_variable_names(&saved);
        assert_eq!(
            names,
            BTreeSet::from([
                "host".to_owned(),
                "token".to_owned(),
                "id".to_owned(),
                "expectedId".to_owned(),
            ])
        );
    }

    #[test]
    fn preflight_flags_unresolved_variable_with_no_producer() {
        let mut first = request("request-1", "First");
        first.url = "https://example.com".to_owned();
        let mut second = request("request-2", "Second");
        second.url = "https://example.com/{{token}}".to_owned();

        let warnings = preflight(&[first, second], &BTreeMap::new());
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].request_id, "request-2");
        assert_eq!(warnings[0].variable_name, "token");
    }

    #[test]
    fn preflight_resolves_variable_produced_by_an_earlier_request() {
        let mut first = request("request-1", "First");
        first.extractions.push(extraction("token"));
        let mut second = request("request-2", "Second");
        second.url = "https://example.com/{{token}}".to_owned();

        let warnings = preflight(&[first, second], &BTreeMap::new());
        assert!(warnings.is_empty());
    }

    #[test]
    fn preflight_flags_forward_reference_as_unresolved() {
        let mut first = request("request-1", "First");
        first.url = "https://example.com/{{token}}".to_owned();
        let mut second = request("request-2", "Second");
        second.extractions.push(extraction("token"));

        let warnings = preflight(&[first, second], &BTreeMap::new());
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].request_id, "request-1");
    }
}
