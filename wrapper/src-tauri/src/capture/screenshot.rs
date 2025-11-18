use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use anyhow::{Result, Context};

static CAPTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generate a unique temporary file path for a capture
pub fn get_capture_temp_path() -> PathBuf {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // Add atomic counter to ensure uniqueness even in parallel tests
    let counter = CAPTURE_COUNTER.fetch_add(1, Ordering::SeqCst);

    let filename = format!("porua_capture_{}_{}.png", timestamp, counter);
    std::env::temp_dir().join(filename)
}

/// Capture a screen region and save as PNG
/// Currently uses mock implementation - will be replaced with Windows API
pub async fn capture_screen_region(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // Validate dimensions
    if width == 0 || height == 0 {
        return Err("Invalid dimensions: width and height must be positive".to_string());
    }

    // Platform-specific implementation
    #[cfg(target_os = "windows")]
    {
        windows_capture_region(x, y, width, height).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Mock implementation for testing on non-Windows platforms
        mock_capture_region(x, y, width, height).await
    }
}

/// Mock capture implementation for testing
#[allow(dead_code)]
async fn mock_capture_region(
    _x: i32,
    _y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let output_path = get_capture_temp_path();

    // Create a simple colored image for testing
    let img = image::RgbaImage::new(width, height);
    img.save(&output_path).map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

/// Windows-specific capture implementation
#[cfg(target_os = "windows")]
async fn windows_capture_region(
    _x: i32,
    _y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    // For now, use mock implementation
    // TODO: Implement real Windows screen capture using windows-capture crate
    let output_path = get_capture_temp_path();

    let img = image::RgbaImage::new(width, height);
    img.save(&output_path).map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

/// Clean up old capture files in the specified directory
pub fn cleanup_old_captures_in_dir(dir: PathBuf) -> Result<()> {
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(24 * 60 * 60);

    for entry in std::fs::read_dir(dir).context("Failed to read directory")? {
        let entry = entry.context("Failed to read entry")?;
        let path = entry.path();

        if let Some(filename) = path.file_name() {
            if filename.to_string_lossy().starts_with("porua_capture_") {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        if modified < cutoff {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Clean up old capture files from system temp directory
pub fn cleanup_old_captures() -> Result<()> {
    cleanup_old_captures_in_dir(std::env::temp_dir())
}
