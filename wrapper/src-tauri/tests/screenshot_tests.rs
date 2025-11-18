mod common;

#[cfg(test)]
mod screenshot_capture_tests {
    use porua_wrapper::capture::screenshot::*;
    use std::path::Path;
    use crate::common::TestFixture;

    #[tokio::test]
    async fn test_get_capture_temp_path_returns_valid_path() {
        let path = get_capture_temp_path();

        assert!(path.parent().unwrap().exists(), "Parent directory should exist");
        assert!(path.to_string_lossy().contains("porua_capture_"),
                "Filename should contain prefix");
        assert!(path.extension().unwrap() == "png", "Extension should be .png");
    }

    #[tokio::test]
    async fn test_temp_path_is_unique_per_call() {
        let path1 = get_capture_temp_path();
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        let path2 = get_capture_temp_path();

        assert_ne!(path1, path2, "Each call should generate unique filename");
    }

    #[tokio::test]
    async fn test_capture_screen_region_creates_file() {
        // Capture a small region (100x100) from top-left corner
        // Works on all platforms thanks to mock implementation
        let result = capture_screen_region(0, 0, 100, 100).await;

        assert!(result.is_ok(), "Capture should succeed");

        let path = result.unwrap();
        assert!(Path::new(&path).exists(), "Captured image file should exist");

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_capture_creates_valid_png() {
        // Test that captured images are valid PNG files
        // Works on all platforms thanks to mock implementation
        let result = capture_screen_region(0, 0, 100, 100).await;
        assert!(result.is_ok());

        let path = result.unwrap();

        // Try to load as image
        let img = image::open(&path);
        assert!(img.is_ok(), "Should be valid PNG image");

        let img = img.unwrap();
        assert_eq!(img.width(), 100, "Image width should match requested");
        assert_eq!(img.height(), 100, "Image height should match requested");

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_capture_with_invalid_dimensions_fails() {
        // Zero dimensions should fail
        let result = capture_screen_region(0, 0, 0, 0).await;
        assert!(result.is_err(), "Zero dimensions should fail");

        let result = capture_screen_region(0, 0, 0, 100).await;
        assert!(result.is_err(), "Zero width should fail");

        let result = capture_screen_region(0, 0, 100, 0).await;
        assert!(result.is_err(), "Zero height should fail");
    }

    #[tokio::test]
    async fn test_capture_with_dpi_scaling() {
        // Test that DPI scaling works correctly with coordinate conversion
        // Works on all platforms - tests the logic, not actual screen capture
        use porua_wrapper::capture::monitors::*;

        let monitors = get_all_monitors_sync();
        if let Some(monitor) = monitors.first() {
            let scale = monitor.scale_factor;

            // Logical coordinates
            let logical_x = 100;
            let logical_y = 100;
            let logical_w = 200;
            let logical_h = 200;

            // Convert to physical for capture
            let (phys_x, phys_y) = logical_to_physical(logical_x, logical_y, scale);
            let (phys_w, phys_h) = logical_to_physical(logical_w as i32, logical_h as i32, scale);

            let result = capture_screen_region(
                phys_x,
                phys_y,
                phys_w as u32,
                phys_h as u32
            ).await;

            assert!(result.is_ok(), "DPI-aware capture should succeed");

            if let Ok(path) = result {
                let img = image::open(&path).unwrap();
                // Image dimensions should match physical pixels
                assert_eq!(img.width(), phys_w as u32);
                assert_eq!(img.height(), phys_h as u32);

                let _ = std::fs::remove_file(path);
            }
        }
    }

    #[tokio::test]
    async fn test_cleanup_old_captures() {
        let fixture = TestFixture::new();

        // Create some old test files
        let old_file = fixture.temp_path().join("porua_capture_old.png");
        std::fs::write(&old_file, b"fake image data").unwrap();

        // Set file timestamp to 25 hours ago
        let now = std::time::SystemTime::now();
        let old_time = now - std::time::Duration::from_secs(25 * 60 * 60);

        filetime::set_file_mtime(&old_file, filetime::FileTime::from_system_time(old_time)).unwrap();

        // Run cleanup (24 hour threshold)
        cleanup_old_captures_in_dir(fixture.temp_path()).unwrap();

        // Old file should be deleted
        assert!(!old_file.exists(), "Old capture should be deleted");
    }

    #[tokio::test]
    async fn test_cleanup_preserves_recent_captures() {
        let fixture = TestFixture::new();

        let recent_file = fixture.temp_path().join("porua_capture_recent.png");
        std::fs::write(&recent_file, b"fake image data").unwrap();

        // File is recent (just created)
        cleanup_old_captures_in_dir(fixture.temp_path()).unwrap();

        // Recent file should still exist
        assert!(recent_file.exists(), "Recent capture should be preserved");
    }

    #[tokio::test]
    async fn test_cleanup_only_removes_porua_files() {
        let fixture = TestFixture::new();

        // Create old Porua capture
        let old_porua = fixture.temp_path().join("porua_capture_123.png");
        std::fs::write(&old_porua, b"fake").unwrap();
        let old_time = std::time::SystemTime::now() - std::time::Duration::from_secs(25 * 60 * 60);
        filetime::set_file_mtime(&old_porua, filetime::FileTime::from_system_time(old_time)).unwrap();

        // Create old non-Porua file
        let old_other = fixture.temp_path().join("other_file.png");
        std::fs::write(&old_other, b"fake").unwrap();
        filetime::set_file_mtime(&old_other, filetime::FileTime::from_system_time(old_time)).unwrap();

        cleanup_old_captures_in_dir(fixture.temp_path()).unwrap();

        // Only Porua file should be deleted
        assert!(!old_porua.exists(), "Old Porua capture should be deleted");
        assert!(old_other.exists(), "Other files should not be deleted");
    }
}
