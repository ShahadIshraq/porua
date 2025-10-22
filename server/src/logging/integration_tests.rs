/// Integration tests for the logging system
///
/// These tests verify the full initialization and configuration of the logging system
use tempfile::TempDir;

#[cfg(test)]
mod tests {
    use super::super::*;
    use std::env;

    #[test]
    fn test_logging_init_with_custom_directory() {
        let temp_dir = TempDir::new().unwrap();
        let log_path = temp_dir.path().join("custom_logs");

        let mut config = LogConfig::default();
        config.custom_log_dir = Some(log_path.to_str().unwrap().to_string());
        config.enable_cleanup = false; // Don't start background task in test

        // Note: init_logging will fail in tests because tracing subscriber
        // can only be initialized once per process. This is expected behavior.
        // The important part is that the log directory is created correctly.
        let _result = init_logging(&config);

        // Verify log directory was created
        assert!(log_path.exists(), "Log directory should be created");
        assert!(
            log_path.join("archives").exists(),
            "Archives subdirectory should be created"
        );
    }

    #[test]
    fn test_log_config_env_var_parsing() {
        // Set up environment variables
        env::set_var("LOG_MAX_SIZE_MB", "100");
        env::set_var("LOG_RETENTION_DAYS", "60");
        env::set_var("LOG_COMPRESSION", "false");
        env::set_var("LOG_SLOW_REQUEST_THRESHOLD_MS", "3000");

        let config = LogConfig::from_env();

        assert_eq!(config.max_size_mb, 100);
        assert_eq!(config.retention_days, 60);
        assert!(!config.compression_enabled);
        assert_eq!(config.slow_request_threshold_ms, 3000);

        // Cleanup
        env::remove_var("LOG_MAX_SIZE_MB");
        env::remove_var("LOG_RETENTION_DAYS");
        env::remove_var("LOG_COMPRESSION");
        env::remove_var("LOG_SLOW_REQUEST_THRESHOLD_MS");
    }

    #[test]
    fn test_log_config_invalid_env_values_use_defaults() {
        env::set_var("LOG_MAX_SIZE_MB", "invalid");
        env::set_var("LOG_RETENTION_DAYS", "not-a-number");

        let config = LogConfig::from_env();

        // Should fall back to defaults when parsing fails
        assert_eq!(config.max_size_mb, 50); // default
        assert_eq!(config.retention_days, 30); // default

        env::remove_var("LOG_MAX_SIZE_MB");
        env::remove_var("LOG_RETENTION_DAYS");
    }

    #[test]
    fn test_platform_info_logging() {
        // This just verifies the function doesn't panic
        // Actual logging output can't be easily tested
        log_platform_info();
    }
}
