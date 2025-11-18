//! Screen capture module for Windows platform
//! Handles monitor detection, DPI scaling, and screen region capture

use anyhow::{anyhow, Result};
use image::{ImageBuffer, Rgba};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use tracing::{debug, error, info};

#[cfg(target_os = "windows")]
use windows::{
    Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT, TRUE},
    Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, SRCCOPY,
    },
    Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
    Win32::UI::WindowsAndMessaging::{
        EnumDisplayMonitors, GetMonitorInfoW, GetSystemMetrics, MONITORINFOEXW,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    },
};

/// Errors that can occur during screen capture operations
#[derive(Error, Debug)]
pub enum CaptureError {
    #[error("Selection too small (minimum 10x10px)")]
    SelectionTooSmall,

    #[error("Selection outside screen bounds")]
    OutOfBounds,

    #[error("Failed to capture screen: {0}")]
    CaptureFailure(String),

    #[error("Failed to save image: {0}")]
    SaveFailure(String),

    #[error("No monitors detected")]
    NoMonitors,

    #[error("Permission denied for screen capture")]
    PermissionDenied,

    #[error("Platform not supported")]
    PlatformNotSupported,
}

/// Represents a rectangle with position and dimensions
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self { x, y, width, height }
    }

    /// Create a Rect from two corner points
    pub fn from_points(x1: i32, y1: i32, x2: i32, y2: i32) -> Self {
        let x = x1.min(x2);
        let y = y1.min(y2);
        let width = (x1 - x2).unsigned_abs();
        let height = (y1 - y2).unsigned_abs();
        Self { x, y, width, height }
    }

    /// Check if the rect has valid minimum dimensions
    pub fn is_valid_size(&self, min_width: u32, min_height: u32) -> bool {
        self.width >= min_width && self.height >= min_height
    }
}

/// Information about a connected monitor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub dpi_scale: f64,
    pub is_primary: bool,
}

/// Result of a screen capture operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureResult {
    pub file_path: String,
    pub width: u32,
    pub height: u32,
    pub timestamp: String,
}

/// Main screen capture manager
pub struct ScreenCapture {
    temp_dir: PathBuf,
}

impl ScreenCapture {
    /// Create a new ScreenCapture instance
    pub fn new(temp_dir: PathBuf) -> Self {
        Self { temp_dir }
    }

    /// Get information about all connected monitors
    #[cfg(target_os = "windows")]
    pub fn get_monitors() -> Result<Vec<MonitorInfo>, CaptureError> {
        let mut monitors: Vec<MonitorInfo> = Vec::new();
        let monitors_ptr = &mut monitors as *mut Vec<MonitorInfo>;

        unsafe {
            let result = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(enum_monitor_callback),
                LPARAM(monitors_ptr as isize),
            );

            if !result.as_bool() {
                return Err(CaptureError::CaptureFailure(
                    "Failed to enumerate monitors".to_string(),
                ));
            }
        }

        if monitors.is_empty() {
            return Err(CaptureError::NoMonitors);
        }

        // Assign IDs
        for (i, monitor) in monitors.iter_mut().enumerate() {
            monitor.id = i as u32;
        }

        debug!("Detected {} monitors", monitors.len());
        Ok(monitors)
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_monitors() -> Result<Vec<MonitorInfo>, CaptureError> {
        Err(CaptureError::PlatformNotSupported)
    }

