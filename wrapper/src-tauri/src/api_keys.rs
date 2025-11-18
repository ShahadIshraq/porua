use anyhow::Result;
use thiserror::Error;

// Use different service name for tests to avoid polluting actual keychain
#[cfg(not(test))]
const SERVICE_NAME: &str = "com.porua.app";
#[cfg(test)]
const SERVICE_NAME: &str = "com.porua.app.test";

const GEMINI_KEY_ID: &str = "porua.api.gemini";
const OPENAI_KEY_ID: &str = "porua.api.openai";

#[derive(Debug, Error)]
pub enum ApiKeyError {
    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Key not found")]
    KeyNotFound,

    #[error("Invalid key format: {0}")]
    InvalidFormat(String),

    #[error("Validation failed: {0}")]
    ValidationFailed(String),

    #[error("Network error: {0}")]
    NetworkError(String),
}

// Trait for key storage operations (enables testing with mock)
trait KeyStorage {
    fn set(&self, key: &str) -> Result<(), ApiKeyError>;
    fn get(&self) -> Result<Option<String>, ApiKeyError>;
    fn remove(&self) -> Result<(), ApiKeyError>;
}

// Production implementation using real keyring
#[cfg(not(test))]
struct KeyringStorage {
    service: String,
    name: String,
}

#[cfg(not(test))]
impl KeyStorage for KeyringStorage {
    fn set(&self, key: &str) -> Result<(), ApiKeyError> {
        use keyring::Entry;

        let entry = Entry::new(&self.service, &self.name)
            .map_err(|e| ApiKeyError::StorageError(e.to_string()))?;

        // Delete existing key first to avoid "already exists" error on some platforms
        let _ = entry.delete_credential();

        entry.set_password(key)
            .map_err(|e| ApiKeyError::StorageError(e.to_string()))?;

        Ok(())
    }

    fn get(&self) -> Result<Option<String>, ApiKeyError> {
        use keyring::Entry;

        let entry = Entry::new(&self.service, &self.name)
            .map_err(|e| ApiKeyError::StorageError(e.to_string()))?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(ApiKeyError::StorageError(e.to_string())),
        }
    }

    fn remove(&self) -> Result<(), ApiKeyError> {
        use keyring::Entry;

        let entry = Entry::new(&self.service, &self.name)
            .map_err(|e| ApiKeyError::StorageError(e.to_string()))?;

        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // Already removed, not an error
            Err(e) => Err(ApiKeyError::StorageError(e.to_string())),
        }
    }
}

// Mock implementation for tests using in-memory storage
#[cfg(test)]
use std::sync::Mutex;
#[cfg(test)]
use std::collections::HashMap;

