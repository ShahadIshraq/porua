//! Integration tests for the screen capture workflow
//! Tests the end-to-end capture process using mock backend

use porua_wrapper::capture::{
    CaptureError, MockScreenBackend, MonitorInfo, Rect, ScreenCapture,
};
use tempfile::TempDir;

/// Helper to create a test capture instance
fn create_test_capture() -> (ScreenCapture<MockScreenBackend>, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let capture = ScreenCapture::with_backend(
        MockScreenBackend::new(),
        temp_dir.path().to_path_buf(),
    );
    (capture, temp_dir)
}

/// Helper to create a capture with custom backend
fn create_capture_with_backend(backend: MockScreenBackend) -> (ScreenCapture<MockScreenBackend>, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());
    (capture, temp_dir)
}

// ==================== End-to-End Workflow Tests ====================

#[test]
fn test_capture_workflow_end_to_end() {
    let (capture, _temp_dir) = create_test_capture();

    // 1. Verify we can get monitors
    let monitors = capture.get_monitors().expect("Should get monitors");
    assert!(!monitors.is_empty());

    // 2. Verify we can get virtual screen bounds
    let bounds = capture.get_virtual_screen_bounds();
    assert!(bounds.width > 0);
    assert!(bounds.height > 0);

    // 3. Create a valid selection within bounds
    let selection = Rect::new(100, 100, 200, 150);

    // 4. Validate the selection
    let validated = capture.validate_selection(selection).expect("Should validate");
    assert_eq!(validated.width, 200);
    assert_eq!(validated.height, 150);

    // 5. Perform capture
    let result = capture.capture_region(selection).expect("Capture should succeed");

    // 6. Verify result
    assert!(!result.file_path.is_empty());
    assert!(std::path::Path::new(&result.file_path).exists());
    assert!(!result.timestamp.is_empty());
}

#[test]
fn test_capture_returns_valid_file_path() {
    let (capture, temp_dir) = create_test_capture();

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    // File path should be absolute and exist
    let path = std::path::Path::new(&result.file_path);
    assert!(path.is_absolute() || result.file_path.starts_with(temp_dir.path().to_str().unwrap()));
    assert!(path.exists());
}

#[test]
fn test_capture_file_exists_after_completion() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(50, 50, 300, 200);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    // Verify file exists and is readable
    let path = std::path::Path::new(&result.file_path);
    assert!(path.exists(), "Captured file should exist");
    assert!(path.is_file(), "Should be a file");

    // Verify it's a valid image
    let metadata = std::fs::metadata(path).expect("Should read metadata");
    assert!(metadata.len() > 0, "File should not be empty");
}

#[test]
fn test_capture_image_matches_selection_dimensions() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(0, 0, 320, 240);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    // Load and verify dimensions
    let img = image::open(&result.file_path).expect("Should load image");
    assert_eq!(img.width(), 320, "Width should match selection");
    assert_eq!(img.height(), 240, "Height should match selection");
}

#[test]
fn test_capture_with_dpi_scaling_adjusts_dimensions() {
    let backend = MockScreenBackend::new().with_dpi_scale(1.5);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    // With 1.5x DPI, dimensions should be scaled
    assert_eq!(result.width, 150, "Width should be scaled by DPI");
    assert_eq!(result.height, 150, "Height should be scaled by DPI");
}

#[test]
fn test_capture_handles_multi_monitor_coordinates() {
    let monitors = vec![
        MonitorInfo {
            id: 0,
            name: "Primary".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            dpi_scale: 1.0,
            is_primary: true,
        },
        MonitorInfo {
            id: 1,
            name: "Secondary".to_string(),
            x: 1920, // Right of primary
            y: 0,
            width: 1920,
            height: 1080,
            dpi_scale: 1.0,
            is_primary: false,
        },
    ];

    let backend = MockScreenBackend::new()
        .with_monitors(monitors)
        .with_virtual_bounds(Rect::new(0, 0, 3840, 1080));

    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // Capture from second monitor (x starts at 1920)
    let rect = Rect::new(2000, 100, 200, 200);
    let result = capture.capture_region(rect);

    assert!(result.is_ok(), "Should capture from second monitor");
}

#[test]
fn test_capture_clamps_selection_spanning_monitors() {
    let backend = MockScreenBackend::new()
        .with_virtual_bounds(Rect::new(0, 0, 3840, 1080));

    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // Selection that spans across monitor boundary
    let rect = Rect::new(1800, 500, 400, 200);
    let validated = capture.validate_selection(rect).expect("Should validate");

    // Should be clamped to virtual screen bounds
    assert!(validated.x + validated.width as i32 <= 3840);
}

// ==================== Validation Integration Tests ====================

#[test]
fn test_validation_rejects_too_small_selection() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(100, 100, 5, 5);
    let result = capture.validate_selection(rect);

    assert!(matches!(result, Err(CaptureError::SelectionTooSmall)));
}

