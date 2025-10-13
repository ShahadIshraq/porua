use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt;

#[derive(Debug)]
pub enum TtsError {
    // I/O errors
    Io(std::io::Error),
    FileNotFound(String),

    // TTS engine errors
    TtsEngine(String),
    PoolExhausted,

    // Audio processing errors
    AudioParsing(String),
    WavConcatenation(String),

    // Request validation errors
    InvalidRequest(String),
    EmptyText,
    InvalidSpeed(f32),

    // Auth errors
    Unauthorized,
    InvalidApiKey,

    // Internal errors
    TaskJoin(String),
    Unknown(String),
}

impl fmt::Display for TtsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TtsError::Io(e) => write!(f, "I/O error: {}", e),
            TtsError::FileNotFound(path) => write!(f, "File not found: {}", path),
            TtsError::TtsEngine(msg) => write!(f, "TTS engine error: {}", msg),
            TtsError::PoolExhausted => write!(f, "TTS pool exhausted"),
            TtsError::AudioParsing(msg) => write!(f, "Audio parsing error: {}", msg),
            TtsError::WavConcatenation(msg) => write!(f, "WAV concatenation error: {}", msg),
            TtsError::InvalidRequest(msg) => write!(f, "Invalid request: {}", msg),
            TtsError::EmptyText => write!(f, "Text cannot be empty"),
            TtsError::InvalidSpeed(speed) => write!(f, "Invalid speed: {} (must be 0.0-3.0)", speed),
            TtsError::Unauthorized => write!(f, "Unauthorized"),
            TtsError::InvalidApiKey => write!(f, "Invalid API key"),
            TtsError::TaskJoin(msg) => write!(f, "Task execution error: {}", msg),
            TtsError::Unknown(msg) => write!(f, "Unknown error: {}", msg),
        }
    }
}

impl std::error::Error for TtsError {}

// Conversions
impl From<std::io::Error> for TtsError {
    fn from(err: std::io::Error) -> Self {
        TtsError::Io(err)
    }
}

impl From<hound::Error> for TtsError {
    fn from(err: hound::Error) -> Self {
        TtsError::AudioParsing(err.to_string())
    }
}

impl From<serde_json::Error> for TtsError {
    fn from(err: serde_json::Error) -> Self {
        TtsError::Unknown(err.to_string())
    }
}

impl From<tokio::task::JoinError> for TtsError {
    fn from(err: tokio::task::JoinError) -> Self {
        TtsError::TaskJoin(err.to_string())
    }
}

// Axum integration
impl IntoResponse for TtsError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            TtsError::EmptyText | TtsError::InvalidSpeed(_) | TtsError::InvalidRequest(_) => {
                (StatusCode::BAD_REQUEST, self.to_string())
            }
            TtsError::Unauthorized | TtsError::InvalidApiKey => {
                (StatusCode::UNAUTHORIZED, self.to_string())
            }
            TtsError::FileNotFound(_) => {
                (StatusCode::NOT_FOUND, self.to_string())
            }
            _ => {
                tracing::error!("Internal error: {}", self);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        (status, axum::Json(serde_json::json!({
            "status": "error",
            "error": message
        }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, TtsError>;
