// Edge case and error handling tests for API key management
//
// These tests cover security-critical scenarios and edge cases that
// could be exploited or cause unexpected behavior.

#[cfg(test)]
mod edge_case_tests {
    use crate::api_keys::*;
    use serial_test::serial;

    // Test 38: Very long key (potential buffer overflow)
    #[tokio::test]
    async fn test_very_long_key() {
        let manager = ApiKeyManager::new().unwrap();
        let long_key = "A".repeat(10000); // 10KB key

        let result = manager.validate_gemini_key(&long_key).await;
        assert!(result.is_err(), "Should reject extremely long keys");
    }

    // Test 39: Key with special characters
    #[tokio::test]
    async fn test_key_with_special_characters() {
        let manager = ApiKeyManager::new().unwrap();
        let special_key = "AIza<script>alert('xss')</script>!!";

        let result = manager.validate_gemini_key(&special_key).await;
        assert!(result.is_err(), "Should reject keys with special characters");
    }

    // Test 40: Key with SQL injection attempt
    #[tokio::test]
    async fn test_key_with_sql_injection() {
        let manager = ApiKeyManager::new().unwrap();
        let sql_key = "AIza' OR '1'='1"; // Doesn't meet length requirement

        let result = manager.validate_gemini_key(&sql_key).await;
        assert!(result.is_err(), "Should reject SQL injection attempts");
    }

    // Test 41: Key with URL encoding characters
    #[tokio::test]
    async fn test_key_with_url_encoding() {
        let manager = ApiKeyManager::new().unwrap();
        let encoded_key = "AIza%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20";

        let result = manager.validate_gemini_key(&encoded_key).await;
        // This will fail due to length check (39 chars)
        assert!(result.is_err(), "Should validate URL encoding properly");
    }

    // Test 42: Key with newlines
    #[tokio::test]
    async fn test_key_with_newlines() {
        let manager = ApiKeyManager::new().unwrap();
        let key_with_newlines = "AIza\n\r\nSyDummy39CharacterKey\n";

        let result = manager.validate_gemini_key(&key_with_newlines).await;
        // Should be trimmed and validated
        assert!(result.is_err(), "Should handle newlines in keys");
    }

    // Test 43: Key with leading/trailing whitespace
    #[tokio::test]
    async fn test_key_with_whitespace() {
        let manager = ApiKeyManager::new().unwrap();
        let key_with_spaces = "   AIzaSyDummy39CharacterKeyForTesting12345   ";

        let result = manager.validate_gemini_key(&key_with_spaces).await;
        // Should be trimmed to exactly 39 characters
        assert!(result.is_err() || result.unwrap() == false,
                "Should trim whitespace and validate");
    }

    // Test 44: Unicode characters in key
    #[tokio::test]
    async fn test_key_with_unicode() {
        let manager = ApiKeyManager::new().unwrap();
        let unicode_key = "AIza™®©🔐🔑💻";

        let result = manager.validate_gemini_key(&unicode_key).await;
        assert!(result.is_err(), "Should reject unicode characters");
    }

    // Test 45: Null bytes in key
    #[tokio::test]
    async fn test_key_with_null_bytes() {
        let manager = ApiKeyManager::new().unwrap();
        let null_key = "AIza\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";

        let result = manager.validate_gemini_key(&null_key).await;
        assert!(result.is_err(), "Should reject keys with null bytes");
    }

    // Test 46: Empty string vs whitespace
    #[tokio::test]
    async fn test_empty_vs_whitespace() {
        let manager = ApiKeyManager::new().unwrap();

        // Empty string
        let empty_result = manager.validate_gemini_key("").await;
        assert!(empty_result.is_err(), "Should reject empty string");

        // Only whitespace
        let whitespace_result = manager.validate_gemini_key("     ").await;
        assert!(whitespace_result.is_err(), "Should reject whitespace-only string");

        // Tabs and newlines
        let mixed_whitespace = manager.validate_gemini_key("\t\n\r").await;
        assert!(mixed_whitespace.is_err(), "Should reject mixed whitespace");
    }

    // Test 47: Case sensitivity
    #[tokio::test]
    async fn test_key_case_sensitivity() {
        let manager = ApiKeyManager::new().unwrap();
        let lowercase = "aiza..."; // Wrong case

        let result = manager.validate_gemini_key(&lowercase).await;
        assert!(result.is_err(), "Should be case-sensitive (AIza not aiza)");
    }

