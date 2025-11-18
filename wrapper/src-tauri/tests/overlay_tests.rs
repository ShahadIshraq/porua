#[cfg(test)]
mod overlay_window_tests {
    // Note: Window tests are harder to unit test
    // Focus on logic that can be tested without actual windows

    use porua_wrapper::capture::overlay::*;

    #[test]
    fn test_selection_bounds_calculation() {
        // User drags from (100, 100) to (300, 400)
        let (x, y, w, h) = calculate_selection_bounds(100, 100, 300, 400);

        assert_eq!(x, 100);
        assert_eq!(y, 100);
        assert_eq!(w, 200);
        assert_eq!(h, 300);
    }

    #[test]
    fn test_selection_bounds_with_reverse_drag() {
        // User drags bottom-right to top-left
        let (x, y, w, h) = calculate_selection_bounds(300, 400, 100, 100);

        // Should normalize to top-left corner
        assert_eq!(x, 100);
        assert_eq!(y, 100);
        assert_eq!(w, 200);
        assert_eq!(h, 300);
    }

    #[test]
    fn test_selection_bounds_all_directions() {
        // Test all 4 drag directions produce same result
        let expected = (100, 100, 200, 300);

        // Top-left to bottom-right
        assert_eq!(calculate_selection_bounds(100, 100, 300, 400), expected);
        // Bottom-right to top-left
        assert_eq!(calculate_selection_bounds(300, 400, 100, 100), expected);
        // Top-right to bottom-left
        assert_eq!(calculate_selection_bounds(300, 100, 100, 400), expected);
        // Bottom-left to top-right
        assert_eq!(calculate_selection_bounds(100, 400, 300, 100), expected);
    }

    #[test]
    fn test_selection_is_valid_minimum_size() {
        assert!(!is_selection_valid(5, 5), "9x9 too small");
        assert!(!is_selection_valid(10, 5), "10x5 too small");
        assert!(!is_selection_valid(5, 10), "5x10 too small");
        assert!(is_selection_valid(10, 10), "10x10 exactly minimum");
        assert!(is_selection_valid(11, 10), "11x10 valid");
        assert!(is_selection_valid(10, 11), "10x11 valid");
        assert!(is_selection_valid(100, 100), "100x100 valid");
    }

    #[test]
    fn test_selection_is_valid_edge_cases() {
        assert!(!is_selection_valid(0, 0), "0x0 invalid");
        assert!(!is_selection_valid(0, 100), "0x100 invalid");
        assert!(!is_selection_valid(100, 0), "100x0 invalid");
        assert!(!is_selection_valid(9, 9), "9x9 invalid");
        assert!(is_selection_valid(10, 10), "10x10 valid");
    }

    #[test]
    fn test_clamp_to_screen_bounds() {
        let screen_bounds = (0, 0, 1920, 1080);

        // Selection fully within bounds
        let (x, y, w, h) = clamp_selection_to_bounds(100, 100, 200, 200, screen_bounds);
        assert_eq!((x, y, w, h), (100, 100, 200, 200));

        // Selection extends beyond right edge
        let (x, y, w, h) = clamp_selection_to_bounds(1800, 100, 200, 200, screen_bounds);
        assert_eq!(x, 1800);
        assert_eq!(y, 100);
        assert_eq!(w, 120, "Width should be clamped to fit screen");
        assert_eq!(h, 200);

        // Selection extends beyond bottom edge
        let (x, y, w, h) = clamp_selection_to_bounds(100, 1000, 200, 200, screen_bounds);
        assert_eq!(x, 100);
        assert_eq!(y, 1000);
        assert_eq!(w, 200);
        assert_eq!(h, 80, "Height should be clamped to fit screen");
    }

    #[test]
    fn test_clamp_handles_negative_coordinates() {
        // Multi-monitor setup with negative coordinates
        let screen_bounds = (-1920, -1080, 3840, 2160); // Two monitors side-by-side

        // Selection starts before screen bounds
        let (x, y, w, h) = clamp_selection_to_bounds(-2000, -1100, 200, 200, screen_bounds);

        // Should clamp position to screen minimum
        assert!(x >= -1920, "X should be >= min X");
        assert!(y >= -1080, "Y should be >= min Y");
    }

    #[test]
    fn test_clamp_selection_completely_outside_bounds() {
        let screen_bounds = (0, 0, 1920, 1080);

        // Selection starts beyond screen
        let (x, y, w, h) = clamp_selection_to_bounds(2000, 2000, 100, 100, screen_bounds);

        // Should clamp to edge with zero size
        assert_eq!(x, 1920, "X clamped to screen max");
        assert_eq!(y, 1080, "Y clamped to screen max");
        assert_eq!(w, 0, "Width should be zero (outside bounds)");
        assert_eq!(h, 0, "Height should be zero (outside bounds)");
    }

    #[test]
    fn test_clamp_selection_partially_outside() {
        let screen_bounds = (0, 0, 1920, 1080);

        // Selection extends way beyond screen
        let (x, y, w, h) = clamp_selection_to_bounds(1800, 1000, 500, 500, screen_bounds);

        assert_eq!(x, 1800);
        assert_eq!(y, 1000);
        assert_eq!(w, 120, "Should clamp to remaining width");
        assert_eq!(h, 80, "Should clamp to remaining height");
    }

    #[test]
    fn test_clamp_preserves_valid_selections() {
        let screen_bounds = (0, 0, 1920, 1080);

        // Various valid selections should pass through unchanged
        let test_cases = vec![
            (0, 0, 100, 100),
            (500, 500, 300, 300),
            (1820, 980, 100, 100), // Near corner but valid
        ];

        for (x, y, w, h) in test_cases {
            let result = clamp_selection_to_bounds(x, y, w, h, screen_bounds);
            assert_eq!(result, (x, y, w, h), "Valid selection should not change");
        }
    }
}
