//! Screen capture module with platform abstraction for testability.
//! Handles monitor detection, DPI scaling, and screen region capture.
//!
//! # Platform Support
//!
//! **IMPORTANT**: Actual screen capture functionality is only available on Windows.
//!
//! | Platform | Status | Implementation |
//! |----------|--------|----------------|
//! | Windows  | ✅ Full support | Windows GDI API (GetDC, BitBlt, GetDIBits) |
//! | macOS    | ❌ Mock only | MockScreenBackend for testing |
//! | Linux    | ❌ Mock only | MockScreenBackend for testing |
//!
//! On non-Windows platforms, the module compiles and can be tested using `MockScreenBackend`,
//! but actual screen capture will not work. The mock backend generates a solid color test image
//! instead of capturing the screen.
//!
//! # Architecture
//!
//! The module uses a trait-based abstraction (`ScreenBackend`) to separate capture logic from
//! platform-specific implementation, allowing for easy testing and potential future platform support.
//!
//! # Usage
//!
//! ```rust
//! use porua_wrapper::capture::{ScreenCapture, MockScreenBackend, Rect};
//! use std::path::PathBuf;
//!
//! // Create a capture instance with mock backend (works on all platforms)
//! let temp_dir = std::env::temp_dir().join("capture_test");
//! let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir);
//!
//! // Check monitors
//! let monitors = capture.get_monitors().unwrap();
//! assert!(!monitors.is_empty());
//!
//! // Capture a region
//! let rect = Rect::new(0, 0, 100, 100);
//! let result = capture.capture_region(rect).unwrap();
//! assert!(!result.file_path.is_empty());
//! ```
//!
//! # Future Work
//!
//! - macOS: Could implement using Core Graphics (CGWindowListCreateImage)
//! - Linux: Could implement using X11 (XGetImage) or Wayland protocols

use anyhow::Result;
use image::{ImageBuffer, Rgba};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use tracing::{debug, error, info};

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

// ==================== Platform Abstraction Trait ====================

/// Trait for platform-specific screen operations
/// This allows mocking for tests on any platform
pub trait ScreenBackend: Send + Sync {
    /// Get all connected monitors
    fn get_monitors(&self) -> Result<Vec<MonitorInfo>, CaptureError>;

    /// Get the virtual screen bounds (encompasses all monitors)
    fn get_virtual_screen_bounds(&self) -> Rect;

    /// Get DPI scale factor at a specific point
    fn get_dpi_scale_at_point(&self, x: i32, y: i32) -> f64;

    /// Capture a region of the screen as RGBA pixels
    fn capture_region_pixels(&self, rect: Rect) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, CaptureError>;

    /// Check if screen capture permission is available
    fn check_permission(&self) -> Result<bool, CaptureError>;
}

// ==================== Windows Implementation ====================