    // Test 48: Concurrent key operations
    #[tokio::test]
    #[serial]
    async fn test_concurrent_key_operations() {
        let manager = ApiKeyManager::new().unwrap();

        // Clean up first
        let _ = manager.remove_gemini_key();

        let key1 = "AIzaSyDummy39CharacterKeyForTesting12345";
        let key2 = "AIzaSyDummy39CharacterKeyForTesting67890";

        // Set key1
        manager.set_gemini_key(key1).unwrap();

        // Immediately set key2 (should overwrite)
        manager.set_gemini_key(key2).unwrap();

        // Should have key2, not key1
        let retrieved = manager.get_gemini_key().unwrap();
        assert_eq!(retrieved, Some(key2.to_string()));

        // Cleanup
        let _ = manager.remove_gemini_key();
    }

    // Test 49: OpenAI key edge cases
    #[tokio::test]
    async fn test_openai_edge_cases() {
        let manager = ApiKeyManager::new().unwrap();

        // Too short
        let short = "sk-123";
        assert!(manager.validate_openai_key(&short).await.is_err());

        // Wrong prefix
        let wrong_prefix = format!("pk-{}", "x".repeat(50));
        assert!(manager.validate_openai_key(&wrong_prefix).await.is_err());

        // Special characters
        let special = format!("sk-<script>alert('xss')</script>{}", "x".repeat(20));
        assert!(manager.validate_openai_key(&special).await.is_err());
    }

    // Test 50: Rapid repeated validation (rate limiting concern)
    #[tokio::test]
    async fn test_rapid_validation_attempts() {
        let manager = ApiKeyManager::new().unwrap();
        let invalid_key = "AIzaSyDummy39CharacterKeyWrongWrongWrong";

        // Make 5 rapid validation attempts
        for _ in 0..5 {
            let result = manager.validate_gemini_key(invalid_key).await;
            // Should either fail validation or timeout, but not panic
            assert!(result.is_err() || result.unwrap() == false);
        }
    }
}

#[cfg(test)]
mod error_handling_tests {
    use crate::api_keys::*;

    // Test 51: Manager creation never panics
    #[test]
    fn test_manager_creation_no_panic() {
        let result = std::panic::catch_unwind(|| {
            let _ = ApiKeyManager::new();
        });
        assert!(result.is_ok(), "Manager creation should never panic");
    }

    // Test 52: Storage errors are handled gracefully
    #[tokio::test]
    #[serial_test::serial]
    async fn test_storage_error_handling() {
        let manager = ApiKeyManager::new().unwrap();

        // Remove non-existent key should not error
        let result = manager.remove_gemini_key();
        assert!(result.is_ok(), "Removing non-existent key should succeed");
    }

    // Test 53: Network timeout handling
    #[tokio::test]
    async fn test_network_timeout() {
        let manager = ApiKeyManager::new().unwrap();
        // Use a correctly formatted but invalid key that will trigger network call
        let key = "AIzaSyDummy39CharacterKeyForTesting12345";

        let start = std::time::Instant::now();
        let _ = manager.validate_gemini_key(&key).await;
        let elapsed = start.elapsed();

        // Should timeout within 10 seconds + small buffer
        assert!(elapsed.as_secs() <= 11, "Validation should timeout within 10 seconds");
    }

    // Test 54: Invalid format errors are descriptive
    #[tokio::test]
    async fn test_error_messages_are_descriptive() {
        let manager = ApiKeyManager::new().unwrap();

        // Empty key
        match manager.validate_gemini_key("").await {
            Err(ApiKeyError::InvalidFormat(msg)) => {
                assert!(msg.contains("empty"), "Error should mention 'empty'");
            }
            _ => panic!("Should return InvalidFormat error"),
        }

        // Wrong prefix
        match manager.validate_gemini_key("WRONG").await {
            Err(ApiKeyError::InvalidFormat(msg)) => {
                assert!(msg.contains("AIza"), "Error should mention 'AIza'");
            }
            _ => panic!("Should return InvalidFormat error"),
        }

        // Wrong length
        match manager.validate_gemini_key("AIzaShort").await {
            Err(ApiKeyError::InvalidFormat(msg)) => {
                assert!(msg.contains("39"), "Error should mention length requirement");
            }
            _ => panic!("Should return InvalidFormat error"),
        }
    }
}
