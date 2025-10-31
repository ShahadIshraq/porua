use anyhow::{Context, Result};
use std::path::PathBuf;

/// Get the application data directory based on platform
pub fn get_app_data_dir() -> Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        // Try dirs::home_dir() first, then fall back to HOME environment variable
        let home = dirs::home_dir()
            .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
            .context("Failed to get home directory - neither dirs::home_dir() nor HOME env var worked")?;
        Ok(home.join("Library/Application Support/Porua"))
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA").context("APPDATA environment variable not set")?;
        Ok(PathBuf::from(app_data).join("Porua"))
    }

    #[cfg(target_os = "linux")]
    {
        // Try dirs::home_dir() first, then fall back to HOME environment variable
        let home = dirs::home_dir()
            .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
            .context("Failed to get home directory - neither dirs::home_dir() nor HOME env var worked")?;
        Ok(home.join(".config/porua"))
    }
}

/// Get the path to the server binary
pub fn get_server_binary_path() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("bin/porua_server"))
}

/// Get the path to the models directory
pub fn get_models_dir() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("models"))
}

/// Get the path to the samples directory
pub fn get_samples_dir() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("samples"))
}

/// Get the path to the espeak-ng data directory
pub fn get_espeak_data_dir() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("espeak-ng-data"))
}

/// Get the path to the logs directory
pub fn get_logs_dir() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("logs"))
}

/// Get the path to the config file
pub fn get_config_file() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("config.json"))
}

/// Get the path to the installation flag file
pub fn get_install_flag_file() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join("installed.flag"))
}

/// Get the path to the .env file
pub fn get_env_file() -> Result<PathBuf> {
    Ok(get_app_data_dir()?.join(".env"))
}

/// Create all necessary directories
pub fn ensure_directories_exist() -> Result<()> {
    let app_dir = get_app_data_dir()?;

    std::fs::create_dir_all(&app_dir)
        .context("Failed to create app data directory")?;

    std::fs::create_dir_all(app_dir.join("bin"))
        .context("Failed to create bin directory")?;

    std::fs::create_dir_all(app_dir.join("models"))
        .context("Failed to create models directory")?;

    std::fs::create_dir_all(app_dir.join("samples"))
        .context("Failed to create samples directory")?;

    std::fs::create_dir_all(app_dir.join("espeak-ng-data"))
        .context("Failed to create espeak-ng-data directory")?;

    std::fs::create_dir_all(app_dir.join("logs"))
        .context("Failed to create logs directory")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_data_dir() {
        let dir = get_app_data_dir().unwrap();
        assert!(dir.to_string_lossy().contains("Porua") || dir.to_string_lossy().contains("porua"));
    }
}
