use tauri::{AppHandle, Manager, Window, WindowBuilder, WindowUrl};

/// Calculate selection bounds from start and end coordinates
/// Handles dragging in any direction (normalizes to top-left origin)
pub fn calculate_selection_bounds(
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
) -> (i32, i32, u32, u32) {
    let x = start_x.min(end_x);
    let y = start_y.min(end_y);
    let w = (start_x - end_x).abs() as u32;
    let h = (start_y - end_y).abs() as u32;

    (x, y, w, h)
}

/// Check if selection meets minimum size requirements (10x10px)
pub fn is_selection_valid(width: u32, height: u32) -> bool {
    width >= 10 && height >= 10
}

/// Clamp selection to screen bounds
/// Ensures the selection doesn't extend beyond the screen area
pub fn clamp_selection_to_bounds(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    screen_bounds: (i32, i32, u32, u32),
) -> (i32, i32, u32, u32) {
    let (screen_x, screen_y, screen_w, screen_h) = screen_bounds;
    let screen_max_x = screen_x + screen_w as i32;
    let screen_max_y = screen_y + screen_h as i32;

    // Clamp position to screen bounds (both min and max)
    let clamped_x = x.max(screen_x).min(screen_max_x);
    let clamped_y = y.max(screen_y).min(screen_max_y);

    // Calculate maximum available width and height from clamped position
    let max_width = screen_max_x - clamped_x;
    let max_height = screen_max_y - clamped_y;

    // Clamp dimensions to available space (ensure non-negative)
    let clamped_w = (width as i32).min(max_width).max(0) as u32;
    let clamped_h = (height as i32).min(max_height).max(0) as u32;

    (clamped_x, clamped_y, clamped_w, clamped_h)
}

/// Create overlay window for screen capture
/// Returns a fullscreen transparent window spanning all monitors
pub async fn create_overlay_window(app_handle: &AppHandle) -> Result<Window, String> {
    use crate::capture::monitors::get_virtual_screen_bounds;

    let (x, y, width, height) = get_virtual_screen_bounds();

    let window = WindowBuilder::new(
        app_handle,
        "overlay",
        WindowUrl::App("overlay.html".into()),
    )
    .title("Select Area")
    .position(x as f64, y as f64)
    .inner_size(width as f64, height as f64)
    .fullscreen(true)
    // Note: transparent() requires specific Tauri configuration
    // Will be configured via tauri.conf.json instead
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(window)
}

/// Close the overlay window
pub async fn close_overlay_window(app_handle: &AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