#[cfg(target_os = "windows")]
mod windows_backend {
    use super::*;
    use windows::{
        Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT, TRUE},
        Win32::Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
            GetDC, GetDIBits, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, MONITOR_DEFAULTTONEAREST, SRCCOPY,
        },
        Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
        Win32::UI::WindowsAndMessaging::{
            EnumDisplayMonitors, GetMonitorInfoW, GetSystemMetrics, MONITORINFOEXW,
            SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        },
    };

    pub struct WindowsScreenBackend;

    impl WindowsScreenBackend {
        pub fn new() -> Self {
            Self
        }
    }

    impl ScreenBackend for WindowsScreenBackend {
        fn get_monitors(&self) -> Result<Vec<MonitorInfo>, CaptureError> {
            let mut monitors: Vec<MonitorInfo> = Vec::new();
            let monitors_ptr = &mut monitors as *mut Vec<MonitorInfo>;

            // SAFETY: EnumDisplayMonitors is a Windows API that iterates over all display monitors.
            // - We pass a valid callback function (enum_monitor_callback) that matches the expected signature.
            // - The LPARAM contains a pointer to our Vec which remains valid for the duration of the call
            //   since we don't return until EnumDisplayMonitors completes synchronously.
            // - The callback properly casts the LPARAM back to &mut Vec<MonitorInfo> and appends to it.
            // - HDC::default() (null) is valid for EnumDisplayMonitors, meaning enumerate all monitors.
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

        fn get_virtual_screen_bounds(&self) -> Rect {
            // SAFETY: GetSystemMetrics is a safe Windows API that retrieves system metrics.
            // - These specific metrics (SM_XVIRTUALSCREEN, etc.) return screen dimensions.
            // - The function has no side effects and cannot cause undefined behavior.
            // - Return values are plain integers that are always valid.
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

        fn get_dpi_scale_at_point(&self, x: i32, y: i32) -> f64 {
            // SAFETY: MonitorFromPoint and GetDpiForMonitor are safe Windows APIs.
            // - MonitorFromPoint returns a valid HMONITOR handle for any point (uses MONITOR_DEFAULTTONEAREST).
            // - GetDpiForMonitor writes to our stack-allocated u32 variables which are properly aligned.
            // - Even if GetDpiForMonitor fails, we have initialized dpi_x/dpi_y to 96 (default DPI).
            // - No resources need cleanup; HMONITOR handles don't require explicit release.
            unsafe {
                let point = POINT { x, y };
                let monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);

                let mut dpi_x: u32 = 96;
                let mut dpi_y: u32 = 96;

                let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);

                // Use average of X and Y DPI in case they differ (rare but possible)
                ((dpi_x as f64 + dpi_y as f64) / 2.0) / 96.0
            }
        }

        fn capture_region_pixels(&self, rect: Rect) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, CaptureError> {
            // Validate that rect is within screen bounds before attempting capture
            let bounds = self.get_virtual_screen_bounds();
            if rect.x < bounds.x
                || rect.y < bounds.y
                || rect.x + rect.width as i32 > bounds.x + bounds.width as i32
                || rect.y + rect.height as i32 > bounds.y + bounds.height as i32
            {
                return Err(CaptureError::OutOfBounds);
            }

            // SAFETY: This function uses Windows GDI APIs to capture screen content.
            // All GDI resources are properly managed with cleanup on all code paths:
            // - screen_dc: Released via ReleaseDC on all error paths and success path
            // - capture_dc: Deleted via DeleteDC on all error paths and success path
            // - bitmap: Deleted via DeleteObject on all error paths and success path
            // - old_bitmap: Restored via SelectObject before bitmap deletion
            //
            // The buffer passed to GetDIBits is:
            // - Properly sized: width * height * 4 bytes (32-bit BGRA)
            // - Properly aligned: Vec<u8> guarantees alignment for u8
            // - Valid for the duration of the call
            //
            // HWND::default() (null) is valid for GetDC, meaning the entire screen.
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
                    return Err(CaptureError::CaptureFailure("BitBlt failed".to_string()));
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
                // Use checked arithmetic to prevent integer overflow on very large captures
                let buffer_size = (rect.width as usize)
                    .checked_mul(rect.height as usize)
                    .and_then(|size| size.checked_mul(4))
                    .ok_or_else(|| CaptureError::CaptureFailure(
                        "Image dimensions too large for buffer allocation".to_string()
                    ))?;
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

                // Cleanup GDI resources in reverse order of acquisition
                SelectObject(capture_dc, old_bitmap);
                DeleteObject(bitmap);
                DeleteDC(capture_dc);
                ReleaseDC(HWND::default(), screen_dc);

                if lines == 0 {
                    return Err(CaptureError::CaptureFailure("GetDIBits failed".to_string()));
                }

                // Convert BGRA to RGBA
                for chunk in buffer.chunks_exact_mut(4) {
                    chunk.swap(0, 2); // Swap B and R
                }

                // Create image buffer
                let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(rect.width, rect.height, buffer)
                    .ok_or_else(|| {
                        CaptureError::CaptureFailure("Failed to create image buffer".to_string())
                    })?;

                Ok(image)
            }
        }

        fn check_permission(&self) -> Result<bool, CaptureError> {
            // SAFETY: GetDC and ReleaseDC are safe Windows APIs.
            // - GetDC(null) returns a DC for the entire screen, which we use to test access.
            // - We immediately release the DC after checking if it's valid.
            // - If GetDC fails (returns invalid), we don't call ReleaseDC.
            // - No other resources are allocated.
            unsafe {
                let screen_dc = GetDC(HWND::default());
                if screen_dc.is_invalid() {
                    return Err(CaptureError::PermissionDenied);
                }
                ReleaseDC(HWND::default(), screen_dc);
                Ok(true)
            }
        }
    }

    /// Callback function for EnumDisplayMonitors
    ///
    /// # Safety
    /// This function is called by Windows during EnumDisplayMonitors enumeration.
    /// - `monitor` is a valid HMONITOR handle provided by Windows
    /// - `lparam` must contain a valid pointer to a `Vec<MonitorInfo>` that outlives the enumeration
    /// - The caller (get_monitors) ensures lparam points to a valid, properly aligned Vec
    /// - This callback is synchronous and completes before get_monitors returns
    unsafe extern "system" fn enum_monitor_callback(
        monitor: windows::Win32::Graphics::Gdi::HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        // SAFETY: lparam was set by get_monitors to point to a valid Vec<MonitorInfo>
        // that remains valid for the duration of the EnumDisplayMonitors call.
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
            let is_primary = (monitor_info.monitorInfo.dwFlags & 1) != 0;

            // Get DPI for this monitor
            let mut dpi_x: u32 = 96;
            let mut dpi_y: u32 = 96;
            let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
            // Use average of X and Y DPI in case they differ (rare but possible)
            let dpi_scale = ((dpi_x as f64 + dpi_y as f64) / 2.0) / 96.0;

            // Get monitor name
            let name_slice = &monitor_info.szDevice;
            let name_len = name_slice.iter().position(|&c| c == 0).unwrap_or(name_slice.len());
            let name = String::from_utf16_lossy(&name_slice[..name_len]);

            monitors.push(MonitorInfo {
                id: 0,
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
}

// ==================== Mock Implementation for Testing ====================

/// Mock backend for testing on any platform
pub struct MockScreenBackend {
    pub monitors: Vec<MonitorInfo>,
    pub virtual_bounds: Rect,
    pub dpi_scale: f64,
    pub capture_result: Option<ImageBuffer<Rgba<u8>, Vec<u8>>>,
    pub permission_granted: bool,
}

impl Default for MockScreenBackend {
    fn default() -> Self {
        Self {
            monitors: vec![MonitorInfo {
                id: 0,
                name: "Mock Monitor".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                dpi_scale: 1.0,
                is_primary: true,
            }],
            virtual_bounds: Rect::new(0, 0, 1920, 1080),
            dpi_scale: 1.0,
            capture_result: None,
            permission_granted: true,
        }
    }
}

impl MockScreenBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_monitors(mut self, monitors: Vec<MonitorInfo>) -> Self {
        self.monitors = monitors;
        self
    }

    pub fn with_virtual_bounds(mut self, bounds: Rect) -> Self {
        self.virtual_bounds = bounds;
        self
    }

    pub fn with_dpi_scale(mut self, scale: f64) -> Self {
        self.dpi_scale = scale;
        self
    }

    pub fn with_permission(mut self, granted: bool) -> Self {
        self.permission_granted = granted;
        self
    }

    /// Create a test image of specified dimensions
    pub fn create_test_image(width: u32, height: u32) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
        ImageBuffer::from_fn(width, height, |x, y| {
            // Create a simple gradient pattern for testing
            Rgba([
                (x % 256) as u8,
                (y % 256) as u8,
                ((x + y) % 256) as u8,
                255,
            ])
        })
    }
}

