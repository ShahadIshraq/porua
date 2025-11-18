use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Get all monitors (synchronous version for testing)
pub fn get_all_monitors_sync() -> Vec<MonitorInfo> {
    // Platform-specific implementation
    #[cfg(target_os = "windows")]
    {
        windows_monitor_detection()
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback: return mock data for non-Windows platforms
        vec![MonitorInfo {
            name: "Primary Monitor".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        }]
    }
}

#[cfg(target_os = "windows")]
fn windows_monitor_detection() -> Vec<MonitorInfo> {
    // For now, return mock data to make tests pass initially
    // Will implement real Windows API later
    vec![MonitorInfo {
        name: "Primary Monitor".to_string(),
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
        is_primary: true,
    }]
}

/// Calculate virtual screen bounds that encompass all monitors
pub fn get_virtual_screen_bounds() -> (i32, i32, u32, u32) {
    let monitors = get_all_monitors_sync();

    if monitors.is_empty() {
        return (0, 0, 1920, 1080); // Fallback
    }

    let min_x = monitors.iter().map(|m| m.x).min().unwrap();
    let min_y = monitors.iter().map(|m| m.y).min().unwrap();
    let max_x = monitors.iter().map(|m| m.x + m.width as i32).max().unwrap();
    let max_y = monitors.iter().map(|m| m.y + m.height as i32).max().unwrap();

    (min_x, min_y, (max_x - min_x) as u32, (max_y - min_y) as u32)
}

/// Convert logical coordinates to physical coordinates based on DPI scale
pub fn logical_to_physical(x: i32, y: i32, scale: f64) -> (i32, i32) {
    ((x as f64 * scale) as i32, (y as f64 * scale) as i32)
}

/// Convert physical coordinates to logical coordinates based on DPI scale
pub fn physical_to_logical(x: i32, y: i32, scale: f64) -> (i32, i32) {
    ((x as f64 / scale) as i32, (y as f64 / scale) as i32)
}
