use std::env;
use std::fs;
use std::path::PathBuf;

/// Get the log directory based on platform and installation type
///
/// Resolution order:
/// 1. Custom directory from parameter (if provided)
/// 2. PORUA_LOG_DIR environment variable
/// 3. Platform-specific defaults (system or user)
/// 4. Installation directory fallback
/// 5. Temp directory as last resort
pub fn get_log_directory(custom_dir: Option<&str>) -> Result<PathBuf, std::io::Error> {
    // 1. Check custom directory parameter
    if let Some(dir) = custom_dir {
        let path = PathBuf::from(dir);
        return ensure_directory_exists(path);
    }

    // 2. Check environment variable override (cross-platform)
    if let Ok(custom_dir) = env::var("PORUA_LOG_DIR") {
        let path = PathBuf::from(custom_dir);
        return ensure_directory_exists(path);
    }

    // 3. Platform-specific default locations
    let log_dir = if cfg!(target_os = "windows") {
        get_windows_log_dir()
    } else if cfg!(target_os = "macos") {
        get_macos_log_dir()
    } else {
        get_linux_log_dir()
    };

    ensure_directory_exists(log_dir)
}

/// Get Windows-specific log directory
#[cfg(target_os = "windows")]
fn get_windows_log_dir() -> PathBuf {
    // Try in order of preference:

    // 1. ProgramData (system-wide, recommended for services)
    if let Ok(program_data) = env::var("ProgramData") {
        let path = PathBuf::from(program_data).join("Porua").join("logs");
        if is_writable(&path) || can_create(&path) {
            return path;
        }
    }

    // 2. LOCALAPPDATA (user-specific, non-roaming)
    if let Some(local_app_data) = dirs::data_local_dir() {
        let path = local_app_data.join("Porua").join("logs");
        if is_writable(&path) || can_create(&path) {
            return path;
        }
    }

    // 3. APPDATA (user-specific, roaming)
    if let Some(app_data) = dirs::data_dir() {
        let path = app_data.join("Porua").join("logs");
        if is_writable(&path) || can_create(&path) {
            return path;
        }
    }

    // 4. Installation directory fallback
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Try parent of bin directory
            if let Some(install_dir) = exe_dir.parent() {
                let path = install_dir.join("logs");
                if is_writable(&path) || can_create(&path) {
                    return path;
                }
            }
            // Try next to binary
            let path = exe_dir.join("logs");
            if is_writable(&path) || can_create(&path) {
                return path;
            }
        }
    }

    // 5. Temp directory as last resort
    env::temp_dir().join("porua_logs")
}

/// Get Windows log directory (non-Windows builds)
#[cfg(not(target_os = "windows"))]
fn get_windows_log_dir() -> PathBuf {
    // This function won't be called on non-Windows platforms
    // but needs to exist for compilation
    PathBuf::from("/tmp/porua_logs")
}

/// Get Linux-specific log directory
#[cfg(target_os = "linux")]
fn get_linux_log_dir() -> PathBuf {
    // Try in order:

    // 1. System-wide location (requires permissions)
    let system_dir = PathBuf::from("/var/log/porua");
    if is_writable(&system_dir) || can_create(&system_dir) {
        return system_dir;
    }

    // 2. User XDG data directory
    if let Some(data_dir) = dirs::data_local_dir() {
        return data_dir.join("porua").join("logs");
    }

    // 3. Home directory fallback
    if let Some(home_dir) = dirs::home_dir() {
        return home_dir.join(".local").join("porua").join("logs");
    }

    // 4. Installation directory fallback
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent().and_then(|p| p.parent()) {
            return parent.join("logs");
        }
    }

    // 5. Temp directory
    env::temp_dir().join("porua_logs")
}

/// Get Linux log directory (non-Linux builds)
#[cfg(not(target_os = "linux"))]
fn get_linux_log_dir() -> PathBuf {
    PathBuf::from("/tmp/porua_logs")
}

/// Get macOS-specific log directory
#[cfg(target_os = "macos")]
fn get_macos_log_dir() -> PathBuf {
    // Try in order:

    // 1. System-wide location
    let system_dir = PathBuf::from("/var/log/porua");
    if is_writable(&system_dir) || can_create(&system_dir) {
        return system_dir;
    }

    // 2. User Library/Logs (macOS standard)
    if let Some(home_dir) = dirs::home_dir() {
        let logs_dir = home_dir.join("Library").join("Logs").join("Porua");
        if is_writable(&logs_dir) || can_create(&logs_dir) {
            return logs_dir;
        }
    }

    // 3. User data directory fallback
    if let Some(data_dir) = dirs::data_local_dir() {
        return data_dir.join("porua").join("logs");
    }

    // 4. Installation directory fallback
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent().and_then(|p| p.parent()) {
            return parent.join("logs");
        }
    }

    // 5. Temp directory
    env::temp_dir().join("porua_logs")
}

/// Get macOS log directory (non-macOS builds)
#[cfg(not(target_os = "macos"))]
fn get_macos_log_dir() -> PathBuf {
    PathBuf::from("/tmp/porua_logs")
}

/// Check if a directory is writable
fn is_writable(path: &PathBuf) -> bool {
    if !path.exists() {
        return false;
    }
    // Try creating a temp file to check write permissions
    let test_file = path.join(".write_test");
    fs::write(&test_file, "test").is_ok()
        && {
            let _ = fs::remove_file(&test_file);
            true
        }
}

/// Check if we can create a directory
fn can_create(path: &PathBuf) -> bool {
    if path.exists() {
        return is_writable(path);
    }
    // Check if parent is writable
    if let Some(parent) = path.parent() {
        parent.exists() && is_writable(&parent.to_path_buf())
    } else {
        false
    }
}

/// Ensure the log directory exists and create subdirectories
fn ensure_directory_exists(path: PathBuf) -> Result<PathBuf, std::io::Error> {
    if !path.exists() {
        fs::create_dir_all(&path)?;
    }

    // Create archives subdirectory
    let archives_dir = path.join("archives");
    if !archives_dir.exists() {
        fs::create_dir_all(&archives_dir)?;
    }

    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_ensure_directory_exists() {
        let temp_dir = TempDir::new().unwrap();
        let log_dir = temp_dir.path().join("logs");

        let result = ensure_directory_exists(log_dir.clone());
        assert!(result.is_ok());
        assert!(log_dir.exists());
        assert!(log_dir.join("archives").exists());
    }

    #[test]
    fn test_is_writable() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().to_path_buf();
        assert!(is_writable(&path));
    }

    #[test]
    fn test_custom_directory_override() {
        let temp_dir = TempDir::new().unwrap();
        let custom_path = temp_dir.path().join("custom_logs");

        let result = get_log_directory(Some(custom_path.to_str().unwrap()));
        assert!(result.is_ok());
        assert!(custom_path.exists());
    }

    #[test]
    fn test_env_var_override() {
        let temp_dir = TempDir::new().unwrap();
        let custom_path = temp_dir.path().join("env_logs");

        env::set_var("PORUA_LOG_DIR", custom_path.to_str().unwrap());

        let result = get_log_directory(None);
        assert!(result.is_ok());
        assert!(custom_path.exists());

        env::remove_var("PORUA_LOG_DIR");
    }
}
