#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod capture;
mod config;
mod installer;
mod paths;
mod server;

use std::sync::Arc;
use tauri::{
    CustomMenuItem, GlobalShortcutManager, Icon, Manager, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem,
};
use tokio::sync::Mutex;
use tracing::{error, info};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::capture::{
    CaptureResult, MockScreenBackend, MonitorInfo, Rect, ScreenCapture,
    get_monitors_native, get_virtual_screen_bounds_native, check_permission_native,
};
use crate::config::Config;
use crate::installer::Installer;
use crate::server::{ServerManager, ServerStatus};

#[derive(Clone)]
struct AppState {
    server_manager: Arc<Mutex<ServerManager>>,
}

#[tauri::command]
async fn needs_installation() -> Result<bool, String> {
    info!("needs_installation command called");
    match Installer::needs_installation() {
        Ok(needs) => {
            info!("needs_installation result: {}", needs);
            Ok(needs)
        }
        Err(e) => {
            error!("needs_installation error: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn start_installation(app_handle: tauri::AppHandle) -> Result<(), String> {
    let installer = Installer::new(app_handle.clone());

    tauri::async_runtime::spawn(async move {
        if let Err(e) = installer.install().await {
            error!("Installation failed: {:?}", e);
            let _ = app_handle.emit_all("install-error", e.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
async fn finish_installation(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Hide the window first
    if let Some(window) = app_handle.get_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }

    // Load configuration
    let config = Config::load().map_err(|e| e.to_string())?;
    info!("Configuration loaded: port={}", config.server.port);

    // Create server manager
    let server_manager = ServerManager::new(config);
    let state = AppState {
        server_manager: Arc::new(Mutex::new(server_manager)),
    };

    // Store state in app
    app_handle.manage(state.clone());

    // Start server automatically
    info!("Starting server automatically");
    let mut manager = state.server_manager.lock().await;
    if let Err(e) = manager.start().await {
        error!("Failed to start server: {}", e);
        return Err(e.to_string());
    }

    // Wait for server to be ready and update tray
    drop(manager); // Release lock
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let manager = state.server_manager.lock().await;
    let status = manager.get_status().await;
    drop(manager);

    update_tray_menu(&app_handle, &status);

    // Start status monitor
    start_status_monitor(app_handle.clone(), state.server_manager.clone());

    Ok(())
}

#[tauri::command]
async fn close_installer_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_log_path() -> Result<String, String> {
    paths::get_logs_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn quit_app(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Quit requested, stopping server before exit");

    // Stop the server first
    let manager = state.server_manager.clone();
    let mut mgr = manager.lock().await;
    if let Err(e) = mgr.stop().await {
        error!("Error stopping server: {}", e);
    }
    info!("Server stopped successfully");

    // Exit the app
    app_handle.exit(0);
    Ok(())
}

// ==================== Screen Capture Commands ====================

#[tauri::command]
async fn get_monitors_info() -> Result<Vec<MonitorInfo>, String> {
    info!("get_monitors_info command called");
    get_monitors_native().map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_capture_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    info!("start_capture_mode command called");

    // Hide main window if it exists
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.hide();
    }

    // Check if overlay already exists
    if app_handle.get_window("capture-overlay").is_some() {
        info!("Capture overlay already exists");
        return Ok(());
    }

    // Create the overlay window
    let overlay = tauri::WindowBuilder::new(
        &app_handle,
        "capture-overlay",
        tauri::WindowUrl::App("overlay.html".into()),
    )
    .title("Screen Capture")
    .fullscreen(true)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| format!("Failed to create overlay window: {}", e))?;

    overlay.show().map_err(|e| e.to_string())?;
    overlay.set_focus().map_err(|e| e.to_string())?;

    info!("Capture overlay window created");
    Ok(())
}

#[tauri::command]
async fn cancel_capture(app_handle: tauri::AppHandle) -> Result<(), String> {
    info!("cancel_capture command called");

    // Close overlay window
    if let Some(overlay) = app_handle.get_window("capture-overlay") {
        overlay.close().map_err(|e| e.to_string())?;
    }

    // Show main window again if it exists
    if let Some(main_window) = app_handle.get_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }

    info!("Capture cancelled");
    Ok(())
}

#[tauri::command]
async fn capture_screen_region(
    app_handle: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<CaptureResult, String> {
    info!(
        "capture_screen_region command called: x={}, y={}, width={}, height={}",
        x, y, width, height
    );

    // Get temp directory for captures
    let temp_dir = paths::get_app_data_dir()
        .map_err(|e| e.to_string())?
        .join("captures");

    // Use mock backend on non-Windows platforms, real backend on Windows
    #[cfg(target_os = "windows")]
    let capture = crate::capture::create_screen_capture(temp_dir);

    #[cfg(not(target_os = "windows"))]
    let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir);

    let rect = Rect::new(x, y, width, height);

    // Close overlay window before capturing
    if let Some(overlay) = app_handle.get_window("capture-overlay") {
        overlay.close().map_err(|e| e.to_string())?;
    }

    // Small delay to ensure overlay is fully closed
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Perform capture
    let result = capture.capture_region(rect).map_err(|e| e.to_string())?;

    info!("Screen region captured successfully: {:?}", result.file_path);
    Ok(result)
}

#[tauri::command]
async fn open_preview_window(
    app_handle: tauri::AppHandle,
    image_path: String,
    timestamp: String,
) -> Result<(), String> {
    info!("open_preview_window command called: {}", image_path);

    // Check if preview window already exists
    if let Some(existing) = app_handle.get_window("capture-preview") {
        existing.close().map_err(|e| e.to_string())?;
    }

    // Create preview window
    let preview = tauri::WindowBuilder::new(
        &app_handle,
        "capture-preview",
        tauri::WindowUrl::App("preview.html".into()),
    )
    .title(format!("Capture - {}", timestamp))
    .inner_size(800.0, 600.0)
    .min_inner_size(400.0, 300.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| format!("Failed to create preview window: {}", e))?;

    preview.show().map_err(|e| e.to_string())?;
    preview.set_focus().map_err(|e| e.to_string())?;

    // Emit the image path to the preview window
    preview
        .emit("load-image", &image_path)
        .map_err(|e| e.to_string())?;

    info!("Preview window opened");
    Ok(())
}

#[tauri::command]
async fn save_captured_image(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<String, String> {
    info!("save_captured_image command called: {}", source_path);

    use tauri::api::dialog::blocking::FileDialogBuilder;

    // Show save dialog
    let save_path = FileDialogBuilder::new()
        .add_filter("PNG Image", &["png"])
        .set_file_name("capture.png")
        .save_file();

    match save_path {
        Some(path) => {
            // Copy file to selected location
            std::fs::copy(&source_path, &path).map_err(|e| {
                error!("Failed to save image: {}", e);
                format!("Failed to save image: {}", e)
            })?;

            info!("Image saved to: {:?}", path);
            Ok(path.to_string_lossy().to_string())
        }
        None => {
            info!("Save dialog cancelled");
            Err("Save cancelled".to_string())
        }
    }
}

#[tauri::command]
async fn check_capture_permission() -> Result<bool, String> {
    info!("check_capture_permission command called");
    check_permission_native().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_virtual_screen_bounds() -> Rect {
    get_virtual_screen_bounds_native()
}

#[tauri::command]
async fn cleanup_old_captures() -> Result<usize, String> {
    info!("cleanup_old_captures command called");

    let temp_dir = paths::get_app_data_dir()
        .map_err(|e| e.to_string())?
        .join("captures");

    #[cfg(target_os = "windows")]
    let capture = crate::capture::create_screen_capture(temp_dir);

    #[cfg(not(target_os = "windows"))]
    let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir);

    // Clean up captures older than 24 hours
    capture.cleanup_old_captures(24).map_err(|e| e.to_string())
}

fn main() {
    // Initialize logging - use fallback if file logging fails
    let file_logging_result = (|| -> anyhow::Result<()> {
        let log_dir = paths::get_logs_dir()?;
        std::fs::create_dir_all(&log_dir)?;

        // Clean up old log files (keep last 7 days)
        cleanup_old_logs(&log_dir, "app.log", 7)?;

        let file_appender = tracing_appender::rolling::daily(log_dir, "app.log");
        let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

        tracing_subscriber::registry()
            .with(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new("info")),
            )
            .with(fmt::layer().with_writer(non_blocking))
            .with(fmt::layer().with_writer(std::io::stdout))
            .init();

        // Keep the guard alive
        std::mem::forget(_guard);
        Ok(())
    })();

    // If file logging failed, fall back to stdout-only logging
    if let Err(e) = file_logging_result {
        eprintln!("Warning: Failed to initialize file logging: {}", e);
        eprintln!("Falling back to stdout-only logging");

        tracing_subscriber::registry()
            .with(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new("info")),
            )
            .with(fmt::layer().with_writer(std::io::stdout))
            .init();
    }

    info!("Starting Porua Wrapper");

    // Create system tray with initial Stopped state
    let tray_menu = create_tray_menu(&ServerStatus::Stopped);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                handle_tray_event(app, &id);
            }
        })
        .on_window_event(|event| {
            match event.event() {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // For tray-only apps, hide the window instead of closing it
                    // This keeps the app running with the system tray active
                    event.window().hide().unwrap();
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            needs_installation,
            start_installation,
            finish_installation,
            close_installer_window,
            get_log_path,
            quit_app,
            // Screen capture commands
            get_monitors_info,
            start_capture_mode,
            cancel_capture,
            capture_screen_region,
            open_preview_window,
            save_captured_image,
            check_capture_permission,
            get_virtual_screen_bounds,
            cleanup_old_captures,
        ])
        .setup(|app| {
            let app_handle = app.handle();

            // Check if already installed - if so, set activation policy immediately
            #[cfg(target_os = "macos")]
            {
                if let Ok(needs_install) = Installer::needs_installation() {
                    if !needs_install {
                        // Already installed, hide from dock immediately
                        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                }
            }

            // Note: No window is created initially (windows: [] in tauri.conf.json)
            // Windows are created programmatically only when needed (e.g., for installation)

            // Register global keyboard shortcut for screen capture
            register_capture_shortcut(&app_handle);

            // Spawn async setup
            tauri::async_runtime::spawn(async move {
                if let Err(e) = setup_app(app_handle).await {
                    error!("Setup failed: {}", e);
                    // Show error notification
                    let _ = tauri::api::notification::Notification::new("com.porua.app")
                        .title("Porua Setup Failed")
                        .body(&format!("Error: {}", e))
                        .show();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Error building Tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Always prevent default exit behavior
                // For tray-only apps, we want to keep running even when windows close
                // Explicit quit is handled via the quit_app() command
                api.prevent_exit();
            }
        });
}

async fn setup_app(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    // Create a persistent hidden window to keep the app alive on Windows
    // This prevents the app from exiting when the installer window closes
    let _keep_alive_window = tauri::WindowBuilder::new(
        &app_handle,
        "keep-alive",
        tauri::WindowUrl::App("index.html".into()),
    )
    .title("Porua Background")
    .inner_size(1.0, 1.0)
    .visible(false)
    .build()?;

    // Check if installation is needed
    if Installer::needs_installation()? {
        // Create the installer window programmatically
        let window = tauri::WindowBuilder::new(
            &app_handle,
            "main",
            tauri::WindowUrl::App("index.html".into()),
        )
        .title("Porua Setup")
        .inner_size(600.0, 750.0)
        .center()
        .resizable(false)
        .fullscreen(false)
        .decorations(true)
        .build()?;

        window.show()?;
        window.set_focus()?;

        // Wait for user to complete installation via UI
        return Ok(());
    }

    // Already installed - proceed normally

    // Clean up old capture files on startup (captures older than 24 hours)
    let temp_dir = paths::get_app_data_dir()?.join("captures");
    if temp_dir.exists() {
        #[cfg(target_os = "windows")]
        let capture = crate::capture::create_screen_capture(temp_dir.clone());

        #[cfg(not(target_os = "windows"))]
        let capture = ScreenCapture::with_backend(MockScreenBackend::new(), temp_dir.clone());

        match capture.cleanup_old_captures(24) {
            Ok(count) if count > 0 => info!("Cleaned up {} old capture files on startup", count),
            Ok(_) => {}
            Err(e) => error!("Failed to cleanup old captures on startup: {}", e),
        }
    }

    // Load configuration
    let config = Config::load()?;

    // Create server manager
    let server_manager = ServerManager::new(config);
    let state = AppState {
        server_manager: Arc::new(Mutex::new(server_manager)),
    };

    // Store state in app
    app_handle.manage(state.clone());

    // Start server automatically
    let mut manager = state.server_manager.lock().await;
    if let Err(e) = manager.start().await {
        error!("Failed to start server: {}", e);
        return Err(e);
    }

    // Wait for server to be ready and update tray
    drop(manager); // Release lock
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let manager = state.server_manager.lock().await;
    let status = manager.get_status().await;
    drop(manager);

    update_tray_menu(&app_handle, &status);

    start_status_monitor(app_handle.clone(), state.server_manager.clone());

    Ok(())
}

fn create_tray_menu(status: &ServerStatus) -> SystemTrayMenu {
    let mut menu = SystemTrayMenu::new();

    // Add capture option at the top (available in all states)
    #[cfg(target_os = "macos")]
    let shortcut_hint = "⌘⇧S";
    #[cfg(not(target_os = "macos"))]
    let shortcut_hint = "Ctrl+Shift+S";

    menu = menu
        .add_item(CustomMenuItem::new(
            "capture",
            format!("Capture Screen    {}", shortcut_hint),
        ))
        .add_native_item(SystemTrayMenuItem::Separator);

    match status {
        ServerStatus::Stopped | ServerStatus::Error(_) => {
            // Show Start button when stopped or in error
            menu = menu
                .add_item(CustomMenuItem::new("start", "Start Server"))
                .add_native_item(SystemTrayMenuItem::Separator);
        }
        ServerStatus::Starting => {
            // Show disabled Starting indicator
            menu = menu
                .add_item(CustomMenuItem::new("starting", "Starting...").disabled())
                .add_native_item(SystemTrayMenuItem::Separator);
        }
        ServerStatus::Running { .. } => {
            // Show Stop button when running
            menu = menu
                .add_item(CustomMenuItem::new("stop", "Stop Server"))
                .add_native_item(SystemTrayMenuItem::Separator);
        }
        ServerStatus::Stopping => {
            // Show disabled Stopping indicator
            menu = menu
                .add_item(CustomMenuItem::new("stopping", "Stopping...").disabled())
                .add_native_item(SystemTrayMenuItem::Separator);
        }
    }

    // Status text based on current state
    let status_text = match status {
        ServerStatus::Stopped => "Stopped",
        ServerStatus::Starting => "Starting...",
        ServerStatus::Running { port } => {
            return menu
                .add_item(CustomMenuItem::new("status", format!("Running on port {}", port)).disabled())
                .add_native_item(SystemTrayMenuItem::Separator)
                .add_item(CustomMenuItem::new("about", "About Porua"))
                .add_item(CustomMenuItem::new("quit", "Quit"));
        }
        ServerStatus::Stopping => "Stopping...",
        ServerStatus::Error(err) => {
            return menu
                .add_item(CustomMenuItem::new("status", "Error").disabled())
                .add_item(CustomMenuItem::new("error_detail", err.to_string()).disabled())
                .add_native_item(SystemTrayMenuItem::Separator)
                .add_item(CustomMenuItem::new("about", "About Porua"))
                .add_item(CustomMenuItem::new("quit", "Quit"));
        }
    };

    menu = menu
        .add_item(CustomMenuItem::new("status", status_text).disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("about", "About Porua"))
        .add_item(CustomMenuItem::new("quit", "Quit"));

    menu
}

fn update_tray_menu(app_handle: &tauri::AppHandle, status: &ServerStatus) {
    let menu = create_tray_menu(status);

    // Update the tray menu
    let _ = app_handle.tray_handle().set_menu(menu);

    // Swap icon based on server status (works on all platforms)
    let is_running = matches!(status, ServerStatus::Running { .. });

    // Determine which icon to load
    let icon_name = if is_running {
        "icons/icon-running.png"
    } else {
        "icons/icon.png"
    };

    // Load icon from Tauri resources
    if let Some(icon_path) = app_handle.path_resolver().resolve_resource(icon_name) {
        if let Ok(icon_bytes) = std::fs::read(&icon_path) {
            if let Ok(img) = image::load_from_memory(&icon_bytes) {
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();

                let icon = Icon::Rgba {
                    rgba: rgba.into_raw(),
                    width,
                    height,
                };
                if let Err(e) = app_handle.tray_handle().set_icon(icon) {
                    error!("Failed to set tray icon: {}", e);
                }
            } else {
                error!("Failed to load image from: {:?}", icon_path);
            }
        } else {
            error!("Failed to read icon file: {:?}", icon_path);
        }
    } else {
        error!("Failed to resolve icon resource: {}", icon_name);
    }
}

/// Helper function to trigger screen capture mode
/// Used by both tray menu and global shortcut
async fn trigger_capture(app_handle: &tauri::AppHandle) {
    // Check if overlay already exists
    if app_handle.get_window("capture-overlay").is_some() {
        info!("Capture overlay already open, ignoring trigger");
        return;
    }

    // Hide main window if it exists
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.hide();
    }

    // Create the overlay window
    match tauri::WindowBuilder::new(
        app_handle,
        "capture-overlay",
        tauri::WindowUrl::App("overlay.html".into()),
    )
    .title("Screen Capture")
    .fullscreen(true)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    {
        Ok(overlay) => {
            if let Err(e) = overlay.show() {
                error!("Failed to show overlay: {}", e);
            }
            if let Err(e) = overlay.set_focus() {
                error!("Failed to focus overlay: {}", e);
            }
            info!("Capture overlay window created via shortcut/tray");
        }
        Err(e) => {
            error!("Failed to create overlay window: {}", e);
        }
    }
}

/// Register global keyboard shortcut for screen capture
fn register_capture_shortcut(app_handle: &tauri::AppHandle) {
    let handle = app_handle.clone();

    // Use Cmd+Shift+S on macOS, Ctrl+Shift+S on other platforms
    #[cfg(target_os = "macos")]
    let shortcut = "Cmd+Shift+S";
    #[cfg(not(target_os = "macos"))]
    let shortcut = "Ctrl+Shift+S";

    match app_handle.global_shortcut_manager().register(shortcut, move || {
        info!("Global shortcut {} triggered", shortcut);
        let app = handle.clone();
        tauri::async_runtime::spawn(async move {
            trigger_capture(&app).await;
        });
    }) {
        Ok(_) => info!("Registered global shortcut: {}", shortcut),
        Err(e) => error!("Failed to register global shortcut {}: {}", shortcut, e),
    }
}

fn handle_tray_event(app: &tauri::AppHandle, event_id: &str) {
    info!("Tray event: {}", event_id);

    match event_id {
        "capture" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                info!("Capture requested from tray menu");
                trigger_capture(&app_handle).await;
            });
        }
        "start" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    // Check current status to prevent double-starting
                    let current_status = {
                        let manager = state.server_manager.lock().await;
                        manager.get_status().await
                    };

                    // Only start if stopped or in error state
                    if matches!(current_status, ServerStatus::Stopped | ServerStatus::Error(_)) {
                        let mut manager = state.server_manager.lock().await;
                        match manager.start().await {
                            Ok(_) => info!("Server start initiated"),
                            Err(e) => error!("Failed to start server: {}", e),
                        }
                    } else {
                        info!("Ignoring start request - server is in {:?} state", current_status);
                    }
                }
            });
        }
        "stop" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    // Check current status to prevent double-stopping
                    let current_status = {
                        let manager = state.server_manager.lock().await;
                        manager.get_status().await
                    };

                    // Only stop if running
                    if matches!(current_status, ServerStatus::Running { .. }) {
                        let mut manager = state.server_manager.lock().await;
                        match manager.stop().await {
                            Ok(_) => info!("Server stopped successfully"),
                            Err(e) => error!("Failed to stop server: {}", e),
                        }
                    } else {
                        info!("Ignoring stop request - server is in {:?} state", current_status);
                    }
                }
            });
        }
        "about" => {
            // Open the About Porua URL in the default browser
            if let Err(e) = open::that("https://shahadishraq.com/porua") {
                error!("Failed to open About Porua URL: {}", e);
            }
        }
        "quit" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                info!("Quit requested, stopping server");

                if let Some(state) = app_handle.try_state::<AppState>() {
                    let mut manager = state.server_manager.lock().await;
                    let _ = manager.stop().await;
                }

                std::process::exit(0);
            });
        }
        _ => {}
    }
}

