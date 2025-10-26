use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: String,
    pub paths: PathsConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathsConfig {
    pub server_binary: PathBuf,
    pub model_dir: PathBuf,
    pub samples_dir: PathBuf,
    pub espeak_data_dir: PathBuf,
    pub log_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub pool_size: usize,
    pub log_level: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            pool_size: 2,
            log_level: "info".to_string(),
        }
    }
}

impl Config {
    /// Create a new config with default values and platform-specific paths
    pub fn new() -> Result<Self> {
        Ok(Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            paths: PathsConfig {
                server_binary: paths::get_server_binary_path()?,
                model_dir: paths::get_models_dir()?,
                samples_dir: paths::get_samples_dir()?,
                espeak_data_dir: paths::get_espeak_data_dir()?,
                log_dir: paths::get_logs_dir()?,
            },
            server: ServerConfig::default(),
        })
    }

    /// Load config from file, or create default if not exists
    pub fn load() -> Result<Self> {
        let config_file = paths::get_config_file()?;

        if config_file.exists() {
            let contents = std::fs::read_to_string(&config_file)
                .context("Failed to read config file")?;

            let config: Config = serde_json::from_str(&contents)
                .context("Failed to parse config file")?;

            Ok(config)
        } else {
            // Create default config
            let config = Self::new()?;
            config.save()?;
            Ok(config)
        }
    }

    /// Save config to file
    pub fn save(&self) -> Result<()> {
        let config_file = paths::get_config_file()?;

        let contents = serde_json::to_string_pretty(&self)
            .context("Failed to serialize config")?;

        std::fs::write(&config_file, contents)
            .context("Failed to write config file")?;

        Ok(())
    }

    /// Update server port (for future Phase 2)
    #[allow(dead_code)]
    pub fn set_port(&mut self, port: u16) -> Result<()> {
        self.server.port = port;
        self.save()
    }

    /// Update pool size (for future Phase 2)
    #[allow(dead_code)]
    pub fn set_pool_size(&mut self, pool_size: usize) -> Result<()> {
        self.server.pool_size = pool_size;
        self.save()
    }

    /// Update log level (for future Phase 2)
    #[allow(dead_code)]
    pub fn set_log_level(&mut self, log_level: String) -> Result<()> {
        self.server.log_level = log_level;
        self.save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::new().unwrap();
        assert_eq!(config.server.port, 3000);
        assert_eq!(config.server.pool_size, 2);
        assert_eq!(config.server.log_level, "info");
    }
}
