use crate::overlay::{CaptureManager, CaptureRegion, ExtractedText, OverlayManager};
use tauri::{Manager, Window};
use tracing::{error, info};

// MARK: - Permission Commands

#[tauri::command]
pub async fn overlay_check_permission() -> Result<bool, String> {
    info!("Checking screen recording permission");
    Ok(CaptureManager::check_permission())
}

#[tauri::command]
pub async fn overlay_request_permission() -> Result<bool, String> {
    info!("Requesting screen recording permission");
    Ok(CaptureManager::request_permission())
}

// MARK: - Display Commands

#[tauri::command]
pub async fn overlay_get_displays() -> Result<String, String> {
    info!("Getting display information");
    match CaptureManager::get_displays() {
        Ok(displays) => {
            let json = serde_json::to_string(&displays).map_err(|e| e.to_string())?;
            Ok(json)
        }
        Err(e) => {
            error!("Failed to get displays: {}", e);
            Err(e.to_string())
        }
    }
}

// MARK: - Selection Window Commands

#[tauri::command]
pub async fn overlay_open_selection(app_handle: tauri::AppHandle) -> Result<(), String> {
    info!("Opening selection window");

    // Check if window already exists
    if let Some(window) = app_handle.get_window("selection") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create new selection window
    let window = tauri::WindowBuilder::new(
        &app_handle,
        "selection",
        tauri::WindowUrl::App("selection.html".into()),
    )
    .title("Select Region")
    .fullscreen(true)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn overlay_close_selection(app_handle: tauri::AppHandle) -> Result<(), String> {
    info!("Closing selection window");

    if let Some(window) = app_handle.get_window("selection") {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// MARK: - Capture Commands

#[tauri::command]
pub async fn overlay_capture_region(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<String, String> {
    info!("Capturing region: x={}, y={}, w={}, h={}", x, y, width, height);

    let region = CaptureRegion {
        x,
        y,
        width,
        height,
    };

    match CaptureManager::capture_region(&region) {
        Ok(image_data) => {
            info!("Capture successful, image size: {} bytes", image_data.len());
            Ok(image_data)
        }
        Err(e) => {
            error!("Capture failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn overlay_extract_text(base64_image: String) -> Result<ExtractedText, String> {
    info!("Extracting text from image");

    match CaptureManager::extract_text(&base64_image) {
        Ok(extracted) => {
            info!(
                "OCR successful: {} chars, {} regions, {:.2}% confidence",
                extracted.full_text.len(),
                extracted.regions.len(),
                extracted.overall_confidence * 100.0
            );
            Ok(extracted)
        }
        Err(e) => {
            error!("OCR failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn overlay_capture_and_extract(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<ExtractedText, String> {
    info!("Capturing and extracting text from region");

    let region = CaptureRegion {
        x,
        y,
        width,
        height,
    };

    match CaptureManager::capture_and_extract(&region) {
        Ok(extracted) => {
            info!(
                "Capture and OCR successful: {} chars, {} regions",
                extracted.full_text.len(),
                extracted.regions.len()
            );
            Ok(extracted)
        }
        Err(e) => {
            error!("Capture and OCR failed: {}", e);
            Err(e.to_string())
        }
    }
}

// MARK: - Overlay Window Commands

#[tauri::command]
pub async fn overlay_open_reader(
    app_handle: tauri::AppHandle,
    x: i32,
    y: i32,
) -> Result<(), String> {
    info!("Opening reader overlay at x={}, y={}", x, y);

    // Check if window already exists
    if let Some(window) = app_handle.get_window("overlay") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create new overlay window
    let window = tauri::WindowBuilder::new(
        &app_handle,
        "overlay",
        tauri::WindowUrl::App("overlay.html".into()),
    )
    .title("Porua Reader")
    .inner_size(600.0, 400.0)
    .position(x as f64, y as f64)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn overlay_close_reader(app_handle: tauri::AppHandle) -> Result<(), String> {
    info!("Closing reader overlay");

    if let Some(window) = app_handle.get_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// MARK: - State Commands

#[tauri::command]
pub async fn overlay_get_state(
    state: tauri::State<'_, OverlayManager>,
) -> Result<String, String> {
    let current_state = state.get_state().await;
    serde_json::to_string(&current_state).map_err(|e| e.to_string())
}

// MARK: - Validation/Test Commands

#[tauri::command]
pub async fn overlay_run_validation() -> Result<String, String> {
    info!("Running overlay validation tests");

    let mut results = Vec::new();

    // Test 1: Permission check
    let has_permission = CaptureManager::check_permission();
    results.push(format!("✓ Permission check: {}", has_permission));

    // Test 2: Get displays
    match CaptureManager::get_displays() {
        Ok(displays) => {
            results.push(format!("✓ Found {} display(s)", displays.len()));
            for display in displays {
                results.push(format!(
                    "  - Display {}: {}x{}",
                    display.id, display.width, display.height
                ));
            }
        }
        Err(e) => {
            results.push(format!("✗ Failed to get displays: {}", e));
        }
    }

    // Test 3: Small test capture (100x100 from top-left corner)
    if has_permission {
        let test_region = CaptureRegion {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        match CaptureManager::capture_region(&test_region) {
            Ok(image_data) => {
                results.push(format!(
                    "✓ Test capture successful ({} bytes)",
                    image_data.len()
                ));

                // Test 4: OCR on test capture
                match CaptureManager::extract_text(&image_data) {
                    Ok(extracted) => {
                        results.push(format!(
                            "✓ OCR successful: {} chars, {:.1}% confidence",
                            extracted.full_text.len(),
                            extracted.overall_confidence * 100.0
                        ));
                        if !extracted.full_text.is_empty() {
                            results.push(format!(
                                "  Text preview: \"{}\"",
                                extracted.full_text.chars().take(50).collect::<String>()
                            ));
                        }
                    }
                    Err(e) => {
                        results.push(format!("✗ OCR failed: {}", e));
                    }
                }
            }
            Err(e) => {
                results.push(format!("✗ Test capture failed: {}", e));
            }
        }
    } else {
        results.push("⚠ Skipping capture tests (no permission)".to_string());
    }

    Ok(results.join("\n"))
}