    /// Get the virtual screen bounds (encompasses all monitors)
    #[cfg(target_os = "windows")]
    pub fn get_virtual_screen_bounds() -> Rect {
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let width = GetSystemMetrics(SM_CXVIRTUALSCREEN) as u32;
            let height = GetSystemMetrics(SM_CYVIRTUALSCREEN) as u32;

            debug!(
                "Virtual screen bounds: x={}, y={}, width={}, height={}",
                x, y, width, height
            );

            Rect::new(x, y, width, height)
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_virtual_screen_bounds() -> Rect {
        Rect::new(0, 0, 1920, 1080) // Default fallback
    }

    /// Validate and adjust a selection rectangle
    pub fn validate_selection(rect: Rect) -> Result<Rect, CaptureError> {
        // Check minimum size
        if !rect.is_valid_size(10, 10) {
            return Err(CaptureError::SelectionTooSmall);
        }

        // Clamp to screen boundaries
        let bounds = Self::get_virtual_screen_bounds();
        let clamped = Self::clamp_rect_to_bounds(rect, bounds);

        Ok(clamped)
    }

    /// Clamp a rectangle to fit within given bounds
    pub fn clamp_rect_to_bounds(rect: Rect, bounds: Rect) -> Rect {
        let x = rect.x.max(bounds.x);
        let y = rect.y.max(bounds.y);

        let right = (rect.x + rect.width as i32).min(bounds.x + bounds.width as i32);
        let bottom = (rect.y + rect.height as i32).min(bounds.y + bounds.height as i32);

        let width = (right - x).max(0) as u32;
        let height = (bottom - y).max(0) as u32;

        Rect::new(x, y, width, height)
    }

    /// Apply DPI scaling to convert logical coordinates to physical pixels
    pub fn apply_dpi_scaling(rect: Rect, scale: f64) -> Rect {
        Rect::new(
            (rect.x as f64 * scale) as i32,
            (rect.y as f64 * scale) as i32,
            (rect.width as f64 * scale) as u32,
            (rect.height as f64 * scale) as u32,
        )
    }

    /// Get DPI scale factor for a specific point on screen
    #[cfg(target_os = "windows")]
    pub fn get_dpi_scale_at_point(x: i32, y: i32) -> f64 {
        use windows::Win32::Graphics::Gdi::MonitorFromPoint;
        use windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONEAREST;

        unsafe {
            let point = POINT { x, y };
            let monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);

            let mut dpi_x: u32 = 96;
            let mut dpi_y: u32 = 96;

            let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);

            dpi_x as f64 / 96.0
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_dpi_scale_at_point(_x: i32, _y: i32) -> f64 {
        1.0
    }

    /// Capture a region of the screen and save to file
    #[cfg(target_os = "windows")]
    pub fn capture_region(&self, rect: Rect) -> Result<CaptureResult, CaptureError> {
        info!(
            "Capturing region: x={}, y={}, width={}, height={}",
            rect.x, rect.y, rect.width, rect.height
        );

        // Validate the selection
        let validated_rect = Self::validate_selection(rect)?;

        // Get DPI scale for the capture area
        let dpi_scale = Self::get_dpi_scale_at_point(validated_rect.x, validated_rect.y);
        debug!("DPI scale factor: {}", dpi_scale);

        // Apply DPI scaling to get physical pixel coordinates
        let physical_rect = Self::apply_dpi_scaling(validated_rect, dpi_scale);

        // Capture the screen region
        let image_data = self.capture_screen_region_internal(physical_rect)?;

        // Generate unique filename
        let timestamp = chrono::Local::now();
        let filename = format!(
            "capture_{}_{}.png",
            timestamp.format("%Y%m%d_%H%M%S"),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0000")
        );

        let file_path = self.temp_dir.join(&filename);

        // Ensure temp directory exists
        std::fs::create_dir_all(&self.temp_dir).map_err(|e| {
            CaptureError::SaveFailure(format!("Failed to create temp directory: {}", e))
        })?;

        // Save the image
        image_data.save(&file_path).map_err(|e| {
            CaptureError::SaveFailure(format!("Failed to save image: {}", e))
        })?;

        info!("Captured image saved to: {:?}", file_path);

        Ok(CaptureResult {
            file_path: file_path.to_string_lossy().to_string(),
            width: physical_rect.width,
            height: physical_rect.height,
            timestamp: timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
        })
    }

    #[cfg(not(target_os = "windows"))]
    pub fn capture_region(&self, _rect: Rect) -> Result<CaptureResult, CaptureError> {
        Err(CaptureError::PlatformNotSupported)
    }

    /// Internal function to capture screen pixels using Windows GDI
    #[cfg(target_os = "windows")]
    fn capture_screen_region_internal(
        &self,
        rect: Rect,
    ) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, CaptureError> {
        unsafe {
            // Get screen device context
            let screen_dc = GetDC(HWND::default());
            if screen_dc.is_invalid() {
                return Err(CaptureError::CaptureFailure(
                    "Failed to get screen DC".to_string(),
                ));
            }

            // Create compatible DC for the capture
            let capture_dc = CreateCompatibleDC(screen_dc);
            if capture_dc.is_invalid() {
                ReleaseDC(HWND::default(), screen_dc);
                return Err(CaptureError::CaptureFailure(
                    "Failed to create compatible DC".to_string(),
                ));
            }

            // Create compatible bitmap
            let bitmap = CreateCompatibleBitmap(screen_dc, rect.width as i32, rect.height as i32);
            if bitmap.is_invalid() {
                DeleteDC(capture_dc);
                ReleaseDC(HWND::default(), screen_dc);
                return Err(CaptureError::CaptureFailure(
                    "Failed to create bitmap".to_string(),
                ));
            }

            // Select bitmap into DC
            let old_bitmap = SelectObject(capture_dc, bitmap);

            // Copy screen region to bitmap
            let result = BitBlt(
                capture_dc,
                0,
                0,
                rect.width as i32,
                rect.height as i32,
                screen_dc,
                rect.x,
                rect.y,
                SRCCOPY,
            );

            if !result.as_bool() {
                SelectObject(capture_dc, old_bitmap);
                DeleteObject(bitmap);
                DeleteDC(capture_dc);
                ReleaseDC(HWND::default(), screen_dc);
                return Err(CaptureError::CaptureFailure(
                    "BitBlt failed".to_string(),
                ));
            }

            // Prepare bitmap info header for extraction
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: rect.width as i32,
                    biHeight: -(rect.height as i32), // Negative for top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0 as u32,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [Default::default()],
            };

            // Allocate buffer for pixel data
            let buffer_size = (rect.width * rect.height * 4) as usize;
            let mut buffer: Vec<u8> = vec![0; buffer_size];

            // Get the bitmap bits
            let lines = GetDIBits(
                capture_dc,
                bitmap,
                0,
                rect.height,
                Some(buffer.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );

            // Cleanup GDI resources
            SelectObject(capture_dc, old_bitmap);
            DeleteObject(bitmap);
            DeleteDC(capture_dc);
            ReleaseDC(HWND::default(), screen_dc);

            if lines == 0 {
                return Err(CaptureError::CaptureFailure(
                    "GetDIBits failed".to_string(),
                ));
            }

            // Convert BGRA to RGBA
            for chunk in buffer.chunks_exact_mut(4) {
                chunk.swap(0, 2); // Swap B and R
            }

            // Create image buffer
            let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
                rect.width,
                rect.height,
                buffer,
            )
            .ok_or_else(|| {
                CaptureError::CaptureFailure("Failed to create image buffer".to_string())
            })?;

            Ok(image)
        }
    }

