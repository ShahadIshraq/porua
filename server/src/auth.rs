use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

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
                    println!("✓ Loaded {} API key(s) from: {}", keys.count(), key_file_path);
                    return keys;
                } else {
                    println!("⚠ Warning: API key file is empty: {}", key_file_path);
                }
            }
            Err(e) => {
                println!("⚠ Warning: Could not read API key file '{}': {}", key_file_path, e);
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
                        println!("✓ Loaded {} API key(s) from: {}", keys.count(), location.display());
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
                    error: "API key required. Provide via X-API-Key or Authorization: Bearer header".to_string(),
                }),
            )
                .into_response()
        }
    }
}

/// Extract API key from headers
/// Supports both X-API-Key header and Authorization: Bearer header
fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    // Try X-API-Key header first
    if let Some(key) = headers.get("x-api-key") {
        if let Ok(key_str) = key.to_str() {
            return Some(key_str.to_string());
        }
    }

    // Try Authorization: Bearer header
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            if let Some(stripped) = auth_str.strip_prefix("Bearer ") {
                return Some(stripped.to_string());
            }
        }
    }

    None
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
}
