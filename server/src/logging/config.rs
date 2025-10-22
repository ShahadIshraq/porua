use std::env;

/// Configuration for the logging system
#[derive(Debug, Clone)]
pub struct LogConfig {
    /// Custom log directory path (overrides auto-detection)
    pub custom_log_dir: Option<String>,

    /// Log level for console output (default: "info")
    pub console_log_level: String,

    /// Log level for file output (default: "debug")
    pub file_log_level: String,

    /// Enable access logging (default: true)
    pub access_enabled: bool,

    /// Enable application logging (default: true)
    pub application_enabled: bool,

    /// Log format: "json", "pretty", or "compact" (default: "json")
    pub format: LogFormat,

    /// Maximum log file size in MB before rotation (default: 50)
    pub max_size_mb: u64,

    /// Log retention in days (default: 30)
    pub retention_days: u32,

    /// Maximum total log directory size in MB (default: 1000)
    pub max_total_size_mb: u64,

    /// Enable log compression (default: true)
    pub compression_enabled: bool,

    /// Enable background cleanup task (default: true)
    pub enable_cleanup: bool,

    /// Log slow requests over threshold (default: true)
    pub log_slow_requests: bool,

    /// Slow request threshold in milliseconds (default: 5000)
    pub slow_request_threshold_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Json,
    Pretty,
    Compact,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            custom_log_dir: None,
            console_log_level: "info".to_string(),
            file_log_level: "debug".to_string(),
            access_enabled: true,
            application_enabled: true,
            format: LogFormat::Json,
            max_size_mb: 50,
            retention_days: 30,
            max_total_size_mb: 1000,
            compression_enabled: true,
            enable_cleanup: true,
            log_slow_requests: true,
            slow_request_threshold_ms: 5000,
        }
    }
}

impl LogConfig {
    /// Load logging configuration from environment variables
    pub fn from_env() -> Self {
        let mut config = Self::default();

        // Custom log directory
        if let Ok(dir) = env::var("PORUA_LOG_DIR") {
            config.custom_log_dir = Some(dir);
        }

        // Console log level (also check RUST_LOG for backward compatibility)
        config.console_log_level = env::var("RUST_LOG")
            .unwrap_or_else(|_| "porua_server=info,ort=warn,kokoros=warn".to_string());

        // File log level
        if let Ok(level) = env::var("PORUA_FILE_LOG_LEVEL") {
            config.file_log_level = level;
        }

        // Access logging
        if let Ok(val) = env::var("LOG_ACCESS_ENABLED") {
            config.access_enabled = val.to_lowercase() == "true";
        }

        // Application logging
        if let Ok(val) = env::var("LOG_APPLICATION_ENABLED") {
            config.application_enabled = val.to_lowercase() == "true";
        }

        // Log format
        if let Ok(format_str) = env::var("LOG_FORMAT") {
            config.format = match format_str.to_lowercase().as_str() {
                "pretty" => LogFormat::Pretty,
                "compact" => LogFormat::Compact,
                _ => LogFormat::Json,
            };
        }

        // Max file size
        if let Ok(val) = env::var("LOG_MAX_SIZE_MB") {
            if let Ok(size) = val.parse() {
                config.max_size_mb = size;
            }
        }

        // Retention days
        if let Ok(val) = env::var("LOG_RETENTION_DAYS") {
            if let Ok(days) = val.parse() {
                config.retention_days = days;
            }
        }

        // Max total size
        if let Ok(val) = env::var("LOG_MAX_TOTAL_SIZE_MB") {
            if let Ok(size) = val.parse() {
                config.max_total_size_mb = size;
            }
        }

        // Compression
        if let Ok(val) = env::var("LOG_COMPRESSION") {
            config.compression_enabled = val.to_lowercase() == "true";
        }

        // Cleanup task
        if let Ok(val) = env::var("LOG_ENABLE_CLEANUP") {
            config.enable_cleanup = val.to_lowercase() == "true";
        }

        // Slow requests
        if let Ok(val) = env::var("LOG_SLOW_REQUESTS") {
            config.log_slow_requests = val.to_lowercase() == "true";
        }

        // Slow request threshold
        if let Ok(val) = env::var("LOG_SLOW_REQUEST_THRESHOLD_MS") {
            if let Ok(threshold) = val.parse() {
                config.slow_request_threshold_ms = threshold;
            }
        }

        config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = LogConfig::default();
        assert_eq!(config.console_log_level, "info");
        assert_eq!(config.file_log_level, "debug");
        assert!(config.access_enabled);
        assert!(config.application_enabled);
        assert_eq!(config.max_size_mb, 50);
        assert_eq!(config.retention_days, 30);
        assert_eq!(config.max_total_size_mb, 1000);
        assert!(config.compression_enabled);
        assert!(config.enable_cleanup);
    }

    #[test]
    fn test_from_env_defaults() {
        // Clear relevant env vars
        env::remove_var("PORUA_LOG_DIR");
        env::remove_var("RUST_LOG");
        env::remove_var("LOG_MAX_SIZE_MB");

        let config = LogConfig::from_env();
        assert_eq!(config.max_size_mb, 50);
        assert_eq!(config.retention_days, 30);
    }

    #[test]
    fn test_from_env_custom_values() {
        env::set_var("LOG_MAX_SIZE_MB", "100");
        env::set_var("LOG_RETENTION_DAYS", "60");
        env::set_var("LOG_COMPRESSION", "false");

        let config = LogConfig::from_env();
        assert_eq!(config.max_size_mb, 100);
        assert_eq!(config.retention_days, 60);
        assert!(!config.compression_enabled);

        // Cleanup
        env::remove_var("LOG_MAX_SIZE_MB");
        env::remove_var("LOG_RETENTION_DAYS");
        env::remove_var("LOG_COMPRESSION");
    }
}