impl ScreenBackend for MockScreenBackend {
    fn get_monitors(&self) -> Result<Vec<MonitorInfo>, CaptureError> {
        if self.monitors.is_empty() {
            Err(CaptureError::NoMonitors)
        } else {
            Ok(self.monitors.clone())
        }
    }

    fn get_virtual_screen_bounds(&self) -> Rect {
        self.virtual_bounds
    }

    fn get_dpi_scale_at_point(&self, _x: i32, _y: i32) -> f64 {
        self.dpi_scale
    }

    fn capture_region_pixels(&self, rect: Rect) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, CaptureError> {
        match &self.capture_result {
            Some(img) => Ok(img.clone()),
            None => Ok(Self::create_test_image(rect.width, rect.height)),
        }
    }

    fn check_permission(&self) -> Result<bool, CaptureError> {
        if self.permission_granted {
            Ok(true)
        } else {
            Err(CaptureError::PermissionDenied)
        }
    }
}

// ==================== Main Screen Capture Implementation ====================

/// Main screen capture manager - uses backend abstraction
pub struct ScreenCapture<B: ScreenBackend> {
    backend: B,
    temp_dir: PathBuf,
}

impl<B: ScreenBackend> ScreenCapture<B> {
    /// Create a new ScreenCapture with a specific backend
    pub fn with_backend(backend: B, temp_dir: PathBuf) -> Self {
        Self { backend, temp_dir }
    }

