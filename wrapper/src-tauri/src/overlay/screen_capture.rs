use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

// FFI declarations for Swift functions
#[cfg(target_os = "macos")]
extern "C" {
    fn screen_capture_check_permission() -> bool;
    fn screen_capture_request_permission() -> bool;
    fn screen_capture_region(x: i32, y: i32, width: i32, height: i32) -> *const c_char;
    fn screen_capture_ocr(base64_image: *const c_char) -> *const c_char;
    fn screen_capture_get_displays() -> *const c_char;
    fn screen_capture_free_string(ptr: *mut c_char);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextRegion {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedText {
    pub full_text: String,
    pub regions: Vec<TextRegion>,
    pub overall_confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Display {
    pub id: u32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub struct CaptureManager;

impl CaptureManager {
    pub fn new() -> Self {
        Self
    }

    /// Check if screen recording permission is granted
    #[cfg(target_os = "macos")]
    pub fn check_permission() -> bool {
        unsafe { screen_capture_check_permission() }
    }

    /// Request screen recording permission
    /// This will show the system permission dialog if not already granted
    #[cfg(target_os = "macos")]
    pub fn request_permission() -> bool {
        unsafe { screen_capture_request_permission() }
    }

    /// Get available displays
    #[cfg(target_os = "macos")]
    pub fn get_displays() -> Result<Vec<Display>> {
        unsafe {
            let json_ptr = screen_capture_get_displays();
            if json_ptr.is_null() {
                return Err(anyhow!("Failed to get displays"));
            }

            let json_cstr = CStr::from_ptr(json_ptr);
            let json_str = json_cstr.to_str()?;

            // Check for error
            if json_str.starts_with("ERROR:") {
                let error_msg = json_str.strip_prefix("ERROR: ").unwrap_or(json_str);
                screen_capture_free_string(json_ptr as *mut c_char);
                return Err(anyhow!(error_msg.to_string()));
            }

            let displays: Vec<Display> = serde_json::from_str(json_str)?;

            screen_capture_free_string(json_ptr as *mut c_char);

            Ok(displays)
        }
    }

    /// Capture a region of the screen
    /// Returns base64-encoded PNG image data
    #[cfg(target_os = "macos")]
    pub fn capture_region(region: &CaptureRegion) -> Result<String> {
        unsafe {
            let image_ptr = screen_capture_region(region.x, region.y, region.width, region.height);

            if image_ptr.is_null() {
                return Err(anyhow!("Screen capture returned null"));
            }

            let image_cstr = CStr::from_ptr(image_ptr);
            let image_str = image_cstr.to_str()?;

            // Check for error
            if image_str.starts_with("ERROR:") {
                let error_msg = image_str.strip_prefix("ERROR: ").unwrap_or(image_str);
                screen_capture_free_string(image_ptr as *mut c_char);
                return Err(anyhow!(error_msg.to_string()));
            }

            let result = image_str.to_string();

            screen_capture_free_string(image_ptr as *mut c_char);

            Ok(result)
        }
    }

    /// Perform OCR on a base64-encoded image
    #[cfg(target_os = "macos")]
    pub fn extract_text(base64_image: &str) -> Result<ExtractedText> {
        unsafe {
            let image_cstring = CString::new(base64_image)?;
            let result_ptr = screen_capture_ocr(image_cstring.as_ptr());

            if result_ptr.is_null() {
                return Err(anyhow!("OCR returned null"));
            }

            let result_cstr = CStr::from_ptr(result_ptr);
            let result_str = result_cstr.to_str()?;

            // Check for error
            if result_str.starts_with("ERROR:") {
                let error_msg = result_str.strip_prefix("ERROR: ").unwrap_or(result_str);
                screen_capture_free_string(result_ptr as *mut c_char);
                return Err(anyhow!(error_msg.to_string()));
            }

            let extracted: ExtractedText = serde_json::from_str(result_str)?;

            screen_capture_free_string(result_ptr as *mut c_char);

            Ok(extracted)
        }
    }

    /// Convenience method: Capture and extract text in one call
    #[cfg(target_os = "macos")]
    pub fn capture_and_extract(region: &CaptureRegion) -> Result<ExtractedText> {
        let image_data = Self::capture_region(region)?;
        Self::extract_text(&image_data)
    }

    // Stub implementations for non-macOS platforms
    #[cfg(not(target_os = "macos"))]
    pub fn check_permission() -> bool {
        false
    }

    #[cfg(not(target_os = "macos"))]
    pub fn request_permission() -> bool {
        false
    }

    #[cfg(not(target_os = "macos"))]
    pub fn get_displays() -> Result<Vec<Display>> {
        Err(anyhow!("Screen capture is only supported on macOS"))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn capture_region(_region: &CaptureRegion) -> Result<String> {
        Err(anyhow!("Screen capture is only supported on macOS"))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn extract_text(_base64_image: &str) -> Result<ExtractedText> {
        Err(anyhow!("OCR is only supported on macOS"))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn capture_and_extract(_region: &CaptureRegion) -> Result<ExtractedText> {
        Err(anyhow!("Screen capture is only supported on macOS"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_check_permission() {
        // This test just ensures the FFI binding works
        let has_permission = CaptureManager::check_permission();
        println!("Has screen recording permission: {}", has_permission);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_get_displays() {
        match CaptureManager::get_displays() {
            Ok(displays) => {
                println!("Found {} display(s)", displays.len());
                for display in displays {
                    println!("  Display {}: {}x{}", display.id, display.width, display.height);
                }
            }
            Err(e) => {
                println!("Failed to get displays: {}", e);
            }
        }
    }
}
