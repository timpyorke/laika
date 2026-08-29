use crate::error::ApplicationError;
use reqwest::{
    header::{HeaderName, HeaderValue, CONTENT_TYPE},
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    error::Error,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES: u64 = 10 * 1024 * 1024;
const MIN_TIMEOUT_MS: u64 = 100;
const MAX_TIMEOUT_MS: u64 = 5 * 60 * 1000;
const MIN_RESPONSE_BYTES: u64 = 1024;
const MAX_RESPONSE_BYTES: u64 = 50 * 1024 * 1024;

fn default_timeout_ms() -> u64 {
    DEFAULT_TIMEOUT_MS
}
fn default_max_response_bytes() -> u64 {
    DEFAULT_MAX_RESPONSE_BYTES
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestInput {
    pub request_id: String,
    /// Set when the execution came from a request saved in a collection, so the
    /// history entry can link back to it. `None` for ad-hoc requests.
    #[serde(default)]
    pub saved_request_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValueEntry>,
    #[serde(default)]
    pub headers: Vec<KeyValueEntry>,
    pub body: RequestBody,
    pub auth: RequestAuth,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_max_response_bytes")]
    pub max_response_bytes: u64,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

impl HttpMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
            HttpMethod::Put => "PUT",
            HttpMethod::Patch => "PATCH",
            HttpMethod::Delete => "DELETE",
            HttpMethod::Head => "HEAD",
            HttpMethod::Options => "OPTIONS",
        }
    }
}