#[test]
fn test_validation_clamps_to_screen_bounds() {
    let backend = MockScreenBackend::new()
        .with_virtual_bounds(Rect::new(0, 0, 1920, 1080));

    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // Selection extends past right edge
    let rect = Rect::new(1800, 500, 300, 200);
    let validated = capture.validate_selection(rect).expect("Should validate");

    // Width should be clamped
    assert_eq!(validated.x, 1800);
    assert_eq!(validated.width, 120, "Width should be clamped to 1920-1800=120");
}

#[test]
fn test_validation_handles_negative_coordinates() {
    let backend = MockScreenBackend::new()
        .with_virtual_bounds(Rect::new(0, 0, 1920, 1080));

    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // Selection with negative start
    let rect = Rect::new(-50, -30, 200, 200);
    let validated = capture.validate_selection(rect).expect("Should validate");

    assert_eq!(validated.x, 0, "X should be clamped to 0");
    assert_eq!(validated.y, 0, "Y should be clamped to 0");
}

// ==================== Permission Tests ====================

#[test]
fn test_permission_check_integration() {
    let backend = MockScreenBackend::new().with_permission(true);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let result = capture.check_permission();
    assert!(result.is_ok());
    assert!(result.unwrap());
}

#[test]
fn test_permission_denied_prevents_capture_conceptually() {
    let backend = MockScreenBackend::new().with_permission(false);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // Permission check should fail
    let result = capture.check_permission();
    assert!(matches!(result, Err(CaptureError::PermissionDenied)));

    // Note: In real app, we'd check permission before capturing
    // The mock still allows capture for testing purposes
}

// ==================== Error Handling Tests ====================

#[test]
fn test_capture_with_no_monitors_fails() {
    let backend = MockScreenBackend::new().with_monitors(vec![]);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let result = capture.get_monitors();
    assert!(matches!(result, Err(CaptureError::NoMonitors)));
}

#[test]
fn test_multiple_captures_create_unique_files() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(0, 0, 50, 50);

    let result1 = capture.capture_region(rect).expect("First capture");
    let result2 = capture.capture_region(rect).expect("Second capture");
    let result3 = capture.capture_region(rect).expect("Third capture");

    // All file paths should be unique
    assert_ne!(result1.file_path, result2.file_path);
    assert_ne!(result2.file_path, result3.file_path);
    assert_ne!(result1.file_path, result3.file_path);

    // All files should exist
    assert!(std::path::Path::new(&result1.file_path).exists());
    assert!(std::path::Path::new(&result2.file_path).exists());
    assert!(std::path::Path::new(&result3.file_path).exists());
}

// ==================== DPI Scaling Integration Tests ====================

#[test]
fn test_capture_at_100_percent_dpi() {
    let backend = MockScreenBackend::new().with_dpi_scale(1.0);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    assert_eq!(result.width, 100);
    assert_eq!(result.height, 100);
}

#[test]
fn test_capture_at_125_percent_dpi() {
    let backend = MockScreenBackend::new().with_dpi_scale(1.25);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    assert_eq!(result.width, 125);
    assert_eq!(result.height, 125);
}

#[test]
fn test_capture_at_150_percent_dpi() {
    let backend = MockScreenBackend::new().with_dpi_scale(1.5);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    assert_eq!(result.width, 150);
    assert_eq!(result.height, 150);
}

#[test]
fn test_capture_at_200_percent_dpi() {
    let backend = MockScreenBackend::new().with_dpi_scale(2.0);
    let (capture, _temp_dir) = create_capture_with_backend(backend);

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    assert_eq!(result.width, 200);
    assert_eq!(result.height, 200);
}

// ==================== Timestamp Tests ====================

#[test]
fn test_capture_result_has_valid_timestamp() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(0, 0, 100, 100);
    let result = capture.capture_region(rect).expect("Capture should succeed");

    // Timestamp should be in format "YYYY-MM-DD HH:MM:SS"
    assert!(!result.timestamp.is_empty());
    assert!(result.timestamp.contains("-"), "Should have date separators");
    assert!(result.timestamp.contains(":"), "Should have time separators");
    assert_eq!(result.timestamp.len(), 19, "Should be 19 chars: YYYY-MM-DD HH:MM:SS");
}

// ==================== Stress Tests ====================

#[test]
fn test_rapid_successive_captures() {
    let (capture, _temp_dir) = create_test_capture();

    let rect = Rect::new(0, 0, 50, 50);

    // Perform 10 rapid captures
    let mut results = Vec::new();
    for _ in 0..10 {
        let result = capture.capture_region(rect).expect("Capture should succeed");
        results.push(result);
    }

    // All should have unique file paths
    let paths: std::collections::HashSet<_> = results.iter().map(|r| &r.file_path).collect();
    assert_eq!(paths.len(), 10, "All captures should have unique paths");
}

#[test]
fn test_large_selection_capture() {
    let backend = MockScreenBackend::new()
        .with_virtual_bounds(Rect::new(0, 0, 3840, 2160));

    let (capture, _temp_dir) = create_capture_with_backend(backend);

    // 4K capture
    let rect = Rect::new(0, 0, 3840, 2160);
    let result = capture.capture_region(rect).expect("Large capture should succeed");

    assert_eq!(result.width, 3840);
    assert_eq!(result.height, 2160);

    // Verify file was created
    assert!(std::path::Path::new(&result.file_path).exists());
}
