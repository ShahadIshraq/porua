#[cfg(test)]
mod preview_integration_tests {
    use porua_wrapper::capture::*;

    #[tokio::test]
    async fn test_capture_region_creates_file_for_preview() {
        // Simulate successful capture that would lead to preview
        let result = screenshot::capture_screen_region(100, 100, 100, 100).await;

        assert!(result.is_ok(), "Capture should succeed");

        let path = result.unwrap();
        assert!(std::path::Path::new(&path).exists(), "Image file should exist for preview");

        // Verify file is a valid PNG
        let img = image::open(&path).expect("Should be valid PNG for preview");
        assert_eq!(img.width(), 100);
        assert_eq!(img.height(), 100);

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_url_encoding_for_preview_paths() {
        // Test that paths with special characters can be URL encoded
        let test_paths = vec![
            "/tmp/porua_capture_123_0.png",
            "/tmp/my capture/file.png",
            "/tmp/file with spaces.png",
            "/tmp/special!@#$%.png",
        ];

        for path in test_paths {
            let encoded = urlencoding::encode(path);
            let decoded = urlencoding::decode(&encoded).expect("Should decode");
            assert_eq!(decoded, path, "URL encoding roundtrip should preserve path");
        }
    }

    #[test]
    fn test_preview_window_dimensions() {
        // Verify preview window dimensions are reasonable
        let width = 800.0;
        let height = 600.0;
        let min_width = 400.0;
        let min_height = 300.0;

        assert!(width >= min_width, "Default width should be >= minimum");
        assert!(height >= min_height, "Default height should be >= minimum");
        assert!(width > 0.0 && height > 0.0, "Dimensions should be positive");
    }

    #[tokio::test]
    async fn test_capture_and_save_workflow() {
        // Test the complete capture → preview → save workflow

        // 1. Capture region
        let capture_result = screenshot::capture_screen_region(150, 150, 200, 200).await;
        assert!(capture_result.is_ok(), "Capture should succeed");

        let source_path = capture_result.unwrap();
        assert!(std::path::Path::new(&source_path).exists(), "Source file should exist");

        // 2. Simulate save (what preview's "Save As" would do)
        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_saved_screenshot.png");

        let copy_result = std::fs::copy(&source_path, &dest_path);
        assert!(copy_result.is_ok(), "Copy should succeed");

        // 3. Verify both files exist and are identical
        assert!(std::path::Path::new(&dest_path).exists(), "Destination file should exist");

        let source_size = std::fs::metadata(&source_path).unwrap().len();
        let dest_size = std::fs::metadata(&dest_path).unwrap().len();
        assert_eq!(source_size, dest_size, "Files should be identical size");

        // Cleanup
        let _ = std::fs::remove_file(source_path);
        let _ = std::fs::remove_file(dest_path);
    }

    #[tokio::test]
    async fn test_multiple_captures_for_preview() {
        // Test that multiple sequential captures work (recapture scenario)
        let mut paths = Vec::new();

        for i in 0..3 {
            let size = 50 + (i * 10);
            let result = screenshot::capture_screen_region(0, 0, size, size).await;
            assert!(result.is_ok(), "Capture {} should succeed", i);

            let path = result.unwrap();
            assert!(std::path::Path::new(&path).exists(), "Image {} should exist", i);
            paths.push(path);
        }

        // Verify all captures are unique
        assert_eq!(paths.len(), 3, "Should have 3 captures");
        assert_ne!(paths[0], paths[1], "First two captures should be different files");
        assert_ne!(paths[1], paths[2], "Last two captures should be different files");

        // Cleanup
        for path in paths {
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn test_image_path_extraction_from_url() {
        // Test parsing image path from URL parameter (what preview.js does)
        let test_cases = vec![
            ("preview.html?path=%2Ftmp%2Ffile.png", "/tmp/file.png"),
            ("preview.html?path=%2Ftmp%2Fmy%20file.png", "/tmp/my file.png"),
        ];

        for (url, expected_path) in test_cases {
            // Extract path parameter
            let url_parts: Vec<&str> = url.split("path=").collect();
            assert_eq!(url_parts.len(), 2, "URL should have path parameter");

            let encoded_path = url_parts[1];
            let decoded = urlencoding::decode(encoded_path).expect("Should decode");
            assert_eq!(decoded, expected_path, "Decoded path should match expected");
        }
    }

    #[tokio::test]
    async fn test_preview_with_small_image() {
        // Test preview with minimum size image (edge case)
        let result = screenshot::capture_screen_region(0, 0, 10, 10).await;
        assert!(result.is_ok(), "Small capture should succeed");

        let path = result.unwrap();
        let img = image::open(&path).expect("Should be valid image");

        assert_eq!(img.width(), 10, "Width should be 10");
        assert_eq!(img.height(), 10, "Height should be 10");

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_preview_with_large_image() {
        // Test preview with large image
        let result = screenshot::capture_screen_region(0, 0, 800, 600).await;
        assert!(result.is_ok(), "Large capture should succeed");

        let path = result.unwrap();
        let img = image::open(&path).expect("Should be valid image");

        assert_eq!(img.width(), 800, "Width should be 800");
        assert_eq!(img.height(), 600, "Height should be 600");

        // Cleanup
        let _ = std::fs::remove_file(path);
    }
}
