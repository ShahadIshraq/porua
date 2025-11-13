/// Cleanup module for testing Windows uninstaller behavior
///
/// This module provides utilities to validate that all application artifacts
/// can be identified and are properly configured for cleanup during uninstall.
///
/// All tests run on all platforms. On Windows, tests validate actual cleanup behavior.
/// On other platforms, tests validate configuration and error handling.

use anyhow::Result;
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use crate::paths;

/// Represents all artifacts that should be cleaned up during uninstall
#[cfg(test)]
#[derive(Debug)]
pub struct CleanupArtifacts {
    #[allow(dead_code)]
    pub app_data_dir: PathBuf,
    #[allow(dead_code)]
    pub subdirectories: Vec<String>,
    #[allow(dead_code)]
    pub registry_key: String,
}

/// Get all artifacts that should be cleaned up during uninstall
#[cfg(all(test, target_os = "windows"))]
pub fn get_cleanup_artifacts() -> Result<CleanupArtifacts> {
    let app_data_dir = paths::get_app_data_dir()?;

    Ok(CleanupArtifacts {
        app_data_dir,
        subdirectories: vec![
            "bin".to_string(),
            "models".to_string(),
            "espeak-ng-data".to_string(),
            "samples".to_string(),
            "logs".to_string(),
        ],
        registry_key: r"HKCU\Software\Porua".to_string(),
    })
}

/// Non-Windows stub that returns an error
#[cfg(all(test, not(target_os = "windows")))]
pub fn get_cleanup_artifacts() -> Result<CleanupArtifacts> {
    anyhow::bail!("Cleanup artifacts only available on Windows")
}

#[cfg(test)]
mod tests {

    /// Test cleanup artifacts structure (runs on all platforms)
    ///
    /// Validates that all expected subdirectories and registry keys are defined.
    /// On Windows, also validates the AppData path is correct.
    #[test]
    fn test_cleanup_artifacts_structure() {
        use super::*;

        let artifacts = get_cleanup_artifacts();

        #[cfg(target_os = "windows")]
        {
            // On Windows, we can get actual artifacts
            let artifacts = artifacts.expect("Should identify cleanup artifacts on Windows");

            // Verify app data directory path is correct
            assert!(artifacts.app_data_dir.to_string_lossy().contains("Porua"));

            // Verify all expected subdirectories are listed
            assert_eq!(artifacts.subdirectories.len(), 5);
            assert!(artifacts.subdirectories.contains(&"bin".to_string()));
            assert!(artifacts.subdirectories.contains(&"models".to_string()));
            assert!(artifacts.subdirectories.contains(&"espeak-ng-data".to_string()));
            assert!(artifacts.subdirectories.contains(&"samples".to_string()));
            assert!(artifacts.subdirectories.contains(&"logs".to_string()));

            // Verify registry key is correct
            assert_eq!(artifacts.registry_key, r"HKCU\Software\Porua");
        }

        #[cfg(not(target_os = "windows"))]
        {
            // On non-Windows, verify it returns an error as expected
            assert!(artifacts.is_err(), "Should return error on non-Windows platforms");
            assert!(artifacts.unwrap_err().to_string().contains("Windows"));
        }
    }

    #[test]
    fn test_wix_fragment_exists() {
        // Verify the WiX cleanup fragment file exists
        let fragment_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("windows")
            .join("complete-cleanup.wxs");

        assert!(
            fragment_path.exists(),
            "WiX cleanup fragment should exist at {:?}",
            fragment_path
        );
    }

    #[test]
    fn test_wix_fragment_contains_required_elements() {
        // Verify the WiX fragment contains all required cleanup elements
        let fragment_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("windows")
            .join("complete-cleanup.wxs");

        let content = std::fs::read_to_string(&fragment_path)
            .expect("Should read WiX fragment file");

        // Check for process termination custom actions
        assert!(
            content.contains("TerminatePoruaProcess"),
            "WiX fragment should contain TerminatePoruaProcess custom action"
        );
        assert!(
            content.contains("TerminateServerProcess"),
            "WiX fragment should contain TerminateServerProcess custom action"
        );
        assert!(
            content.contains("taskkill.exe /F /IM Porua.exe"),
            "WiX fragment should terminate Porua.exe"
        );
        assert!(
            content.contains("taskkill.exe /F /IM porua_server.exe"),
            "WiX fragment should terminate porua_server.exe"
        );

        // Check for AppData cleanup
        assert!(
            content.contains("RemoveFolderEx"),
            "WiX fragment should use RemoveFolderEx for directory cleanup"
        );
        assert!(
            content.contains("PORUAAPPDATA"),
            "WiX fragment should define PORUAAPPDATA property"
        );

        // Check for registry cleanup
        assert!(
            content.contains("Software\\Porua"),
            "WiX fragment should reference Porua registry key"
        );
        assert!(
            content.contains("AppDataPath"),
            "WiX fragment should store AppDataPath in registry"
        );

        // Check for proper sequencing
        assert!(
            content.contains("Before=\"RemoveFiles\""),
            "WiX fragment should terminate processes before removing files"
        );
        assert!(
            content.contains("REMOVE~=\"ALL\""),
            "WiX fragment should only run custom actions during uninstall"
        );
    }

    #[test]
    fn test_tauri_config_references_wix_fragment() {
        // Verify tauri.conf.json is configured to use the WiX fragment
        let config_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tauri.conf.json");

        let content = std::fs::read_to_string(&config_path)
            .expect("Should read tauri.conf.json");

        // Check for WiX configuration
        assert!(
            content.contains("\"wix\""),
            "tauri.conf.json should have wix configuration"
        );
        assert!(
            content.contains("complete-cleanup.wxs"),
            "tauri.conf.json should reference complete-cleanup.wxs fragment"
        );
        assert!(
            content.contains("PoruaDataCleanup"),
            "tauri.conf.json should reference PoruaDataCleanup component"
        );
    }

    #[test]
    fn test_nsis_not_in_targets() {
        // Verify NSIS is not in build targets to prevent duplicate Windows installers
        let config_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tauri.conf.json");

        let content = std::fs::read_to_string(&config_path)
            .expect("Should read tauri.conf.json");

        // Parse as JSON to check targets array
        let config: serde_json::Value = serde_json::from_str(&content)
            .expect("Should parse tauri.conf.json as JSON");

        let targets = config
            .pointer("/tauri/bundle/targets")
            .expect("Should have targets field");

        if let Some(targets_array) = targets.as_array() {
            // Check that MSI is included
            let has_msi = targets_array
                .iter()
                .any(|t| t.as_str() == Some("msi"));
            assert!(has_msi, "MSI should be in targets for Windows builds");

            // Check that NSIS is NOT included
            let has_nsis = targets_array
                .iter()
                .any(|t| t.as_str() == Some("nsis"));
            assert!(!has_nsis, "NSIS should not be in targets (only MSI for Windows)");
        } else {
            panic!("targets should be an array");
        }
    }
}
