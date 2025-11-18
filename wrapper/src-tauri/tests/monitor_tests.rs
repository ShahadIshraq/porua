#[cfg(test)]
mod monitor_detection_tests {
    use porua_wrapper::capture::monitors::*;

    #[test]
    fn test_get_all_monitors_returns_at_least_one() {
        // Should detect at least one monitor on any system
        let monitors = get_all_monitors_sync();
        assert!(!monitors.is_empty(), "Should detect at least one monitor");
    }

    #[test]
    fn test_monitor_has_valid_dimensions() {
        let monitors = get_all_monitors_sync();
        for monitor in monitors {
            assert!(monitor.width > 0, "Monitor width must be positive");
            assert!(monitor.height > 0, "Monitor height must be positive");
        }
    }

    #[test]
    fn test_at_least_one_primary_monitor() {
        let monitors = get_all_monitors_sync();
        let primary_count = monitors.iter().filter(|m| m.is_primary).count();
        assert_eq!(primary_count, 1, "Should have exactly one primary monitor");
    }

    #[test]
    fn test_monitor_scale_factor_is_valid() {
        let monitors = get_all_monitors_sync();
        for monitor in monitors {
            assert!(monitor.scale_factor > 0.0, "Scale factor must be positive");
            assert!(monitor.scale_factor <= 4.0, "Scale factor should be reasonable (<=4.0)");
        }
    }

    #[test]
    fn test_virtual_screen_bounds_encompass_all_monitors() {
        let monitors = get_all_monitors_sync();
        let (vx, vy, vw, vh) = get_virtual_screen_bounds();

        for monitor in monitors {
            // Each monitor should be within virtual bounds
            assert!(monitor.x >= vx, "Monitor X should be >= virtual X");
            assert!(monitor.y >= vy, "Monitor Y should be >= virtual Y");
            assert!(monitor.x + monitor.width as i32 <= vx + vw as i32,
                    "Monitor right edge should be within virtual bounds");
            assert!(monitor.y + monitor.height as i32 <= vy + vh as i32,
                    "Monitor bottom edge should be within virtual bounds");
        }
    }

    #[test]
    fn test_dpi_coordinate_conversion_roundtrip() {
        // Test DPI conversion: logical -> physical -> logical
        let test_cases = vec![
            (100, 200, 1.0),
            (100, 200, 1.25),
            (100, 200, 1.5),
            (100, 200, 2.0),
        ];

        for (x, y, scale) in test_cases {
            let (px, py) = logical_to_physical(x, y, scale);
            let (lx, ly) = physical_to_logical(px, py, scale);

            assert_eq!(lx, x, "X coordinate should roundtrip at scale {}", scale);
            assert_eq!(ly, y, "Y coordinate should roundtrip at scale {}", scale);
        }
    }

    #[test]
    fn test_dpi_scaling_calculations() {
        // At 150% (1.5x) scale
        let (px, py) = logical_to_physical(100, 200, 1.5);
        assert_eq!(px, 150, "150% of 100 = 150");
        assert_eq!(py, 300, "150% of 200 = 300");

        // At 200% (2.0x) scale
        let (px, py) = logical_to_physical(100, 200, 2.0);
        assert_eq!(px, 200, "200% of 100 = 200");
        assert_eq!(py, 400, "200% of 200 = 400");
    }

    #[test]
    fn test_negative_coordinates_supported() {
        // Monitors can have negative coordinates (left/above primary)
        let (px, py) = logical_to_physical(-100, -200, 1.5);
        let (lx, ly) = physical_to_logical(px, py, 1.5);

        assert_eq!(lx, -100, "Negative X should roundtrip");
        assert_eq!(ly, -200, "Negative Y should roundtrip");
    }
}
