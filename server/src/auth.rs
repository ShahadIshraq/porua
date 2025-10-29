use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use crate::utils::header_utils::extract_api_key;

#[derive(Debug, Clone)]
pub struct ApiKeys {
    keys: HashSet<String>,
}

impl ApiKeys {
    /// Create a new empty ApiKeys instance (no authentication)
    pub fn empty() -> Self {
        Self {
            keys: HashSet::new(),
        }
    }

    /// Create a new ApiKeys instance from a set of keys (for testing)
    #[allow(dead_code)]
    pub fn from_keys(keys: HashSet<String>) -> Self {
        Self { keys }
    }

    /// Load API keys from a file
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, std::io::Error> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut keys = HashSet::new();

        for line in reader.lines() {
            let line = line?;
            let trimmed = line.trim();

            // Skip empty lines and comments
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            keys.insert(trimmed.to_string());
        }

        Ok(Self { keys })
    }

    /// Check if authentication is enabled (i.e., keys are configured)
    pub fn is_enabled(&self) -> bool {
        !self.keys.is_empty()
    }

    /// Validate if a key is valid
    pub fn validate(&self, key: &str) -> bool {
        self.keys.contains(key)
    }

    /// Get the number of configured keys
    pub fn count(&self) -> usize {
        self.keys.len()
    }
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    status: String,
    error: String,
}

/// Try to load API keys from various locations
pub fn load_api_keys() -> ApiKeys {
    // Check environment variable first
    if let Ok(key_file_path) = std::env::var("TTS_API_KEY_FILE") {
        match ApiKeys::from_file(&key_file_path) {
            Ok(keys) => {
                if keys.count() > 0 {
                    println!(
                        "✓ Loaded {} API key(s) from: {}",
                        keys.count(),
                        key_file_path
                    );
                    return keys;
                } else {
                    println!("⚠ Warning: API key file is empty: {}", key_file_path);
                }
            }
            Err(e) => {
                println!(
                    "⚠ Warning: Could not read API key file '{}': {}",
                    key_file_path, e
                );
            }
        }
    }

    // Try default locations
    let mut default_locations = vec![
        PathBuf::from("./api_keys.txt"),
        PathBuf::from("/etc/tts-server/api_keys.txt"),
    ];

    // Add home directory location if available
    if let Some(home) = dirs::home_dir() {
        default_locations.insert(1, home.join(".tts-server/api_keys.txt"));
    }

    for location in default_locations {
        if location.exists() {
            match ApiKeys::from_file(&location) {
                Ok(keys) => {
                    if keys.count() > 0 {
                        println!(
                            "✓ Loaded {} API key(s) from: {}",
                            keys.count(),
                            location.display()
                        );
                        return keys;
                    }
                }
                Err(e) => {
                    tracing::debug!("Could not read key file {:?}: {}", location, e);
                }
            }
        }
    }

    // No keys found - run without authentication
    println!("ℹ No API key file found - authentication disabled");
    ApiKeys::empty()
}