fn start_status_monitor(app_handle: tauri::AppHandle, manager: Arc<Mutex<ServerManager>>) {
    tauri::async_runtime::spawn(async move {
        let mut last_status = ServerStatus::Stopped;

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            let current_status = {
                let mgr = manager.lock().await;
                mgr.get_status().await
            };

            // Update tray if status changed
            if current_status != last_status {
                info!("Status changed: {:?}", current_status);
                update_tray_menu(&app_handle, &current_status);
                last_status = current_status;
            }
        }
    });
}

/// Clean up old log files to prevent unbounded disk usage
/// Keeps only the specified number of days worth of logs
fn cleanup_old_logs(log_dir: &std::path::Path, base_name: &str, days_to_keep: u64) -> anyhow::Result<()> {
    use std::time::SystemTime;

    // Get all log files (including rotated ones with date suffixes)
    let entries = match std::fs::read_dir(log_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()), // If directory doesn't exist, nothing to clean
    };

    let cutoff_time = SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(days_to_keep * 24 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);

    for entry in entries.flatten() {
        let path = entry.path();

        // Only process log files matching our pattern
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            // Match both "app.log" and "app.log.YYYY-MM-DD" patterns
            if file_name.starts_with(base_name) {
                // Check file modification time
                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        if modified < cutoff_time {
                            eprintln!("Cleaning up old log file: {:?}", path);
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
