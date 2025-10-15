use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt;

#[derive(Debug)]
pub enum TtsError {
    // I/O errors
    Io(std::io::Error),
    #[allow(dead_code)]
    FileNotFound(String),

    // TTS engine errors
    TtsEngine(String),
    #[allow(dead_code)]
    PoolExhausted,

    // Audio processing errors
    AudioParsing(String),
    WavConcatenation(String),

    // Request validation errors
    #[allow(dead_code)]
    InvalidRequest(String),
    EmptyText,
    InvalidSpeed(f32),

    // Auth errors
    #[allow(dead_code)]
    Unauthorized,
    #[allow(dead_code)]
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

impl From<Box<dyn std::error::Error>> for TtsError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        TtsError::Unknown(err.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    // ===== Error Type Conversion Tests =====

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let tts_err: TtsError = io_err.into();

        assert!(matches!(tts_err, TtsError::Io(_)));
        assert!(tts_err.to_string().contains("I/O error"));
    }

    #[test]
    fn test_from_hound_error() {
        // Create a mock hound error by trying to parse invalid WAV data
        let invalid_wav = vec![0u8; 10];
        let cursor = std::io::Cursor::new(invalid_wav);
        let hound_result = hound::WavReader::new(cursor);

        if let Err(hound_err) = hound_result {
            let tts_err: TtsError = hound_err.into();
            assert!(matches!(tts_err, TtsError::AudioParsing(_)));
            assert!(tts_err.to_string().contains("Audio parsing error"));
        }
    }

    #[test]
    fn test_from_serde_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err();
        let tts_err: TtsError = json_err.into();

        assert!(matches!(tts_err, TtsError::Unknown(_)));
    }

    #[test]
    fn test_from_tokio_join_error() {
        // Create a task that panics to generate a JoinError
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(async {
            let handle = tokio::spawn(async {
                panic!("test panic");
            });
            handle.await
        });

        if let Err(join_err) = result {
            let tts_err: TtsError = join_err.into();
            assert!(matches!(tts_err, TtsError::TaskJoin(_)));
            assert!(tts_err.to_string().contains("Task execution error"));
        }
    }

    // ===== HTTP Status Mapping Tests =====

    #[test]
    fn test_empty_text_returns_400() {
        let err = TtsError::EmptyText;
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_invalid_speed_returns_400() {
        let err = TtsError::InvalidSpeed(5.0);
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_invalid_request_returns_400() {
        let err = TtsError::InvalidRequest("test".to_string());
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_unauthorized_returns_401() {
        let err = TtsError::Unauthorized;
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_invalid_api_key_returns_401() {
        let err = TtsError::InvalidApiKey;
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_file_not_found_returns_404() {
        let err = TtsError::FileNotFound("test.txt".to_string());
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_tts_engine_error_returns_500() {
        let err = TtsError::TtsEngine("engine failed".to_string());
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_io_error_returns_500() {
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "test");
        let err = TtsError::Io(io_err);
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_pool_exhausted_returns_500() {
        let err = TtsError::PoolExhausted;
        let response = err.into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ===== Error Message Tests =====

    #[test]
    fn test_empty_text_message() {
        let err = TtsError::EmptyText;
        assert_eq!(err.to_string(), "Text cannot be empty");
    }

    #[test]
    fn test_invalid_speed_message() {
        let err = TtsError::InvalidSpeed(5.5);
        assert!(err.to_string().contains("5.5"));
        assert!(err.to_string().contains("0.0-3.0"));
    }

    #[test]
    fn test_tts_engine_error_message() {
        let err = TtsError::TtsEngine("model not found".to_string());
        assert!(err.to_string().contains("TTS engine error"));
        assert!(err.to_string().contains("model not found"));
    }

    #[test]
    fn test_file_not_found_message() {
        let err = TtsError::FileNotFound("/path/to/file".to_string());
        assert!(err.to_string().contains("File not found"));
        assert!(err.to_string().contains("/path/to/file"));
    }

    // ===== Error Display Tests =====

    #[test]
    fn test_error_implements_display() {
        let err = TtsError::EmptyText;
        let display_str = format!("{}", err);
        assert!(!display_str.is_empty());
    }

    #[test]
    fn test_error_implements_debug() {
        let err = TtsError::EmptyText;
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("EmptyText"));
    }

    #[test]
    fn test_error_implements_std_error() {
        fn accepts_std_error(_: &dyn std::error::Error) {}
        let err = TtsError::EmptyText;
        accepts_std_error(&err);
    }
}
