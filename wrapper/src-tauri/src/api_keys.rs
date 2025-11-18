use anyhow::{Context, Result};
use keyring::Entry;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{error, info};

/// Service name used for keyring entries
const KEYRING_SERVICE: &str = "porua";

/// Validation timeout in seconds
const VALIDATION_TIMEOUT_SECS: u64 = 10;

/// Shared HTTP client for API validation requests
/// Using a single client enables connection pooling and better performance
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(VALIDATION_TIMEOUT_SECS))
        .build()
        .unwrap_or_else(|e| {
            // Log error and fall back to default client
            // This should rarely fail, but we avoid panicking
            eprintln!("WARNING: Failed to create configured HTTP client: {}. Using default.", e);
            reqwest::Client::new()
        })
});

/// Key identifiers for secure storage
pub const GEMINI_KEY_ID: &str = "porua.api.gemini";
pub const OPENAI_KEY_ID: &str = "porua.api.openai";

/// Supported LLM providers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    OpenAI,
}

impl Provider {
    /// Get the key identifier for this provider
    pub fn key_id(&self) -> &'static str {
        match self {
            Provider::Gemini => GEMINI_KEY_ID,
            Provider::OpenAI => OPENAI_KEY_ID,
        }
    }

    /// Parse provider from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "gemini" => Some(Provider::Gemini),
            "openai" => Some(Provider::OpenAI),
            _ => None,
        }
    }

    /// Get provider name as string
    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::Gemini => "gemini",
            Provider::OpenAI => "openai",
        }
    }
}

/// Result of API key validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub message: String,
}

impl ValidationResult {
    pub fn success() -> Self {
        Self {
            valid: true,
            message: "API key validated successfully".to_string(),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            valid: false,
            message: message.into(),
        }
    }
}

/// Status of an API key for a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyStatus {
    pub provider: String,
    pub configured: bool,
    /// Masked representation of the key (e.g., "sk-...abc")
    pub masked_key: Option<String>,
}

/// Store an API key securely in the system keychain
pub fn store_api_key(provider: Provider, key: &str) -> Result<()> {
    let entry = Entry::new(KEYRING_SERVICE, provider.key_id())
        .context("Failed to create keyring entry")?;

    entry
        .set_password(key)
        .context("Failed to store API key in keychain")?;

    info!("Stored API key for provider: {:?}", provider);
    Ok(())
}

/// Retrieve an API key from the system keychain
pub fn get_api_key(provider: Provider) -> Result<Option<String>> {
    let entry = Entry::new(KEYRING_SERVICE, provider.key_id())
        .context("Failed to create keyring entry")?;

    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            error!("Failed to retrieve API key for {:?}: {}", provider, e);
            Err(anyhow::anyhow!("Failed to retrieve API key: {}", e))
        }
    }
}

/// Delete an API key from the system keychain
pub fn delete_api_key(provider: Provider) -> Result<()> {
    let entry = Entry::new(KEYRING_SERVICE, provider.key_id())
        .context("Failed to create keyring entry")?;

    match entry.delete_password() {
        Ok(()) => {
            info!("Deleted API key for provider: {:?}", provider);
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            // Key doesn't exist, that's fine
            Ok(())
        }
        Err(e) => {
            error!("Failed to delete API key for {:?}: {}", provider, e);
            Err(anyhow::anyhow!("Failed to delete API key: {}", e))
        }
    }
}

/// Check if an API key exists for a provider
pub fn has_api_key(provider: Provider) -> Result<bool> {
    Ok(get_api_key(provider)?.is_some())
}

/// Get the status of an API key for a provider
pub fn get_key_status(provider: Provider) -> Result<KeyStatus> {
    let key = get_api_key(provider)?;
    let masked = key.as_ref().map(|k| mask_key(k));

    Ok(KeyStatus {
        provider: provider.as_str().to_string(),
        configured: key.is_some(),
        masked_key: masked,
    })
}

/// Mask an API key for display (show first 4 and last 4 characters)
/// Uses character-based indexing to safely handle multi-byte UTF-8 characters
fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        "••••••••".to_string()
    } else {
        let start: String = chars[..4].iter().collect();
        let end: String = chars[chars.len() - 4..].iter().collect();
        format!("{}••••••••{}", start, end)
    }
}

/// Handle common HTTP response errors and convert to ValidationResult
/// This reduces code duplication between provider validation functions
fn handle_validation_response(
    response: Result<reqwest::Response, reqwest::Error>,
    provider_name: &str,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ValidationResult> + Send + '_>> {
    Box::pin(async move {
        match response {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    ValidationResult::success()
                } else if status.as_u16() == 400 {
                    ValidationResult::error("Invalid API key format")
                } else if status.as_u16() == 401 || status.as_u16() == 403 {
                    ValidationResult::error("Invalid API key or insufficient permissions")
                } else if status.as_u16() == 429 {
                    ValidationResult::error("Rate limit exceeded, try again later")
                } else {
                    // Sanitize error messages to avoid leaking sensitive API details
                    ValidationResult::error(format!(
                        "Validation failed with status {}",
                        status.as_u16()
                    ))
                }
            }
            Err(e) => {
                if e.is_timeout() {
                    ValidationResult::error(
                        "Validation timed out. Check your network connection.",
                    )
                } else if e.is_connect() {
                    ValidationResult::error(format!(
                        "Could not connect to {} API. Check your network connection.",
                        provider_name
                    ))
                } else {
                    ValidationResult::error("Validation failed due to network error")
                }
            }
        }
    })
}