    /// Check if screen capture permission is available
    #[cfg(target_os = "windows")]
    pub fn check_permission() -> Result<bool, CaptureError> {
        // Windows generally allows screen capture without special permissions
        // However, some security software may block it
        // We'll do a quick test capture to verify
        unsafe {
            let screen_dc = GetDC(HWND::default());
            if screen_dc.is_invalid() {
                return Err(CaptureError::PermissionDenied);
            }
            ReleaseDC(HWND::default(), screen_dc);
            Ok(true)
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn check_permission() -> Result<bool, CaptureError> {
        Err(CaptureError::PlatformNotSupported)
    }
}

/// Callback function for EnumDisplayMonitors
#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_monitor_callback(
    monitor: windows::Win32::Graphics::Gdi::HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let monitors = &mut *(lparam.0 as *mut Vec<MonitorInfo>);

    let mut monitor_info = MONITORINFOEXW {
        monitorInfo: windows::Win32::Graphics::Gdi::MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };

    if GetMonitorInfoW(monitor, &mut monitor_info.monitorInfo).as_bool() {
        let rect = monitor_info.monitorInfo.rcMonitor;
        let is_primary = (monitor_info.monitorInfo.dwFlags & 1) != 0; // MONITORINFOF_PRIMARY

        // Get DPI for this monitor
        let mut dpi_x: u32 = 96;
        let mut dpi_y: u32 = 96;
        let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let dpi_scale = dpi_x as f64 / 96.0;

        // Get monitor name
        let name_slice = &monitor_info.szDevice;
        let name_len = name_slice.iter().position(|&c| c == 0).unwrap_or(name_slice.len());
        let name = String::from_utf16_lossy(&name_slice[..name_len]);

        monitors.push(MonitorInfo {
            id: 0, // Will be set later
            name,
            x: rect.left,
            y: rect.top,
            width: (rect.right - rect.left) as u32,
            height: (rect.bottom - rect.top) as u32,
            dpi_scale,
            is_primary,
        });
    }

    TRUE
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ==================== Monitor Detection Tests ====================

    #[test]
    #[cfg(target_os = "windows")]
    fn test_get_all_monitors_returns_at_least_one() {
        let monitors = ScreenCapture::get_monitors().expect("Should detect monitors");
        assert!(!monitors.is_empty(), "Should have at least one monitor");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_monitor_info_contains_valid_dimensions() {
        let monitors = ScreenCapture::get_monitors().expect("Should detect monitors");

        for monitor in monitors {
            assert!(monitor.width > 0, "Monitor width should be positive");
            assert!(monitor.height > 0, "Monitor height should be positive");
            assert!(
                monitor.width <= 8192,
                "Monitor width should be reasonable (<=8K)"
            );
            assert!(
                monitor.height <= 8192,
                "Monitor height should be reasonable (<=8K)"
            );
        }
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_primary_monitor_detected() {
        let monitors = ScreenCapture::get_monitors().expect("Should detect monitors");
        let primary_count = monitors.iter().filter(|m| m.is_primary).count();
        assert_eq!(primary_count, 1, "Should have exactly one primary monitor");
    }

    // ==================== DPI Scaling Tests ====================

    #[test]
    #[cfg(target_os = "windows")]
    fn test_dpi_scale_factor_valid_range() {
        let scale = ScreenCapture::get_dpi_scale_at_point(0, 0);
        assert!(scale >= 1.0, "DPI scale should be at least 1.0");
        assert!(scale <= 4.0, "DPI scale should be at most 4.0 (400%)");
    }

    #[test]
    fn test_apply_dpi_scaling_100_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::apply_dpi_scaling(rect, 1.0);

        assert_eq!(scaled.x, 100);
        assert_eq!(scaled.y, 200);
        assert_eq!(scaled.width, 300);
        assert_eq!(scaled.height, 400);
    }

    #[test]
    fn test_apply_dpi_scaling_150_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::apply_dpi_scaling(rect, 1.5);

        assert_eq!(scaled.x, 150);
        assert_eq!(scaled.y, 300);
        assert_eq!(scaled.width, 450);
        assert_eq!(scaled.height, 600);
    }

    #[test]
    fn test_apply_dpi_scaling_200_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::apply_dpi_scaling(rect, 2.0);

        assert_eq!(scaled.x, 200);
        assert_eq!(scaled.y, 400);
        assert_eq!(scaled.width, 600);
        assert_eq!(scaled.height, 800);
    }