#[cfg(test)]
lazy_static::lazy_static! {
    static ref MOCK_STORAGE: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

#[cfg(test)]
struct MockKeyStorage {
    key: String,
}

#[cfg(test)]
impl KeyStorage for MockKeyStorage {
    fn set(&self, value: &str) -> Result<(), ApiKeyError> {
        let mut storage = MOCK_STORAGE.lock().unwrap();
        storage.insert(self.key.clone(), value.to_string());
        Ok(())
    }

    fn get(&self) -> Result<Option<String>, ApiKeyError> {
        let storage = MOCK_STORAGE.lock().unwrap();
        Ok(storage.get(&self.key).cloned())
    }

    fn remove(&self) -> Result<(), ApiKeyError> {
        let mut storage = MOCK_STORAGE.lock().unwrap();
        storage.remove(&self.key);
        Ok(())
    }
}

pub struct ApiKeyManager;

impl ApiKeyManager {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    #[cfg(not(test))]
    fn create_storage(name: &str) -> Box<dyn KeyStorage> {
        Box::new(KeyringStorage {
            service: SERVICE_NAME.to_string(),
            name: name.to_string(),
        })
    }

    #[cfg(test)]
    fn create_storage(name: &str) -> Box<dyn KeyStorage> {
        Box::new(MockKeyStorage {
            key: format!("{}::{}", SERVICE_NAME, name),
        })
    }

    // Gemini key operations
    pub fn set_gemini_key(&self, key: &str) -> Result<(), ApiKeyError> {
        let storage = Self::create_storage(GEMINI_KEY_ID);
        storage.set(key)
    }

    pub fn get_gemini_key(&self) -> Result<Option<String>, ApiKeyError> {
        let storage = Self::create_storage(GEMINI_KEY_ID);
        storage.get()
    }

    pub fn remove_gemini_key(&self) -> Result<(), ApiKeyError> {
        let storage = Self::create_storage(GEMINI_KEY_ID);
        storage.remove()
    }

    // OpenAI key operations
    pub fn set_openai_key(&self, key: &str) -> Result<(), ApiKeyError> {
        let storage = Self::create_storage(OPENAI_KEY_ID);
        storage.set(key)
    }

    pub fn get_openai_key(&self) -> Result<Option<String>, ApiKeyError> {
        let storage = Self::create_storage(OPENAI_KEY_ID);
        storage.get()
    }

    pub fn remove_openai_key(&self) -> Result<(), ApiKeyError> {
        let storage = Self::create_storage(OPENAI_KEY_ID);
        storage.remove()
    }

    // Validation methods
    pub async fn validate_gemini_key(&self, key: &str) -> Result<bool, ApiKeyError> {
        // Basic format validation
        if key.is_empty() || key.trim().is_empty() {
            return Err(ApiKeyError::InvalidFormat("Key cannot be empty".to_string()));
        }

        let trimmed_key = key.trim();

        // Gemini API keys typically start with "AIza" and are 39 characters
        if !trimmed_key.starts_with("AIza") {
            return Err(ApiKeyError::InvalidFormat(
                "Invalid Gemini key format (should start with 'AIza')".to_string(),
            ));
        }

        if trimmed_key.len() != 39 {
            return Err(ApiKeyError::InvalidFormat(
                "Invalid Gemini key length (should be 39 characters)".to_string(),
            ));
        }

        // Make API call to validate the key
        let url = format!(
            "https://generativelanguage.googleapis.com/v1/models?key={}",
            trimmed_key
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| ApiKeyError::NetworkError(e.to_string()))?;

        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    Ok(true)
                } else if response.status().as_u16() == 400 || response.status().as_u16() == 403 {
                    Err(ApiKeyError::ValidationFailed("Invalid API key".to_string()))
                } else {
                    Err(ApiKeyError::ValidationFailed(format!(
                        "API returned status: {}",
                        response.status()
                    )))
                }
            }
            Err(e) => Err(ApiKeyError::NetworkError(e.to_string())),
        }
    }

    pub async fn validate_openai_key(&self, key: &str) -> Result<bool, ApiKeyError> {
        // Basic format validation
        if key.is_empty() || key.trim().is_empty() {
            return Err(ApiKeyError::InvalidFormat("Key cannot be empty".to_string()));
        }

        let trimmed_key = key.trim();

        // OpenAI API keys typically start with "sk-"
        if !trimmed_key.starts_with("sk-") {
            return Err(ApiKeyError::InvalidFormat(
                "Invalid OpenAI key format (should start with 'sk-')".to_string(),
            ));
        }

        // OpenAI keys are typically longer than 40 characters
        if trimmed_key.len() < 40 {
            return Err(ApiKeyError::InvalidFormat(
                "Invalid OpenAI key length (too short)".to_string(),
            ));
        }

        // Make API call to validate the key
        let url = "https://api.openai.com/v1/models";

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| ApiKeyError::NetworkError(e.to_string()))?;

        match client
            .get(url)
            .header("Authorization", format!("Bearer {}", trimmed_key))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    Ok(true)
                } else if response.status().as_u16() == 401 {
                    Err(ApiKeyError::ValidationFailed("Invalid API key".to_string()))
                } else {
                    Err(ApiKeyError::ValidationFailed(format!(
                        "API returned status: {}",
                        response.status()
                    )))
                }
            }
            Err(e) => Err(ApiKeyError::NetworkError(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    // Helper function to clean up test keys
    fn cleanup_test_keys() {
        let mut storage = MOCK_STORAGE.lock().unwrap();
        storage.clear();
    }

    // Test 1: New manager creation
    #[test]
    #[serial]
    fn test_create_api_key_manager() {
        let manager = ApiKeyManager::new();
        assert!(manager.is_ok());
    }

    // Test 2: Store and retrieve Gemini key
    #[test]
    #[serial]
    fn test_set_and_get_gemini_key() {
        // Use test name as identifier for isolation
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        let test_key = "AIzaSyDummy39CharacterKeyForTesting12345";

        // Remove any existing key first
        let _ = manager.remove_gemini_key();

        manager.set_gemini_key(test_key).unwrap();
        let retrieved = manager.get_gemini_key().unwrap();

        assert_eq!(retrieved, Some(test_key.to_string()));

        // Cleanup
        manager.remove_gemini_key().unwrap();
    }

    // Test 3: Store and retrieve OpenAI key
    #[test]
    #[serial]
    fn test_set_and_get_openai_key() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        let test_key = "sk-proj-dummy48charactersopenaikeyfortesting123456";

        manager.set_openai_key(test_key).unwrap();
        let retrieved = manager.get_openai_key().unwrap();

        assert_eq!(retrieved, Some(test_key.to_string()));

        // Cleanup
        manager.remove_openai_key().unwrap();
    }

    // Test 4: Remove Gemini key
    #[test]
    #[serial]
    fn test_remove_gemini_key() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        let test_key = "AIzaSyDummy39CharacterKeyForTesting12345";

        manager.set_gemini_key(test_key).unwrap();
        manager.remove_gemini_key().unwrap();
        let retrieved = manager.get_gemini_key().unwrap();

        assert_eq!(retrieved, None);
    }

    // Test 5: Remove OpenAI key
    #[test]
    #[serial]
    fn test_remove_openai_key() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        let test_key = "sk-proj-dummy48charactersopenaikeyfortesting123456";

        manager.set_openai_key(test_key).unwrap();
        manager.remove_openai_key().unwrap();
        let retrieved = manager.get_openai_key().unwrap();

        assert_eq!(retrieved, None);
    }

    // Test 6: Get non-existent key returns None
    #[test]
    #[serial]
    fn test_get_nonexistent_key() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        // Ensure it's removed
        let _ = manager.remove_gemini_key();
        let _ = manager.remove_openai_key();

        let retrieved = manager.get_gemini_key().unwrap();
        assert_eq!(retrieved, None);
    }

    // Test 7: Update existing key
    #[test]
    #[serial]
    fn test_update_existing_key() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        let key1 = "AIzaSyDummy39CharacterKeyForTesting12345";
        let key2 = "AIzaSyDummy39CharacterKeyForTesting67890";

        manager.set_gemini_key(key1).unwrap();
        manager.set_gemini_key(key2).unwrap();
        let retrieved = manager.get_gemini_key().unwrap();

        assert_eq!(retrieved, Some(key2.to_string()));

        // Cleanup
        manager.remove_gemini_key().unwrap();
    }

    // Test 8: Keys are isolated (Gemini != OpenAI)
    #[test]
    #[serial]
    fn test_keys_are_isolated() {
        cleanup_test_keys();

        let manager = ApiKeyManager::new().unwrap();
        // Start fresh
        let _ = manager.remove_gemini_key();
        let _ = manager.remove_openai_key();

        let gemini_key = "AIzaSyDummy39CharacterKeyForTesting12345";
        let openai_key = "sk-proj-dummy48charactersopenaikeyfortesting123456";

        manager.set_gemini_key(gemini_key).unwrap();
        manager.set_openai_key(openai_key).unwrap();

        assert_eq!(manager.get_gemini_key().unwrap(), Some(gemini_key.to_string()));
        assert_eq!(manager.get_openai_key().unwrap(), Some(openai_key.to_string()));

        manager.remove_gemini_key().unwrap();

        assert_eq!(manager.get_gemini_key().unwrap(), None);
        assert_eq!(manager.get_openai_key().unwrap(), Some(openai_key.to_string()));

        // Cleanup
        manager.remove_openai_key().unwrap();
    }
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    // Test 9: Validate invalid Gemini key format (wrong prefix)
    #[tokio::test]
    async fn test_validate_invalid_gemini_key_format() {
        let manager = ApiKeyManager::new().unwrap();
        let invalid_key = "not-a-valid-key";

        let result = manager.validate_gemini_key(invalid_key).await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }

    // Test 10: Validate invalid Gemini key format (wrong length)
    #[tokio::test]
    async fn test_validate_gemini_key_wrong_length() {
        let manager = ApiKeyManager::new().unwrap();
        let short_key = "AIzaShortKey";

        let result = manager.validate_gemini_key(short_key).await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }

    // Test 11: Validate wrong Gemini key (correct format, but invalid)
    #[tokio::test]
    async fn test_validate_wrong_gemini_key() {
        let manager = ApiKeyManager::new().unwrap();
        // Correctly formatted but invalid key
        let wrong_key = "AIzaSyDummy39CharacterKeyWrongWrongWrong";

        let result = manager.validate_gemini_key(wrong_key).await;
        // Should return false or error, not panic
        assert!(result.is_err() || result.unwrap() == false);
    }

    // Test 12: Validate invalid OpenAI key format (wrong prefix)
    #[tokio::test]
    async fn test_validate_invalid_openai_key_format() {
        let manager = ApiKeyManager::new().unwrap();
        let invalid_key = "not-valid";

        let result = manager.validate_openai_key(invalid_key).await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }

    // Test 13: Validate OpenAI key wrong length
    #[tokio::test]
    async fn test_validate_openai_key_wrong_length() {
        let manager = ApiKeyManager::new().unwrap();
        let short_key = "sk-short";

        let result = manager.validate_openai_key(short_key).await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }

    // Test 14: Validation timeout (< 10 seconds)
    #[tokio::test]
    async fn test_validation_timeout() {
        let manager = ApiKeyManager::new().unwrap();
        // Use a correctly formatted but likely invalid key
        let test_key = "AIzaSyDummy39CharacterKeyForTiming12345";

        let start = std::time::Instant::now();
        let _ = manager.validate_gemini_key(test_key).await;
        let duration = start.elapsed();

        assert!(duration.as_secs() <= 10, "Validation took too long: {:?}", duration);
    }

    // Test 15: Empty key validation
    #[tokio::test]
    async fn test_validate_empty_key() {
        let manager = ApiKeyManager::new().unwrap();

        let result = manager.validate_gemini_key("").await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }

    // Test 16: Whitespace-only key validation
    #[tokio::test]
    async fn test_validate_whitespace_key() {
        let manager = ApiKeyManager::new().unwrap();

        let result = manager.validate_gemini_key("   ").await;
        assert!(result.is_err());
        match result {
            Err(ApiKeyError::InvalidFormat(_)) => {}, // Expected
            _ => panic!("Expected InvalidFormat error"),
        }
    }
}
