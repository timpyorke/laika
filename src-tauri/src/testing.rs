//! CLI-safe API testing contracts and assertion evaluation.
//!
//! This module has no Tauri or database dependencies. A future CLI can reuse
//! the same serialized contracts and evaluator as the desktop collection runner.

use crate::http::HttpResponseOutput;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestAssertion {
    pub id: String,
    pub kind: AssertionKind,
    pub operator: AssertionOperator,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub expected: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AssertionKind {
    Status,
    Header,
    JsonPath,
    ResponseTime,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AssertionOperator {
    Equals,
    NotEquals,
    Contains,
    Exists,
    NotExists,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssertionResult {
    pub assertion_id: String,
    pub kind: AssertionKind,
    pub operator: AssertionOperator,
    pub target: String,
    pub expected: String,
    pub actual: Option<String>,
    pub passed: bool,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableExtraction {
    pub id: String,
    pub source: ExtractionSource,
    #[serde(default)]
    pub target: String,
    pub variable_name: String,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExtractionSource {
    Status,
    Header,
    JsonPath,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionResult {
    pub extraction_id: String,
    pub variable_name: String,
    pub found: bool,
    pub value_preview: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCollectionInput {
    pub collection_id: String,
    #[serde(default)]
    pub environment_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseResult {
    pub id: String,
    pub request_id: Option<String>,
    pub request_name: String,
    pub method: String,
    pub url: String,
    pub status: String,
    pub response_status: Option<u16>,
    pub elapsed_ms: Option<u64>,
    pub error_code: Option<String>,
    pub assertion_results: Vec<AssertionResult>,
    #[serde(default)]
    pub extraction_results: Vec<ExtractionResult>,
    pub position: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunSummary {
    pub id: String,
    pub collection_id: Option<String>,
    pub collection_name: String,
    pub environment_id: Option<String>,
    pub environment_name: Option<String>,
    pub status: String,
    pub total_requests: i64,
    pub passed_requests: i64,
    pub failed_requests: i64,
    pub duration_ms: i64,
    pub created_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRun {
    #[serde(flatten)]
    pub summary: TestRunSummary,
    pub results: Vec<TestCaseResult>,
}

pub fn evaluate_assertions(
    assertions: &[RequestAssertion],
    response: &HttpResponseOutput,
) -> Vec<AssertionResult> {
    assertions
        .iter()
        .map(|assertion| evaluate_assertion(assertion, response))
        .collect()
}

fn evaluate_assertion(
    assertion: &RequestAssertion,
    response: &HttpResponseOutput,
) -> AssertionResult {
    let actual = match assertion.kind {
        AssertionKind::Status => Some(response.status.to_string()),
        AssertionKind::ResponseTime => Some(response.elapsed_ms.to_string()),
        AssertionKind::Header => response
            .headers
            .iter()
            .find(|header| header.name.eq_ignore_ascii_case(assertion.target.trim()))
            .map(|header| header.value.clone()),
        AssertionKind::JsonPath => serde_json::from_str::<Value>(&response.body)
            .ok()
            .and_then(|body| json_path(&body, &assertion.target).map(value_text)),
    };
    let passed = compare(assertion.operator, actual.as_deref(), &assertion.expected);
    let subject = match assertion.kind {
        AssertionKind::Status => "status".to_owned(),
        AssertionKind::ResponseTime => "response time (ms)".to_owned(),
        AssertionKind::Header => format!("header {}", assertion.target),
        AssertionKind::JsonPath => format!("JSON path {}", assertion.target),
    };
    let message = if passed {
        format!("{subject} matched")
    } else {
        format!(
            "{subject}: expected {} {}, actual {}",
            operator_text(assertion.operator),
            if assertion.expected.is_empty() {
                "(no value)"
            } else {
                &assertion.expected
            },
            actual.as_deref().unwrap_or("(missing)")
        )
    };
    AssertionResult {
        assertion_id: assertion.id.clone(),
        kind: assertion.kind,
        operator: assertion.operator,
        target: assertion.target.clone(),
        expected: assertion.expected.clone(),
        actual,
        passed,
        message,
    }
}

pub fn evaluate_extractions(
    extractions: &[VariableExtraction],
    response: &HttpResponseOutput,
) -> Vec<(VariableExtraction, Option<String>)> {
    extractions
        .iter()
        .map(|extraction| {
            let raw = match extraction.source {
                ExtractionSource::Status => Some(response.status.to_string()),
                ExtractionSource::Header => response
                    .headers
                    .iter()
                    .find(|header| header.name.eq_ignore_ascii_case(extraction.target.trim()))
                    .map(|header| header.value.clone()),
                ExtractionSource::JsonPath => serde_json::from_str::<Value>(&response.body)
                    .ok()
                    .and_then(|body| json_path(&body, &extraction.target).map(value_text)),
            };
            (extraction.clone(), raw)
        })
        .collect()
}

fn compare(operator: AssertionOperator, actual: Option<&str>, expected: &str) -> bool {
    match operator {
        AssertionOperator::Exists => actual.is_some(),
        AssertionOperator::NotExists => actual.is_none(),
        AssertionOperator::Equals => actual.is_some_and(|actual| actual == expected),
        AssertionOperator::NotEquals => actual.is_some_and(|actual| actual != expected),
        AssertionOperator::Contains => actual.is_some_and(|actual| actual.contains(expected)),
        AssertionOperator::LessThan => numeric_compare(actual, expected, |a, b| a < b),
        AssertionOperator::LessThanOrEqual => numeric_compare(actual, expected, |a, b| a <= b),
        AssertionOperator::GreaterThan => numeric_compare(actual, expected, |a, b| a > b),
    }
}

fn numeric_compare(
    actual: Option<&str>,
    expected: &str,
    compare: impl Fn(f64, f64) -> bool,
) -> bool {
    actual
        .and_then(|value| value.parse::<f64>().ok())
        .zip(expected.parse::<f64>().ok())
        .is_some_and(|(actual, expected)| compare(actual, expected))
}

fn json_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let path = path.trim().strip_prefix('$').unwrap_or(path.trim());
    if path.is_empty() {
        return Some(value);
    }
    let normalized = path
        .trim_start_matches('.')
        .replace('[', ".")
        .replace(']', "");
    normalized
        .split('.')
        .filter(|segment| !segment.is_empty())
        .try_fold(value, |current, segment| match current {
            Value::Object(map) => map.get(segment),
            Value::Array(items) => segment
                .parse::<usize>()
                .ok()
                .and_then(|index| items.get(index)),
            _ => None,
        })
}

fn value_text(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    }
}

fn operator_text(operator: AssertionOperator) -> &'static str {
    match operator {
        AssertionOperator::Equals => "equals",
        AssertionOperator::NotEquals => "does not equal",
        AssertionOperator::Contains => "contains",
        AssertionOperator::Exists => "exists",
        AssertionOperator::NotExists => "does not exist",
        AssertionOperator::LessThan => "less than",
        AssertionOperator::LessThanOrEqual => "at most",
        AssertionOperator::GreaterThan => "greater than",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::ResponseHeader;

    fn response() -> HttpResponseOutput {
        HttpResponseOutput {
            status: 201,
            status_text: "Created".to_owned(),
            elapsed_ms: 42,
            size_bytes: 29,
            headers: vec![ResponseHeader {
                name: "content-type".to_owned(),
                value: "application/json".to_owned(),
            }],
            body: r#"{"data":{"id":7,"name":"Laika"}}"#.to_owned(),
            content_type: Some("application/json".to_owned()),
            truncated: false,
        }
    }

    fn assertion(
        kind: AssertionKind,
        operator: AssertionOperator,
        target: &str,
        expected: &str,
    ) -> RequestAssertion {
        RequestAssertion {
            id: "assertion-1".to_owned(),
            kind,
            operator,
            target: target.to_owned(),
            expected: expected.to_owned(),
        }
    }

    #[test]
    fn evaluates_status_header_json_path_and_response_time() {
        let results = evaluate_assertions(
            &[
                assertion(AssertionKind::Status, AssertionOperator::Equals, "", "201"),
                assertion(
                    AssertionKind::Header,
                    AssertionOperator::Contains,
                    "Content-Type",
                    "json",
                ),
                assertion(
                    AssertionKind::JsonPath,
                    AssertionOperator::Equals,
                    "$.data.id",
                    "7",
                ),
                assertion(
                    AssertionKind::ResponseTime,
                    AssertionOperator::LessThan,
                    "",
                    "100",
                ),
            ],
            &response(),
        );
        assert!(results.iter().all(|result| result.passed));
    }

    #[test]
    fn reports_missing_paths_and_expected_and_actual_values() {
        let result = evaluate_assertions(
            &[assertion(
                AssertionKind::JsonPath,
                AssertionOperator::Equals,
                "$.missing",
                "ready",
            )],
            &response(),
        )
        .remove(0);
        assert!(!result.passed);
        assert_eq!(result.actual, None);
        assert!(result.message.contains("expected equals ready"));
    }

    fn extraction(
        source: ExtractionSource,
        target: &str,
        variable_name: &str,
    ) -> VariableExtraction {
        VariableExtraction {
            id: "extraction-1".to_owned(),
            source,
            target: target.to_owned(),
            variable_name: variable_name.to_owned(),
            is_secret: false,
        }
    }

    #[test]
    fn evaluates_status_header_and_json_path_extraction() {
        let results = evaluate_extractions(
            &[
                extraction(ExtractionSource::Status, "", "statusCode"),
                extraction(ExtractionSource::Header, "Content-Type", "contentType"),
                extraction(ExtractionSource::JsonPath, "$.data.id", "recordId"),
            ],
            &response(),
        );
        assert_eq!(results[0].1.as_deref(), Some("201"));
        assert_eq!(results[1].1.as_deref(), Some("application/json"));
        assert_eq!(results[2].1.as_deref(), Some("7"));
    }

    #[test]
    fn reports_missing_extraction_target_as_not_found() {
        let results = evaluate_extractions(
            &[extraction(ExtractionSource::JsonPath, "$.missing", "value")],
            &response(),
        );
        assert_eq!(results[0].1, None);
    }
}