impl From<HttpMethod> for Method {
    fn from(value: HttpMethod) -> Self {
        match value {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Put => Method::PUT,
            HttpMethod::Patch => Method::PATCH,
            HttpMethod::Delete => Method::DELETE,
            HttpMethod::Head => Method::HEAD,
            HttpMethod::Options => Method::OPTIONS,
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueEntry {
    pub enabled: bool,
    pub key: String,
    pub value: String,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum RequestBody {
    None,
    Json { content: String },
    Text { content: String },
    Form { entries: Vec<KeyValueEntry> },
}

#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestAuth {
    None,
    Bearer { token: String },
    Basic { username: String, password: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseOutput {
    pub status: u16,
    pub status_text: String,
    pub elapsed_ms: u64,
    pub size_bytes: u64,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    pub content_type: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseHeader {
    pub name: String,
    pub value: String,
}

struct ValidatedRequest {
    request_id: String,
    method: Method,
    url: Url,
    params: Vec<(String, String)>,
    headers: Vec<(HeaderName, HeaderValue)>,
    body: RequestBody,
    auth: RequestAuth,
    timeout: Duration,
    max_response_bytes: usize,
}

#[derive(Clone)]
pub struct HttpEngine {
    client: Client,
    in_flight: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl HttpEngine {
    pub fn new() -> Result<Self, ApplicationError> {
        let client = Client::builder()
            .user_agent(concat!("Laika/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| ApplicationError::unexpected())?;
        Ok(Self {
            client,
            in_flight: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn execute(
        &self,
        input: HttpRequestInput,
    ) -> Result<HttpResponseOutput, ApplicationError> {
        let request = validate_request(input)?;
        let request_id = request.request_id.clone();
        let token = CancellationToken::new();
        {
            let mut in_flight = self
                .in_flight
                .lock()
                .map_err(|_| ApplicationError::unexpected())?;
            if let Some(previous) = in_flight.insert(request_id.clone(), token.clone()) {
                previous.cancel();
            }
        }

        let timeout = request.timeout;
        let result = tokio::select! {
            _ = token.cancelled() => Err(ApplicationError::cancelled()),
            result = tokio::time::timeout(timeout, self.perform(request)) => match result {
                Ok(response) => response,
                Err(_) => Err(ApplicationError::timeout()),
            }
        };
        if let Ok(mut in_flight) = self.in_flight.lock() {
            in_flight.remove(&request_id);
        }
        result
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let Ok(in_flight) = self.in_flight.lock() else {
            return false;
        };
        if let Some(token) = in_flight.get(request_id) {
            token.cancel();
            true
        } else {
            false
        }
    }

    async fn perform(
        &self,
        request: ValidatedRequest,
    ) -> Result<HttpResponseOutput, ApplicationError> {
        let started = Instant::now();
        let mut builder = self.client.request(request.method, request.url);
        if !request.params.is_empty() {
            builder = builder.query(&request.params);
        }
        let has_content_type = request.headers.iter().any(|(name, _)| name == CONTENT_TYPE);
        for (name, value) in request.headers {
            builder = builder.header(name, value);
        }
        builder = match request.auth {
            RequestAuth::None => builder,
            RequestAuth::Bearer { token } => builder.bearer_auth(token),
            RequestAuth::Basic { username, password } => {
                builder.basic_auth(username, Some(password))
            }
        };
        builder = match request.body {
            RequestBody::None => builder,
            RequestBody::Json { content } => {
                let builder = builder.body(content);
                if has_content_type {
                    builder
                } else {
                    builder.header(CONTENT_TYPE, "application/json")
                }
            }
            RequestBody::Text { content } => {
                let builder = builder.body(content);
                if has_content_type {
                    builder
                } else {
                    builder.header(CONTENT_TYPE, "text/plain; charset=utf-8")
                }
            }
            RequestBody::Form { entries } => {
                let fields: Vec<(String, String)> = entries
                    .into_iter()
                    .filter(|entry| entry.enabled && !entry.key.trim().is_empty())
                    .map(|entry| (entry.key, entry.value))
                    .collect();
                builder.form(&fields)
            }
        };

        let mut response = builder.send().await.map_err(classify_reqwest_error)?;
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let headers = response
            .headers()
            .iter()
            .map(|(name, value)| ResponseHeader {
                name: name.as_str().to_owned(),
                value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
            })
            .collect();
        let mut body = Vec::new();
        let mut truncated = false;
        while let Some(chunk) = response.chunk().await.map_err(classify_reqwest_error)? {
            let remaining = request.max_response_bytes.saturating_sub(body.len());
            if chunk.len() > remaining {
                body.extend_from_slice(&chunk[..remaining]);
                truncated = true;
                break;
            }
            body.extend_from_slice(&chunk);
        }

        Ok(HttpResponseOutput {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or_default().to_owned(),
            elapsed_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
            size_bytes: body.len() as u64,
            headers,
            body: String::from_utf8_lossy(&body).into_owned(),
            content_type,
            truncated,
        })
    }
}

fn validate_request(input: HttpRequestInput) -> Result<ValidatedRequest, ApplicationError> {
    if input.request_id.trim().is_empty()
        || !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&input.timeout_ms)
        || !(MIN_RESPONSE_BYTES..=MAX_RESPONSE_BYTES).contains(&input.max_response_bytes)
    {
        return Err(ApplicationError::invalid_request());
    }

    let url = Url::parse(input.url.trim()).map_err(|_| ApplicationError::invalid_url())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ApplicationError::invalid_url());
    }

    let params = input
        .params
        .into_iter()
        .filter(|entry| entry.enabled && !entry.key.trim().is_empty())
        .map(|entry| (entry.key, entry.value))
        .collect();
    let headers = input
        .headers
        .into_iter()
        .filter(|entry| entry.enabled && !entry.key.trim().is_empty())
        .map(|entry| {
            let name = HeaderName::from_bytes(entry.key.trim().as_bytes())
                .map_err(|_| ApplicationError::invalid_header())?;
            let value = HeaderValue::from_str(&entry.value)
                .map_err(|_| ApplicationError::invalid_header())?;
            Ok((name, value))
        })
        .collect::<Result<Vec<_>, ApplicationError>>()?;

    if let RequestBody::Json { content } = &input.body {
        serde_json::from_str::<serde_json::Value>(content)
            .map_err(|_| ApplicationError::invalid_body())?;
    }
    match &input.auth {
        RequestAuth::Bearer { token } => {
            if token.trim().is_empty()
                || HeaderValue::from_str(&format!("Bearer {token}")).is_err()
            {
                return Err(ApplicationError::invalid_auth());
            }
        }
        RequestAuth::Basic { username, .. } if username.trim().is_empty() => {
            return Err(ApplicationError::invalid_auth())
        }
        _ => {}
    }

    Ok(ValidatedRequest {
        request_id: input.request_id,
        method: input.method.into(),
        url,
        params,
        headers,
        body: input.body,
        auth: input.auth,
        timeout: Duration::from_millis(input.timeout_ms),
        max_response_bytes: input.max_response_bytes as usize,
    })
}

fn classify_reqwest_error(error: reqwest::Error) -> ApplicationError {
    if error.is_timeout() {
        return ApplicationError::timeout();
    }
    let mut source = error.source();
    while let Some(cause) = source {
        let description = cause.to_string().to_ascii_lowercase();
        if description.contains("certificate")
            || description.contains("tls")
            || description.contains("ssl")
        {
            return ApplicationError::tls();
        }
        source = cause.source();
    }
    if error.is_connect() || error.is_request() || error.is_body() || error.is_decode() {
        ApplicationError::network()
    } else {
        ApplicationError::unexpected()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ApplicationErrorCode;
    use tokio::time::sleep;
    use wiremock::{
        matchers::{body_json, body_string, header, method, path, query_param},
        Mock, MockServer, ResponseTemplate,
    };

    fn request(url: String) -> HttpRequestInput {
        HttpRequestInput {
            request_id: "test-request".to_owned(),
            saved_request_id: None,
            name: None,
            method: HttpMethod::Get,
            url,
            params: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::None,
            auth: RequestAuth::None,
            timeout_ms: 2_000,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
        }
    }

    #[test]
    fn rejects_non_http_and_credential_urls() {
        let ftp = request("ftp://example.com/file".to_owned());
        assert!(matches!(
            validate_request(ftp).err().unwrap().code,
            ApplicationErrorCode::InvalidUrl
        ));
        let credentials = request("https://user:secret@example.com".to_owned());
        assert!(matches!(
            validate_request(credentials).err().unwrap().code,
            ApplicationErrorCode::InvalidUrl
        ));
    }

    #[test]
    fn rejects_invalid_json_and_headers_without_echoing_values() {
        let mut invalid_json = request("https://example.com".to_owned());
        invalid_json.body = RequestBody::Json {
            content: "{secret".to_owned(),
        };
        let error = validate_request(invalid_json).err().unwrap();
        assert!(matches!(error.code, ApplicationErrorCode::InvalidBody));
        assert!(!error.message.contains("secret"));

        let mut invalid_header = request("https://example.com".to_owned());
        invalid_header.headers.push(KeyValueEntry {
            enabled: true,
            key: "Authorization\nInjected".to_owned(),
            value: "Bearer secret".to_owned(),
        });
        let error = validate_request(invalid_header).err().unwrap();
        assert!(matches!(error.code, ApplicationErrorCode::InvalidHeader));
        assert!(!error.message.contains("secret"));
    }

    #[test]
    fn rejects_bearer_token_that_is_not_a_valid_header_value() {
        let mut invalid_token = request("https://example.com".to_owned());
        invalid_token.auth = RequestAuth::Bearer {
            token: "secret-token\n".to_owned(),
        };
        let error = validate_request(invalid_token).err().unwrap();
        assert!(matches!(error.code, ApplicationErrorCode::InvalidAuth));
        assert!(!error.message.contains("secret-token"));
    }

    #[tokio::test]
    async fn executes_get_and_maps_response_metadata() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/users"))
            .and(query_param("page", "2"))
            .and(header("x-client", "laika"))
            .respond_with(
                ResponseTemplate::new(201)
                    .insert_header("content-type", "application/json")
                    .set_body_json(serde_json::json!({"ok": true})),
            )
            .mount(&server)
            .await;
        let mut input = request(format!("{}/users", server.uri()));
        input.params.push(KeyValueEntry {
            enabled: true,
            key: "page".to_owned(),
            value: "2".to_owned(),
        });
        input.headers.push(KeyValueEntry {
            enabled: true,
            key: "x-client".to_owned(),
            value: "laika".to_owned(),
        });
        let response = HttpEngine::new().unwrap().execute(input).await.unwrap();
        assert_eq!(response.status, 201);
        assert!(response.body.contains("\"ok\":true"));
        assert!(response.size_bytes > 0);
        assert_eq!(response.content_type.as_deref(), Some("application/json"));
        assert!(!response.truncated);
    }

    #[tokio::test]
    async fn sends_json_and_basic_auth() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/login"))
            .and(header("authorization", "Basic dXNlcjpwYXNz"))
            .and(body_json(serde_json::json!({"name": "Laika"})))
            .respond_with(ResponseTemplate::new(204))
            .mount(&server)
            .await;
        let mut input = request(format!("{}/login", server.uri()));
        input.method = HttpMethod::Post;
        input.body = RequestBody::Json {
            content: "{\"name\":\"Laika\"}".to_owned(),
        };
        input.auth = RequestAuth::Basic {
            username: "user".to_owned(),
            password: "pass".to_owned(),
        };
        let response = HttpEngine::new().unwrap().execute(input).await.unwrap();
        assert_eq!(response.status, 204);
    }

    #[tokio::test]
    async fn sends_form_and_bearer_auth_and_returns_non_success_responses() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/profile"))
            .and(header("authorization", "Bearer test-token"))
            .and(header("content-type", "application/x-www-form-urlencoded"))
            .and(body_string("display_name=Laika"))
            .respond_with(ResponseTemplate::new(422).set_body_string("validation failed"))
            .mount(&server)
            .await;
        let mut input = request(format!("{}/profile", server.uri()));
        input.method = HttpMethod::Patch;
        input.body = RequestBody::Form {
            entries: vec![KeyValueEntry {
                enabled: true,
                key: "display_name".to_owned(),
                value: "Laika".to_owned(),
            }],
        };
        input.auth = RequestAuth::Bearer {
            token: "test-token".to_owned(),
        };
        let response = HttpEngine::new().unwrap().execute(input).await.unwrap();
        assert_eq!(response.status, 422);
        assert_eq!(response.body, "validation failed");
    }

    #[tokio::test]
    async fn enforces_response_limit() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![b'x'; 2_048]))
            .mount(&server)
            .await;
        let mut input = request(server.uri());
        input.max_response_bytes = 1_024;
        let response = HttpEngine::new().unwrap().execute(input).await.unwrap();
        assert_eq!(response.size_bytes, 1_024);
        assert!(response.truncated);
    }

    #[tokio::test]
    async fn supports_timeout_and_cancellation() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_millis(500)))
            .mount(&server)
            .await;
        let mut timeout_input = request(server.uri());
        timeout_input.timeout_ms = 100;
        let timeout_error = HttpEngine::new()
            .unwrap()
            .execute(timeout_input)
            .await
            .unwrap_err();
        assert!(matches!(timeout_error.code, ApplicationErrorCode::Timeout));

        let engine = HttpEngine::new().unwrap();
        let cancel_input = request(server.uri());
        let request_id = cancel_input.request_id.clone();
        let running_engine = engine.clone();
        let task = tokio::spawn(async move { running_engine.execute(cancel_input).await });
        sleep(Duration::from_millis(30)).await;
        assert!(engine.cancel(&request_id));
        let cancel_error = task.await.unwrap().unwrap_err();
        assert!(matches!(cancel_error.code, ApplicationErrorCode::Cancelled));
    }
}
