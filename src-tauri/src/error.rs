use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApplicationErrorCode {
    InvalidRequest,
    InvalidUrl,
    InvalidHeader,
    InvalidBody,
    InvalidAuth,
    NetworkError,
    Timeout,
    TlsError,
    Cancelled,
    InvalidInput,
    NotFound,
    DatabaseError,
    DatabaseUnavailable,
    UnexpectedError,
}

impl ApplicationErrorCode {
    /// The wire form, matching the `SCREAMING_SNAKE_CASE` serialization. Used
    /// when a code has to be stored rather than serialized, such as on a
    /// history row.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "INVALID_REQUEST",
            Self::InvalidUrl => "INVALID_URL",
            Self::InvalidHeader => "INVALID_HEADER",
            Self::InvalidBody => "INVALID_BODY",
            Self::InvalidAuth => "INVALID_AUTH",
            Self::NetworkError => "NETWORK_ERROR",
            Self::Timeout => "TIMEOUT",
            Self::TlsError => "TLS_ERROR",
            Self::Cancelled => "CANCELLED",
            Self::InvalidInput => "INVALID_INPUT",
            Self::NotFound => "NOT_FOUND",
            Self::DatabaseError => "DATABASE_ERROR",
            Self::DatabaseUnavailable => "DATABASE_UNAVAILABLE",
            Self::UnexpectedError => "UNEXPECTED_ERROR",
        }
    }

    /// True when the request never left the client, so it does not belong in
    /// history.
    pub fn is_pre_flight(self) -> bool {
        matches!(
            self,
            Self::InvalidRequest
                | Self::InvalidUrl
                | Self::InvalidHeader
                | Self::InvalidBody
                | Self::InvalidAuth
                | Self::Cancelled
        )
    }
}

/// A user-facing error contract shared by every Tauri command.
///
/// Messages are `&'static str` on purpose: nothing derived from a request, a
/// database row, or a driver error can leak into the payload that reaches the
/// UI, the notification system, or a history entry.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationError {
    pub code: ApplicationErrorCode,
    pub title: &'static str,
    pub message: &'static str,
    pub recoverable: bool,
}

impl ApplicationError {
    fn new(code: ApplicationErrorCode, title: &'static str, message: &'static str) -> Self {
        Self {
            code,
            title,
            message,
            recoverable: true,
        }
    }

    pub fn invalid_request() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidRequest,
            "Invalid request settings",
            "Set the timeout between 0.1 and 300 seconds, then try again.",
        )
    }

    pub fn invalid_url() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidUrl,
            "Invalid request URL",
            "Enter a complete HTTP or HTTPS URL and try again.",
        )
    }

    pub fn invalid_header() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidHeader,
            "Invalid request header",
            "Check the enabled header names and values, then try again.",
        )
    }

    pub fn invalid_body() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidBody,
            "Invalid request body",
            "The JSON request body is not valid.",
        )
    }

    pub fn invalid_auth() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidAuth,
            "Authentication is incomplete",
            "Enter the required authentication fields and try again.",
        )
    }

    pub fn timeout() -> Self {
        Self::new(
            ApplicationErrorCode::Timeout,
            "Request timed out",
            "Increase the timeout or check whether the server is responding.",
        )
    }

    pub fn cancelled() -> Self {
        Self::new(
            ApplicationErrorCode::Cancelled,
            "Request cancelled",
            "The request was stopped before it completed.",
        )
    }

    pub fn network() -> Self {
        Self::new(
            ApplicationErrorCode::NetworkError,
            "Could not reach the server",
            "Check the address and your network connection, then try again.",
        )
    }

    pub fn tls() -> Self {
        Self::new(
            ApplicationErrorCode::TlsError,
            "Secure connection failed",
            "The server certificate or TLS configuration could not be verified.",
        )
    }

    pub fn invalid_input() -> Self {
        Self::new(
            ApplicationErrorCode::InvalidInput,
            "Invalid value",
            "Enter a name between 1 and 200 characters, then try again.",
        )
    }

    pub fn not_found() -> Self {
        Self::new(
            ApplicationErrorCode::NotFound,
            "Item no longer exists",
            "This item was removed. Refresh the workspace and try again.",
        )
    }

    pub fn database() -> Self {
        Self::new(
            ApplicationErrorCode::DatabaseError,
            "Workspace could not be updated",
            "The change was not saved. Try again, and restart Laika if the problem continues.",
        )
    }

    pub fn database_unavailable() -> Self {
        Self::new(
            ApplicationErrorCode::DatabaseUnavailable,
            "Workspace storage is unavailable",
            "Laika could not open its local database, so collections and history are disabled.",
        )
    }

    pub fn unexpected() -> Self {
        Self::new(
            ApplicationErrorCode::UnexpectedError,
            "Request failed",
            "An unexpected error occurred while processing the request.",
        )
    }
}

impl std::fmt::Display for ApplicationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.title, self.message)
    }
}

impl std::error::Error for ApplicationError {}