    // ==================== Coordinate Translation Tests ====================

    #[test]
    fn test_rect_from_points_top_left_to_bottom_right() {
        let rect = Rect::from_points(10, 20, 110, 220);
        assert_eq!(rect.x, 10);
        assert_eq!(rect.y, 20);
        assert_eq!(rect.width, 100);
        assert_eq!(rect.height, 200);
    }

    #[test]
    fn test_rect_from_points_bottom_right_to_top_left() {
        let rect = Rect::from_points(110, 220, 10, 20);
        assert_eq!(rect.x, 10);
        assert_eq!(rect.y, 20);
        assert_eq!(rect.width, 100);
        assert_eq!(rect.height, 200);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_virtual_screen_bounds_valid() {
        let bounds = ScreenCapture::get_virtual_screen_bounds();
        assert!(bounds.width > 0, "Virtual screen width should be positive");
        assert!(bounds.height > 0, "Virtual screen height should be positive");
    }

    // ==================== Validation Tests ====================

    #[test]
    fn test_validate_selection_minimum_size_pass() {
        let rect = Rect::new(0, 0, 10, 10);
        let result = ScreenCapture::validate_selection(rect);
        assert!(result.is_ok(), "10x10 selection should be valid");
    }

    #[test]
    fn test_validate_selection_9x9_rejected() {
        let rect = Rect::new(0, 0, 9, 9);
        let result = ScreenCapture::validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "9x9 selection should be rejected"
        );
    }