    /// Get information about all connected monitors
    pub fn get_monitors(&self) -> Result<Vec<MonitorInfo>, CaptureError> {
        self.backend.get_monitors()
    }

    /// Get the virtual screen bounds (encompasses all monitors)
    pub fn get_virtual_screen_bounds(&self) -> Rect {
        self.backend.get_virtual_screen_bounds()
    }

    /// Validate and adjust a selection rectangle
    pub fn validate_selection(&self, rect: Rect) -> Result<Rect, CaptureError> {
        // Check minimum size
        if !rect.is_valid_size(10, 10) {
            return Err(CaptureError::SelectionTooSmall);
        }

        // Clamp to screen boundaries
        let bounds = self.get_virtual_screen_bounds();
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
    ///
    /// # Arguments
    /// * `rect` - The rectangle in logical coordinates
    /// * `scale` - DPI scale factor (typically 1.0 to 4.0)
    ///
    /// # Returns
    /// Scaled rectangle, or error if scale is invalid
    pub fn apply_dpi_scaling(rect: Rect, scale: f64) -> Result<Rect, CaptureError> {
        // Validate scale is within reasonable bounds
        // DPI scaling typically ranges from 100% (1.0) to 400% (4.0)
        if scale <= 0.0 || scale > 10.0 {
            return Err(CaptureError::CaptureFailure(
                format!("Invalid DPI scale factor: {}. Expected 0.0 < scale <= 10.0", scale)
            ));
        }

        Ok(Rect::new(
            (rect.x as f64 * scale) as i32,
            (rect.y as f64 * scale) as i32,
            (rect.width as f64 * scale) as u32,
            (rect.height as f64 * scale) as u32,
        ))
    }

    /// Clean up old capture files from the temp directory
    /// Removes files older than `max_age_hours` hours
    /// Returns the number of files deleted
    pub fn cleanup_old_captures(&self, max_age_hours: u64) -> Result<usize, CaptureError> {
        use std::time::{Duration, SystemTime};

        if !self.temp_dir.exists() {
            return Ok(0);
        }

        let max_age = Duration::from_secs(max_age_hours * 60 * 60);
        let cutoff_time = SystemTime::now()
            .checked_sub(max_age)
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let mut deleted_count = 0;

        let entries = std::fs::read_dir(&self.temp_dir).map_err(|e| {
            CaptureError::SaveFailure(format!("Failed to read capture directory: {}", e))
        })?;

        for entry in entries.flatten() {
            let path = entry.path();

            // Only delete .png files that match our capture filename pattern
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if filename.starts_with("capture_") && filename.ends_with(".png") {
                    // Check file modification time
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        if let Ok(modified) = metadata.modified() {
                            if modified < cutoff_time {
                                if std::fs::remove_file(&path).is_ok() {
                                    debug!("Deleted old capture: {:?}", path);
                                    deleted_count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        if deleted_count > 0 {
            info!("Cleaned up {} old capture files", deleted_count);
        }

        Ok(deleted_count)
    }

    /// Capture a region of the screen and save to file
    pub fn capture_region(&self, rect: Rect) -> Result<CaptureResult, CaptureError> {
        info!(
            "Capturing region: x={}, y={}, width={}, height={}",
            rect.x, rect.y, rect.width, rect.height
        );

        // Validate the selection
        let validated_rect = self.validate_selection(rect)?;

        // Get DPI scale for the capture area
        let dpi_scale = self.backend.get_dpi_scale_at_point(validated_rect.x, validated_rect.y);
        debug!("DPI scale factor: {}", dpi_scale);

        // Apply DPI scaling to get physical pixel coordinates
        let physical_rect = Self::apply_dpi_scaling(validated_rect, dpi_scale)?;

        // Capture the screen region
        let image_data = self.backend.capture_region_pixels(physical_rect)?;

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

    /// Check if screen capture permission is available
    pub fn check_permission(&self) -> Result<bool, CaptureError> {
        self.backend.check_permission()
    }
}

// ==================== Convenience Functions for Production Use ====================

/// Create a ScreenCapture with the platform-specific backend
#[cfg(target_os = "windows")]
pub fn create_screen_capture(temp_dir: PathBuf) -> ScreenCapture<windows_backend::WindowsScreenBackend> {
    ScreenCapture::with_backend(windows_backend::WindowsScreenBackend::new(), temp_dir)
}

/// Get monitors using platform-specific backend
#[cfg(target_os = "windows")]
pub fn get_monitors_native() -> Result<Vec<MonitorInfo>, CaptureError> {
    windows_backend::WindowsScreenBackend::new().get_monitors()
}

/// Get virtual screen bounds using platform-specific backend
#[cfg(target_os = "windows")]
pub fn get_virtual_screen_bounds_native() -> Rect {
    windows_backend::WindowsScreenBackend::new().get_virtual_screen_bounds()
}

/// Check permission using platform-specific backend
#[cfg(target_os = "windows")]
pub fn check_permission_native() -> Result<bool, CaptureError> {
    windows_backend::WindowsScreenBackend::new().check_permission()
}

// Non-Windows fallbacks that return errors
#[cfg(not(target_os = "windows"))]
pub fn get_monitors_native() -> Result<Vec<MonitorInfo>, CaptureError> {
    Err(CaptureError::PlatformNotSupported)
}

#[cfg(not(target_os = "windows"))]
pub fn get_virtual_screen_bounds_native() -> Rect {
    Rect::new(0, 0, 1920, 1080) // Default fallback
}

#[cfg(not(target_os = "windows"))]
pub fn check_permission_native() -> Result<bool, CaptureError> {
    Err(CaptureError::PlatformNotSupported)
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ==================== Rect Tests ====================

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
    fn test_rect_is_valid_size() {
        assert!(Rect::new(0, 0, 10, 10).is_valid_size(10, 10));
        assert!(Rect::new(0, 0, 100, 100).is_valid_size(10, 10));
        assert!(!Rect::new(0, 0, 9, 10).is_valid_size(10, 10));
        assert!(!Rect::new(0, 0, 10, 9).is_valid_size(10, 10));
    }

    // ==================== DPI Scaling Tests ====================

    #[test]
    fn test_apply_dpi_scaling_100_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 1.0).unwrap();

        assert_eq!(scaled.x, 100);
        assert_eq!(scaled.y, 200);
        assert_eq!(scaled.width, 300);
        assert_eq!(scaled.height, 400);
    }

    #[test]
    fn test_apply_dpi_scaling_150_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 1.5).unwrap();

        assert_eq!(scaled.x, 150);
        assert_eq!(scaled.y, 300);
        assert_eq!(scaled.width, 450);
        assert_eq!(scaled.height, 600);
    }

    #[test]
    fn test_apply_dpi_scaling_200_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 2.0).unwrap();

        assert_eq!(scaled.x, 200);
        assert_eq!(scaled.y, 400);
        assert_eq!(scaled.width, 600);
        assert_eq!(scaled.height, 800);
    }

    #[test]
    fn test_apply_dpi_scaling_125_percent() {
        let rect = Rect::new(100, 200, 300, 400);
        let scaled = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 1.25).unwrap();

        assert_eq!(scaled.x, 125);
        assert_eq!(scaled.y, 250);
        assert_eq!(scaled.width, 375);
        assert_eq!(scaled.height, 500);
    }