/// Validate a Google Gemini API key by calling the models list endpoint
pub async fn validate_gemini_key(key: &str) -> Result<ValidationResult> {
    if key.trim().is_empty() {
        return Ok(ValidationResult::error("API key cannot be empty"));
    }

    let url = "https://generativelanguage.googleapis.com/v1/models";
    let response = HTTP_CLIENT
        .get(url)
        .header("x-goog-api-key", key)
        .send()
        .await;

    Ok(handle_validation_response(response, "Google").await)
}

/// Validate an OpenAI API key by calling the models list endpoint
pub async fn validate_openai_key(key: &str) -> Result<ValidationResult> {
    if key.trim().is_empty() {
        return Ok(ValidationResult::error("API key cannot be empty"));
    }

    let url = "https://api.openai.com/v1/models";
    let response = HTTP_CLIENT
        .get(url)
        .header("Authorization", format!("Bearer {}", key))
        .send()
        .await;

    Ok(handle_validation_response(response, "OpenAI").await)
}

/// Validate an API key for a given provider
pub async fn validate_api_key(provider: Provider, key: &str) -> Result<ValidationResult> {
    match provider {
        Provider::Gemini => validate_gemini_key(key).await,
        Provider::OpenAI => validate_openai_key(key).await,
    }
}

/// Validate and store an API key
pub async fn validate_and_store_api_key(
    provider: Provider,
    key: &str,
) -> Result<ValidationResult> {
    // First validate
    let result = validate_api_key(provider, key).await?;

    // Only store if valid
    if result.valid {
        store_api_key(provider, key)?;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_identifier_format() {
        assert_eq!(GEMINI_KEY_ID, "porua.api.gemini");
        assert_eq!(OPENAI_KEY_ID, "porua.api.openai");
        assert!(GEMINI_KEY_ID.starts_with("porua.api."));
        assert!(OPENAI_KEY_ID.starts_with("porua.api."));
    }

    #[test]
    fn test_provider_key_id() {
        assert_eq!(Provider::Gemini.key_id(), GEMINI_KEY_ID);
        assert_eq!(Provider::OpenAI.key_id(), OPENAI_KEY_ID);
    }

    #[test]
    fn test_provider_from_str() {
        assert_eq!(Provider::from_str("gemini"), Some(Provider::Gemini));
        assert_eq!(Provider::from_str("GEMINI"), Some(Provider::Gemini));
        assert_eq!(Provider::from_str("Gemini"), Some(Provider::Gemini));
        assert_eq!(Provider::from_str("openai"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_str("OPENAI"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_str("OpenAI"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_str("invalid"), None);
        assert_eq!(Provider::from_str(""), None);
    }

    #[test]
    fn test_provider_as_str() {
        assert_eq!(Provider::Gemini.as_str(), "gemini");
        assert_eq!(Provider::OpenAI.as_str(), "openai");
    }

    #[test]
    fn test_validation_result_success() {
        let result = ValidationResult::success();
        assert!(result.valid);
        assert!(!result.message.is_empty());
    }

    #[test]
    fn test_validation_result_error() {
        let result = ValidationResult::error("Test error");
        assert!(!result.valid);
        assert_eq!(result.message, "Test error");
    }

    #[test]
    fn test_mask_key_short() {
        assert_eq!(mask_key("abc"), "••••••••");
        assert_eq!(mask_key("12345678"), "••••••••");
    }

    #[test]
    fn test_mask_key_long() {
        let masked = mask_key("sk-1234567890abcdef");
        assert_eq!(masked, "sk-1••••••••cdef");
        assert!(masked.contains("••••••••"));
        assert!(masked.starts_with("sk-1"));
        assert!(masked.ends_with("cdef"));
    }

    #[test]
    fn test_mask_key_exact_boundary() {
        // 9 characters - just over boundary
        let masked = mask_key("123456789");
        assert_eq!(masked, "1234••••••••6789");
    }

    #[test]
    fn test_mask_key_unicode() {
        // Test with multi-byte UTF-8 characters to ensure no panic
        // Each emoji is a multi-byte character
        let masked = mask_key("🔑🔐🔒🔓abcd1234");
        assert_eq!(masked, "🔑🔐🔒🔓••••••••1234");

        // Test with mixed content: "ABCDéfgh日本語end!" = 16 chars
        // First 4: "ABCD", Last 4: "end!"
        let masked2 = mask_key("ABCDéfgh日本語end!");
        assert_eq!(masked2, "ABCD••••••••end!");
    }

    // Integration tests for keyring operations
    // These tests interact with the actual system keychain
    // They are marked #[ignore] because they require user authorization on macOS
    // Run with: cargo test api_keys -- --ignored

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_store_and_get_api_key() {
        // Use a test key that won't conflict with real keys
        let test_key = "test-key-12345";

        // Store the key
        let store_result = store_api_key(Provider::Gemini, test_key);
        assert!(store_result.is_ok(), "Failed to store key: {:?}", store_result);

        // Retrieve the key
        let get_result = get_api_key(Provider::Gemini);
        assert!(get_result.is_ok(), "Failed to get key: {:?}", get_result);
        assert_eq!(get_result.unwrap(), Some(test_key.to_string()));

        // Clean up
        let _ = delete_api_key(Provider::Gemini);
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_get_nonexistent_key() {
        // First ensure the key doesn't exist
        let _ = delete_api_key(Provider::OpenAI);

        // Try to get a key that doesn't exist
        let result = get_api_key(Provider::OpenAI);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_delete_api_key() {
        // Store a key first
        let test_key = "test-key-to-delete";
        let _ = store_api_key(Provider::OpenAI, test_key);

        // Delete the key
        let delete_result = delete_api_key(Provider::OpenAI);
        assert!(delete_result.is_ok(), "Failed to delete key: {:?}", delete_result);

        // Verify it's gone
        let get_result = get_api_key(Provider::OpenAI);
        assert!(get_result.is_ok());
        assert_eq!(get_result.unwrap(), None);
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_delete_nonexistent_key() {
        // Ensure key doesn't exist
        let _ = delete_api_key(Provider::Gemini);

        // Deleting non-existent key should succeed (idempotent)
        let result = delete_api_key(Provider::Gemini);
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_has_api_key_true() {
        // Store a key
        let test_key = "test-key-has";
        let _ = store_api_key(Provider::Gemini, test_key);

        // Check it exists
        let result = has_api_key(Provider::Gemini);
        assert!(result.is_ok());
        assert!(result.unwrap());

        // Clean up
        let _ = delete_api_key(Provider::Gemini);
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_has_api_key_false() {
        // Ensure key doesn't exist
        let _ = delete_api_key(Provider::OpenAI);

        // Check it doesn't exist
        let result = has_api_key(Provider::OpenAI);
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_get_key_status_configured() {
        // Store a key
        let test_key = "sk-testapikey1234567890";
        let _ = store_api_key(Provider::Gemini, test_key);

        // Get status
        let result = get_key_status(Provider::Gemini);
        assert!(result.is_ok());

        let status = result.unwrap();
        assert_eq!(status.provider, "gemini");
        assert!(status.configured);
        assert!(status.masked_key.is_some());

        let masked = status.masked_key.unwrap();
        assert!(masked.contains("••••••••"));
        assert!(masked.starts_with("sk-t"));

        // Clean up
        let _ = delete_api_key(Provider::Gemini);
    }

    #[test]
    #[ignore = "Requires keychain access - run manually with --ignored"]
    fn test_get_key_status_not_configured() {
        // Ensure key doesn't exist
        let _ = delete_api_key(Provider::OpenAI);

        // Get status
        let result = get_key_status(Provider::OpenAI);
        assert!(result.is_ok());

        let status = result.unwrap();
        assert_eq!(status.provider, "openai");
        assert!(!status.configured);
        assert!(status.masked_key.is_none());
    }

    // Async validation tests
    #[tokio::test]
    async fn test_validate_gemini_empty_key() {
        let result = validate_gemini_key("").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        assert!(!validation.valid);
        assert!(validation.message.contains("empty"));
    }

    #[tokio::test]
    async fn test_validate_gemini_whitespace_key() {
        let result = validate_gemini_key("   ").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        assert!(!validation.valid);
        assert!(validation.message.contains("empty"));
    }

    #[tokio::test]
    async fn test_validate_openai_empty_key() {
        let result = validate_openai_key("").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        assert!(!validation.valid);
        assert!(validation.message.contains("empty"));
    }

    #[tokio::test]
    async fn test_validate_openai_whitespace_key() {
        let result = validate_openai_key("   ").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        assert!(!validation.valid);
        assert!(validation.message.contains("empty"));
    }

    #[tokio::test]
    async fn test_validate_api_key_dispatch() {
        // Test that validate_api_key dispatches correctly
        let gemini_result = validate_api_key(Provider::Gemini, "").await;
        assert!(gemini_result.is_ok());
        assert!(!gemini_result.unwrap().valid);

        let openai_result = validate_api_key(Provider::OpenAI, "").await;
        assert!(openai_result.is_ok());
        assert!(!openai_result.unwrap().valid);
    }

    // Note: Tests for actual API validation with invalid keys would make real network calls
    // These are integration tests that verify the validation logic works correctly
    // They will fail with auth errors which is the expected behavior for invalid keys
    #[tokio::test]
    async fn test_validate_gemini_invalid_key() {
        let result = validate_gemini_key("invalid-key-12345").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        // Invalid key should not be valid
        assert!(!validation.valid);
    }

    #[tokio::test]
    async fn test_validate_openai_invalid_key() {
        let result = validate_openai_key("sk-invalid-key-12345").await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        // Invalid key should not be valid
        assert!(!validation.valid);
    }
}