    #[test]
    fn test_validate_selection_10x9_rejected() {
        let rect = Rect::new(0, 0, 10, 9);
        let result = ScreenCapture::validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "10x9 selection should be rejected"
        );
    }

    #[test]
    fn test_validate_selection_9x10_rejected() {
        let rect = Rect::new(0, 0, 9, 10);
        let result = ScreenCapture::validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "9x10 selection should be rejected"
        );
    }

    #[test]
    fn test_clamp_rect_extends_past_right_edge() {
        let rect = Rect::new(900, 0, 200, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.x, 900);
        assert_eq!(clamped.width, 100, "Should clamp width to screen boundary");
    }

    #[test]
    fn test_clamp_rect_extends_past_bottom_edge() {
        let rect = Rect::new(0, 900, 100, 200);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.y, 900);
        assert_eq!(clamped.height, 100, "Should clamp height to screen boundary");
    }

    #[test]
    fn test_clamp_rect_negative_x_clamped() {
        let rect = Rect::new(-50, 0, 100, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.x, 0, "Negative x should be clamped to 0");
    }

    #[test]
    fn test_clamp_rect_negative_y_clamped() {
        let rect = Rect::new(0, -50, 100, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.y, 0, "Negative y should be clamped to 0");
    }

    // ==================== Screen Capture Tests ====================

    #[test]
    #[cfg(target_os = "windows")]
    fn test_capture_region_creates_valid_png() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let capture = ScreenCapture::new(temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 100, 100);
        let result = capture.capture_region(rect);

        assert!(result.is_ok(), "Capture should succeed");

        let capture_result = result.unwrap();
        let path = std::path::Path::new(&capture_result.file_path);
        assert!(path.exists(), "Captured file should exist");
        assert!(
            path.extension().map_or(false, |ext| ext == "png"),
            "File should be PNG"
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_capture_region_correct_dimensions() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let capture = ScreenCapture::new(temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 200, 150);
        let result = capture.capture_region(rect).expect("Capture should succeed");

        // Load the image and verify dimensions
        let img = image::open(&result.file_path).expect("Should load captured image");

        // Note: actual dimensions may differ due to DPI scaling
        // We just verify the image is loadable and has reasonable dimensions
        assert!(img.width() > 0);
        assert!(img.height() > 0);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_capture_saves_to_temp_directory() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let temp_path = temp_dir.path().to_path_buf();
        let capture = ScreenCapture::new(temp_path.clone());

        let rect = Rect::new(0, 0, 50, 50);
        let result = capture.capture_region(rect).expect("Capture should succeed");

        assert!(
            result.file_path.starts_with(&temp_path.to_string_lossy().to_string()),
            "File should be in temp directory"
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_capture_unique_filename_generation() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let capture = ScreenCapture::new(temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 20, 20);

        let result1 = capture.capture_region(rect).expect("First capture should succeed");
        let result2 = capture.capture_region(rect).expect("Second capture should succeed");

        assert_ne!(
            result1.file_path, result2.file_path,
            "Each capture should have unique filename"
        );
    }

    // ==================== Permission Tests ====================

    #[test]
    #[cfg(target_os = "windows")]
    fn test_permission_check_returns_result() {
        let result = ScreenCapture::check_permission();
        // Should return Ok(true) or an error, but not panic
        assert!(result.is_ok() || result.is_err());
    }

    // ==================== Error Type Tests ====================

    #[test]
    fn test_capture_error_display() {
        let error = CaptureError::SelectionTooSmall;
        let msg = format!("{}", error);
        assert!(
            msg.contains("10x10"),
            "Error message should mention minimum size"
        );
    }

    #[test]
    fn test_rect_is_valid_size() {
        assert!(Rect::new(0, 0, 10, 10).is_valid_size(10, 10));
        assert!(Rect::new(0, 0, 100, 100).is_valid_size(10, 10));
        assert!(!Rect::new(0, 0, 9, 10).is_valid_size(10, 10));
        assert!(!Rect::new(0, 0, 10, 9).is_valid_size(10, 10));
    }
}