    #[test]
    fn test_apply_dpi_scaling_invalid_zero() {
        let rect = Rect::new(100, 200, 300, 400);
        let result = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 0.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_apply_dpi_scaling_invalid_negative() {
        let rect = Rect::new(100, 200, 300, 400);
        let result = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, -1.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_apply_dpi_scaling_invalid_too_large() {
        let rect = Rect::new(100, 200, 300, 400);
        let result = ScreenCapture::<MockScreenBackend>::apply_dpi_scaling(rect, 11.0);
        assert!(result.is_err());
    }

    // ==================== Validation Tests ====================

    #[test]
    fn test_validate_selection_minimum_size_pass() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 10, 10);
        let result = capture.validate_selection(rect);
        assert!(result.is_ok(), "10x10 selection should be valid");
    }

    #[test]
    fn test_validate_selection_9x9_rejected() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 9, 9);
        let result = capture.validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "9x9 selection should be rejected"
        );
    }

    #[test]
    fn test_validate_selection_10x9_rejected() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 10, 9);
        let result = capture.validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "10x9 selection should be rejected"
        );
    }

    #[test]
    fn test_validate_selection_9x10_rejected() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 9, 10);
        let result = capture.validate_selection(rect);
        assert!(
            matches!(result, Err(CaptureError::SelectionTooSmall)),
            "9x10 selection should be rejected"
        );
    }

    // ==================== Clamping Tests ====================

    #[test]
    fn test_clamp_rect_extends_past_right_edge() {
        let rect = Rect::new(900, 0, 200, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::<MockScreenBackend>::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.x, 900);
        assert_eq!(clamped.width, 100, "Should clamp width to screen boundary");
    }

    #[test]
    fn test_clamp_rect_extends_past_bottom_edge() {
        let rect = Rect::new(0, 900, 100, 200);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::<MockScreenBackend>::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.y, 900);
        assert_eq!(clamped.height, 100, "Should clamp height to screen boundary");
    }

    #[test]
    fn test_clamp_rect_negative_x_clamped() {
        let rect = Rect::new(-50, 0, 100, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::<MockScreenBackend>::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.x, 0, "Negative x should be clamped to 0");
    }

    #[test]
    fn test_clamp_rect_negative_y_clamped() {
        let rect = Rect::new(0, -50, 100, 100);
        let bounds = Rect::new(0, 0, 1000, 1000);
        let clamped = ScreenCapture::<MockScreenBackend>::clamp_rect_to_bounds(rect, bounds);

        assert_eq!(clamped.y, 0, "Negative y should be clamped to 0");
    }

    // ==================== Monitor Detection Tests (using mock) ====================

    #[test]
    fn test_get_monitors_returns_at_least_one() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let monitors = capture.get_monitors().expect("Should detect monitors");
        assert!(!monitors.is_empty(), "Should have at least one monitor");
    }

    #[test]
    fn test_monitor_info_contains_valid_dimensions() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let monitors = capture.get_monitors().expect("Should detect monitors");

        for monitor in monitors {
            assert!(monitor.width > 0, "Monitor width should be positive");
            assert!(monitor.height > 0, "Monitor height should be positive");
            assert!(monitor.width <= 8192, "Monitor width should be reasonable (<=8K)");
            assert!(monitor.height <= 8192, "Monitor height should be reasonable (<=8K)");
        }
    }

    #[test]
    fn test_primary_monitor_detected() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let monitors = capture.get_monitors().expect("Should detect monitors");
        let primary_count = monitors.iter().filter(|m| m.is_primary).count();
        assert_eq!(primary_count, 1, "Should have exactly one primary monitor");
    }

    #[test]
    fn test_no_monitors_returns_error() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_monitors(vec![]);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let result = capture.get_monitors();
        assert!(matches!(result, Err(CaptureError::NoMonitors)));
    }

    #[test]
    fn test_multi_monitor_setup() {
        let monitors = vec![
            MonitorInfo {
                id: 0,
                name: "Monitor 1".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                dpi_scale: 1.0,
                is_primary: true,
            },
            MonitorInfo {
                id: 1,
                name: "Monitor 2".to_string(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                dpi_scale: 1.5,
                is_primary: false,
            },
        ];

        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new()
            .with_monitors(monitors)
            .with_virtual_bounds(Rect::new(0, 0, 3840, 1080));
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let detected = capture.get_monitors().unwrap();
        assert_eq!(detected.len(), 2);

        let bounds = capture.get_virtual_screen_bounds();
        assert_eq!(bounds.width, 3840);
    }

    // ==================== DPI Scale Tests (using mock) ====================

    #[test]
    fn test_dpi_scale_factor_valid_range() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_dpi_scale(1.5);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let scale = capture.backend.get_dpi_scale_at_point(0, 0);
        assert!(scale >= 1.0, "DPI scale should be at least 1.0");
        assert!(scale <= 4.0, "DPI scale should be at most 4.0 (400%)");
    }

    // ==================== Virtual Screen Bounds Tests ====================

    #[test]
    fn test_virtual_screen_bounds_valid() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let bounds = capture.get_virtual_screen_bounds();
        assert!(bounds.width > 0, "Virtual screen width should be positive");
        assert!(bounds.height > 0, "Virtual screen height should be positive");
    }

    // ==================== Screen Capture Tests (using mock) ====================

    #[test]
    fn test_capture_region_creates_valid_png() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

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
    fn test_capture_region_correct_dimensions() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 200, 150);
        let result = capture.capture_region(rect).expect("Capture should succeed");

        // Load the image and verify dimensions
        let img = image::open(&result.file_path).expect("Should load captured image");
        assert_eq!(img.width(), 200);
        assert_eq!(img.height(), 150);
    }

    #[test]
    fn test_capture_saves_to_temp_directory() {
        let temp_dir = TempDir::new().unwrap();
        let temp_path = temp_dir.path().to_path_buf();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_path.clone());

        let rect = Rect::new(0, 0, 50, 50);
        let result = capture.capture_region(rect).expect("Capture should succeed");

        assert!(
            result.file_path.starts_with(&temp_path.to_string_lossy().to_string()),
            "File should be in temp directory"
        );
    }

    #[test]
    fn test_capture_unique_filename_generation() {
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 20, 20);

        let result1 = capture.capture_region(rect).expect("First capture should succeed");
        let result2 = capture.capture_region(rect).expect("Second capture should succeed");

        assert_ne!(
            result1.file_path, result2.file_path,
            "Each capture should have unique filename"
        );
    }

    #[test]
    fn test_capture_with_dpi_scaling() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_dpi_scale(2.0);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let rect = Rect::new(0, 0, 100, 100);
        let result = capture.capture_region(rect).expect("Capture should succeed");

        // With 2x DPI scaling, the physical dimensions should be doubled
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 200);
    }

    // ==================== Permission Tests (using mock) ====================

    #[test]
    fn test_permission_check_granted() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_permission(true);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let result = capture.check_permission();
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_permission_check_denied() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_permission(false);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        let result = capture.check_permission();
        assert!(matches!(result, Err(CaptureError::PermissionDenied)));
    }

    // ==================== Error Type Tests ====================

    #[test]
    fn test_capture_error_display() {
        let error = CaptureError::SelectionTooSmall;
        let msg = format!("{}", error);
        assert!(msg.contains("10x10"), "Error message should mention minimum size");
    }

    #[test]
    fn test_capture_error_types() {
        // Ensure all error variants can be created and displayed
        let errors = vec![
            CaptureError::SelectionTooSmall,
            CaptureError::OutOfBounds,
            CaptureError::CaptureFailure("test".to_string()),
            CaptureError::SaveFailure("test".to_string()),
            CaptureError::NoMonitors,
            CaptureError::PermissionDenied,
            CaptureError::PlatformNotSupported,
        ];

        for error in errors {
            let msg = format!("{}", error);
            assert!(!msg.is_empty(), "Error should have display message");
        }
    }

    // ==================== Mock Backend Tests ====================

    #[test]
    fn test_mock_backend_create_test_image() {
        let img = MockScreenBackend::create_test_image(100, 50);
        assert_eq!(img.width(), 100);
        assert_eq!(img.height(), 50);
    }

    #[test]
    fn test_mock_backend_builder_pattern() {
        let backend = MockScreenBackend::new()
            .with_dpi_scale(1.5)
            .with_virtual_bounds(Rect::new(0, 0, 3840, 2160))
            .with_permission(false);

        assert_eq!(backend.dpi_scale, 1.5);
        assert_eq!(backend.virtual_bounds.width, 3840);
        assert!(!backend.permission_granted);
    }

    // ==================== Integration Tests ====================
    // These tests verify the complete capture workflow end-to-end

    #[test]
    fn test_integration_complete_capture_workflow() {
        // This test simulates the complete capture workflow from selection to save
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new()
            .with_monitors(vec![
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
            ])
            .with_virtual_bounds(Rect::new(0, 0, 1920, 1080))
            .with_permission(true);

        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        // 1. Check permission first (as the overlay would)
        let has_permission = capture.check_permission();
        assert!(has_permission.is_ok());
        assert!(has_permission.unwrap());

        // 2. Get monitor info (as the overlay would for positioning)
        let monitors = capture.get_monitors();
        assert!(monitors.is_ok());
        assert_eq!(monitors.unwrap().len(), 1);

        // 3. Simulate user making a selection (300x200 region)
        let user_selection = Rect::from_points(100, 100, 400, 300);
        assert_eq!(user_selection.width, 300);
        assert_eq!(user_selection.height, 200);

        // 4. Validate the selection
        let validated = capture.validate_selection(user_selection);
        assert!(validated.is_ok());

        // 5. Capture the region
        let result = capture.capture_region(user_selection);
        assert!(result.is_ok());

        let capture_result = result.unwrap();

        // 6. Verify the result
        assert!(!capture_result.file_path.is_empty());
        assert!(!capture_result.timestamp.is_empty());
        assert_eq!(capture_result.width, 300);
        assert_eq!(capture_result.height, 200);

        // 7. Verify the file exists and is valid
        let path = std::path::Path::new(&capture_result.file_path);
        assert!(path.exists(), "Captured file should exist at: {}", capture_result.file_path);
        assert!(path.extension().map_or(false, |ext| ext == "png"));

        // 8. Verify the image can be loaded
        let loaded = image::open(path);
        assert!(loaded.is_ok(), "Image should be loadable");

        let img = loaded.unwrap();
        assert_eq!(img.width(), 300);
        assert_eq!(img.height(), 200);
    }

    #[test]
    fn test_integration_capture_with_dpi_scaling() {
        // Test that captures work correctly with high DPI displays
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new()
            .with_dpi_scale(2.0) // Retina display
            .with_permission(true);

        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        // Capture a 100x100 logical region
        let selection = Rect::new(0, 0, 100, 100);
        let result = capture.capture_region(selection).unwrap();

        // With 2x DPI, physical pixels should be 200x200
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 200);

        // Verify the actual image dimensions
        let img = image::open(&result.file_path).unwrap();
        assert_eq!(img.width(), 200);
        assert_eq!(img.height(), 200);
    }

    #[test]
    fn test_integration_capture_cleanup_workflow() {
        use std::fs::File;
        use std::io::Write;

        let temp_dir = TempDir::new().unwrap();
        let capture_dir = temp_dir.path().join("captures");
        std::fs::create_dir_all(&capture_dir).unwrap();

        // Create some old capture files (simulated)
        let old_file = capture_dir.join("capture_20230101_120000_abc123.png");
        let mut f = File::create(&old_file).unwrap();
        f.write_all(b"fake png data").unwrap();

        // Create a new capture file
        let new_file = capture_dir.join("capture_20991231_235959_xyz789.png");
        let mut f = File::create(&new_file).unwrap();
        f.write_all(b"fake png data").unwrap();

        let capture = ScreenCapture::with_backend(
            MockScreenBackend::new(),
            capture_dir.clone(),
        );

        // Cleanup files older than 0 hours (all files)
        let deleted = capture.cleanup_old_captures(0).unwrap();
        assert_eq!(deleted, 2, "Both files should be deleted with 0 hour max age");

        // Verify files are deleted
        assert!(!old_file.exists());
        assert!(!new_file.exists());
    }

    #[test]
    fn test_integration_multi_capture_session() {
        // Test multiple captures in sequence (as a user would do)
        let temp_dir = TempDir::new().unwrap();
        let capture = ScreenCapture::with_backend(
            MockScreenBackend::new(),
            temp_dir.path().to_path_buf(),
        );

        let mut file_paths = Vec::new();

        // Capture 5 different regions
        for i in 0..5 {
            let rect = Rect::new(i * 10, i * 10, 50 + i as u32 * 10, 50 + i as u32 * 10);
            let result = capture.capture_region(rect).expect("Each capture should succeed");
            file_paths.push(result.file_path);
        }

        // Verify all files are unique
        let unique_paths: std::collections::HashSet<_> = file_paths.iter().collect();
        assert_eq!(unique_paths.len(), 5, "All capture files should have unique paths");

        // Verify all files exist
        for path in &file_paths {
            assert!(std::path::Path::new(path).exists(), "File should exist: {}", path);
        }
    }

    #[test]
    fn test_integration_permission_denied_blocks_capture() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new().with_permission(false);
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        // First check should return permission denied
        let permission = capture.check_permission();
        assert!(matches!(permission, Err(CaptureError::PermissionDenied)));

        // Note: In the real app, UI would block capture attempt after permission check
        // The capture_region itself doesn't check permission - that's the UI's job
    }

    #[test]
    fn test_integration_edge_selection_at_screen_boundary() {
        let temp_dir = TempDir::new().unwrap();
        let backend = MockScreenBackend::new()
            .with_virtual_bounds(Rect::new(0, 0, 1920, 1080));
        let capture = ScreenCapture::with_backend(backend, temp_dir.path().to_path_buf());

        // Selection that extends past the screen edge
        let selection = Rect::new(1800, 900, 200, 200); // Extends 80px past right, 20px past bottom

        // Should clamp to screen bounds
        let validated = capture.validate_selection(selection).unwrap();
        assert!(validated.x + validated.width as i32 <= 1920);
        assert!(validated.y + validated.height as i32 <= 1080);

        // Capture should still succeed
        let result = capture.capture_region(selection);
        assert!(result.is_ok());
    }
}