/// Middleware to check API key authentication
pub async fn auth_middleware(
    State(keys): State<ApiKeys>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    // If no keys configured, skip authentication
    if !keys.is_enabled() {
        return next.run(request).await;
    }

    // Try to extract API key from headers
    let api_key = extract_api_key(&headers);

    match api_key {
        Some(key) if keys.validate(&key) => {
            // Valid key - proceed
            next.run(request).await
        }
        Some(_) => {
            // Invalid key
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    status: "error".to_string(),
                    error: "Invalid API key".to_string(),
                }),
            )
                .into_response()
        }
        None => {
            // No key provided
            (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    status: "error".to_string(),
                    error:
                        "API key required. Provide via X-API-Key or Authorization: Bearer header"
                            .to_string(),
                }),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_keys() {
        let keys = ApiKeys::empty();
        assert!(!keys.is_enabled());
        assert_eq!(keys.count(), 0);
        assert!(!keys.validate("any-key"));
    }

    #[test]
    fn test_validate_key() {
        let mut key_set = HashSet::new();
        key_set.insert("valid-key-1".to_string());
        key_set.insert("valid-key-2".to_string());

        let keys = ApiKeys { keys: key_set };

        assert!(keys.is_enabled());
        assert_eq!(keys.count(), 2);
        assert!(keys.validate("valid-key-1"));
        assert!(keys.validate("valid-key-2"));
        assert!(!keys.validate("invalid-key"));
    }

    #[test]
    fn test_api_keys_from_file() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "key-1").unwrap();
        writeln!(temp_file, "key-2").unwrap();
        writeln!(temp_file, "# comment line").unwrap();
        writeln!(temp_file, "").unwrap(); // empty line
        writeln!(temp_file, "key-3").unwrap();
        temp_file.flush().unwrap();

        let keys = ApiKeys::from_file(temp_file.path()).unwrap();

        assert_eq!(keys.count(), 3);
        assert!(keys.validate("key-1"));
        assert!(keys.validate("key-2"));
        assert!(keys.validate("key-3"));
        assert!(!keys.validate("# comment line"));
    }

    #[test]
    fn test_api_keys_from_file_not_found() {
        let result = ApiKeys::from_file("/nonexistent/path/to/file.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_api_keys_from_empty_file() {
        use tempfile::NamedTempFile;

        let temp_file = NamedTempFile::new().unwrap();
        let keys = ApiKeys::from_file(temp_file.path()).unwrap();

        assert_eq!(keys.count(), 0);
        assert!(!keys.is_enabled());
    }

    #[test]
    fn test_api_keys_trim_whitespace() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "  key-with-spaces  ").unwrap();
        writeln!(temp_file, "\tkey-with-tabs\t").unwrap();
        temp_file.flush().unwrap();

        let keys = ApiKeys::from_file(temp_file.path()).unwrap();

        assert_eq!(keys.count(), 2);
        assert!(keys.validate("key-with-spaces"));
        assert!(keys.validate("key-with-tabs"));
        assert!(!keys.validate("  key-with-spaces  "));
    }

    // Tests for extract_api_key moved to utils::header_utils

    #[test]
    fn test_extract_api_key_x_api_key_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "test-key-123".parse().unwrap());
        let key = extract_api_key(&headers);
        assert_eq!(key, Some("test-key-123".to_string()));
    }

    #[test]
    fn test_extract_api_key_bearer_token() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer test-token-456".parse().unwrap());
        let key = extract_api_key(&headers);
        assert_eq!(key, Some("test-token-456".to_string()));
    }

    #[test]
    fn test_extract_api_key_no_header() {
        let headers = HeaderMap::new();
        let key = extract_api_key(&headers);
        assert_eq!(key, None);
    }

    #[test]
    fn test_extract_api_key_prefers_x_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "x-api-key-value".parse().unwrap());
        headers.insert("authorization", "Bearer bearer-value".parse().unwrap());
        let key = extract_api_key(&headers);
        assert_eq!(key, Some("x-api-key-value".to_string()));
    }

    #[test]
    fn test_extract_api_key_invalid_bearer_format() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "InvalidFormat token".parse().unwrap());
        let key = extract_api_key(&headers);

        assert_eq!(key, None);
    }

    #[test]
    fn test_api_keys_case_sensitive() {
        let mut key_set = HashSet::new();
        key_set.insert("CaseSensitiveKey".to_string());

        let keys = ApiKeys { keys: key_set };

        assert!(keys.validate("CaseSensitiveKey"));
        assert!(!keys.validate("casesensitivekey"));
        assert!(!keys.validate("CASESENSITIVEKEY"));
    }

    #[test]
    fn test_api_keys_clone() {
        let mut key_set = HashSet::new();
        key_set.insert("key-1".to_string());

        let keys = ApiKeys { keys: key_set };
        let cloned = keys.clone();

        assert_eq!(cloned.count(), 1);
        assert!(cloned.validate("key-1"));
    }

    #[test]
    fn test_api_keys_debug_format() {
        let keys = ApiKeys::empty();
        let debug_str = format!("{:?}", keys);

        assert!(debug_str.contains("ApiKeys"));
    }
}
