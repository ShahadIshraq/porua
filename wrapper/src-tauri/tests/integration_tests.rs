#[cfg(test)]
mod integration_tests {
    use porua_wrapper::capture::*;

    #[tokio::test]
    async fn test_end_to_end_capture_workflow() {
        // This test simulates the full workflow without actual UI

        // 1. Get monitors
        let monitors = monitors::get_all_monitors_sync();
        assert!(!monitors.is_empty(), "Should detect at least one monitor");

        // 2. Calculate virtual screen bounds
        let (vx, vy, vw, vh) = monitors::get_virtual_screen_bounds();
        assert!(vw > 0 && vh > 0, "Virtual bounds should have positive dimensions");

        // 3. Simulate user selection (100x100 region)
        let (sel_x, sel_y, sel_w, sel_h) = overlay::calculate_selection_bounds(
            100, 100, 200, 200
        );
        assert_eq!(sel_x, 100);
        assert_eq!(sel_y, 100);
        assert_eq!(sel_w, 100);
        assert_eq!(sel_h, 100);

        // 4. Validate selection
        assert!(overlay::is_selection_valid(sel_w, sel_h), "Selection should be valid");

        // 5. Clamp to screen
        let (final_x, final_y, final_w, final_h) = overlay::clamp_selection_to_bounds(
            sel_x, sel_y, sel_w, sel_h,
            (vx, vy, vw, vh)
        );
        assert_eq!(final_w, sel_w, "Width should not change (within bounds)");
        assert_eq!(final_h, sel_h, "Height should not change (within bounds)");

        // 6. Capture screenshot
        let result = screenshot::capture_screen_region(
            final_x, final_y, final_w, final_h
        ).await;

        assert!(result.is_ok(), "Capture should succeed: {:?}", result.err());

        let path = result.unwrap();
        assert!(std::path::Path::new(&path).exists(), "Image file should exist");

        // 7. Verify image properties
        let img = image::open(&path).expect("Should open captured image");
        assert_eq!(img.width(), final_w, "Image width should match");
        assert_eq!(img.height(), final_h, "Image height should match");

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_monitor_dpi_awareness_integration() {
        let monitors = monitors::get_all_monitors_sync();

        for monitor in &monitors {
            // Logical coordinates
            let log_x = 100;
            let log_y = 100;

            // Convert to physical
            let (phys_x, phys_y) = monitors::logical_to_physical(
                log_x, log_y, monitor.scale_factor
            );

            // Physical should be scaled
            let expected_x = (log_x as f64 * monitor.scale_factor) as i32;
            let expected_y = (log_y as f64 * monitor.scale_factor) as i32;

            assert_eq!(phys_x, expected_x, "Physical X should match expected");
            assert_eq!(phys_y, expected_y, "Physical Y should match expected");

            // Convert back to logical
            let (back_x, back_y) = monitors::physical_to_logical(
                phys_x, phys_y, monitor.scale_factor
            );

            assert_eq!(back_x, log_x, "Roundtrip X should match original");
            assert_eq!(back_y, log_y, "Roundtrip Y should match original");
        }
    }

    #[tokio::test]
    async fn test_invalid_selection_workflow() {
        // Test that invalid selections are properly rejected

        // 1. Get screen bounds
        let (vx, vy, vw, vh) = monitors::get_virtual_screen_bounds();

        // 2. Create selection that's too small (5x5)
        let (sel_x, sel_y, sel_w, sel_h) = overlay::calculate_selection_bounds(
            100, 100, 105, 105
        );

        // 3. Validate selection - should fail
        assert!(!overlay::is_selection_valid(sel_w, sel_h), "Small selection should be invalid");

        // 4. Try to capture anyway - should fail
        let result = screenshot::capture_screen_region(sel_x, sel_y, 0, 0).await;
        assert!(result.is_err(), "Zero dimensions should fail");
    }

    #[tokio::test]
    async fn test_selection_outside_bounds_workflow() {
        // Test workflow when selection extends beyond screen

        // 1. Get screen bounds
        let (vx, vy, vw, vh) = monitors::get_virtual_screen_bounds();

        // 2. Create selection that extends beyond screen
        let far_x = vx + vw as i32 - 50; // Near right edge
        let far_y = vy + vh as i32 - 50; // Near bottom edge

        let (sel_x, sel_y, sel_w, sel_h) = overlay::calculate_selection_bounds(
            far_x, far_y, far_x + 100, far_y + 100
        );

        // 3. Clamp to screen bounds
        let (clamped_x, clamped_y, clamped_w, clamped_h) = overlay::clamp_selection_to_bounds(
            sel_x, sel_y, sel_w, sel_h,
            (vx, vy, vw, vh)
        );

        // 4. Width and height should be clamped
        assert!(clamped_w <= sel_w, "Width should be clamped or same");
        assert!(clamped_h <= sel_h, "Height should be clamped or same");
        assert!(clamped_w > 0, "Width should still be positive");
        assert!(clamped_h > 0, "Height should still be positive");

        // 5. Should be valid after clamping if > 10x10
        if overlay::is_selection_valid(clamped_w, clamped_h) {
            let result = screenshot::capture_screen_region(
                clamped_x, clamped_y, clamped_w, clamped_h
            ).await;
            assert!(result.is_ok(), "Clamped capture should succeed");

            if let Ok(path) = result {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    #[tokio::test]
    async fn test_multi_monitor_coordinate_workflow() {
        // Test that multi-monitor coordinates work correctly

        let monitors = monitors::get_all_monitors_sync();
        if monitors.len() < 2 {
            // Skip if only one monitor (can't test multi-monitor)
            return;
        }

        // Find a monitor with negative coordinates (if any)
        let negative_monitor = monitors.iter().find(|m| m.x < 0 || m.y < 0);

        if let Some(monitor) = negative_monitor {
            // Select region on negative-coordinate monitor
            let sel_x = monitor.x + 100;
            let sel_y = monitor.y + 100;

            let (bounds_x, bounds_y, bounds_w, bounds_h) = overlay::calculate_selection_bounds(
                sel_x, sel_y, sel_x + 100, sel_y + 100
            );

            // Should handle negative coordinates correctly
            assert_eq!(bounds_x, sel_x);
            assert_eq!(bounds_y, sel_y);
            assert_eq!(bounds_w, 100);
            assert_eq!(bounds_h, 100);

            // Validate against virtual screen bounds
            let (vx, vy, vw, vh) = monitors::get_virtual_screen_bounds();
            let (clamped_x, clamped_y, clamped_w, clamped_h) = overlay::clamp_selection_to_bounds(
                bounds_x, bounds_y, bounds_w, bounds_h,
                (vx, vy, vw, vh)
            );

            // Should remain within virtual bounds
            assert!(clamped_x >= vx);
            assert!(clamped_y >= vy);
        }
    }
}
