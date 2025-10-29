#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod config;
mod installer;
mod paths;
mod server;

use std::sync::Arc;
use tauri::{
    CustomMenuItem, Icon, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};
use tokio::sync::Mutex;
use tracing::{error, info};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

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
            error!("Installation failed: {}", e);
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
async fn quit_app() {
    std::process::exit(0);
}

fn main() {
    // Initialize logging - use fallback if file logging fails
    let file_logging_result = (|| -> anyhow::Result<()> {
        let log_dir = paths::get_logs_dir()?;
        std::fs::create_dir_all(&log_dir)?;

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
        .invoke_handler(tauri::generate_handler![
            needs_installation,
            start_installation,
            finish_installation,
            close_installer_window,
            get_log_path,
            quit_app,
        ])
        .setup(|app| {
            let app_handle = app.handle();

            // Check if already installed - if so, set activation policy immediately
            #[cfg(target_os = "macos")]
            {
                if let Ok(needs_install) = Installer::needs_installation() {
                    if !needs_install {
                        // Already installed, hide from dock immediately
                        info!("App already installed, setting Accessory activation policy");
                        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    } else {
                        info!("First run - keeping regular activation policy for installer window");
                    }
                }
            }

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
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                info!("Exit requested, stopping server before exit");

                // Prevent immediate exit
                api.prevent_exit();

                // Stop the server before allowing exit
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let manager = state.server_manager.clone();
                    let app_handle_clone = app_handle.clone();

                    tauri::async_runtime::spawn(async move {
                        info!("Stopping server...");
                        let mut mgr = manager.lock().await;
                        if let Err(e) = mgr.stop().await {
                            error!("Error stopping server: {}", e);
                        }
                        info!("Server stopped successfully");

                        // Now exit the app
                        app_handle_clone.exit(0);
                    });
                } else {
                    // No state, just exit
                    info!("No state found, exiting immediately");
                    app_handle.exit(0);
                }
            }
        });
}

async fn setup_app(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    info!("Setting up application");

    // Check if installation is needed
    if Installer::needs_installation()? {
        info!("First run detected - showing installer window");

        // Show the window for installation
        if let Some(window) = app_handle.get_window("main") {
            window.show()?;
            window.center()?;
            window.set_focus()?;
        }

        // Wait for user to complete installation via UI
        return Ok(());
    }

    // Already installed - proceed normally
    info!("Application already installed");

    // Load configuration
    let config = Config::load()?;
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
        return Err(e);
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

fn create_tray_menu(status: &ServerStatus) -> SystemTrayMenu {
    let mut menu = SystemTrayMenu::new();

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
                .add_item(CustomMenuItem::new("quit", "Quit"));
        }
        ServerStatus::Stopping => "Stopping...",
        ServerStatus::Error(err) => {
            return menu
                .add_item(CustomMenuItem::new("status", "Error").disabled())
                .add_item(CustomMenuItem::new("error_detail", err.to_string()).disabled())
                .add_native_item(SystemTrayMenuItem::Separator)
                .add_item(CustomMenuItem::new("quit", "Quit"));
        }
    };

    menu = menu
        .add_item(CustomMenuItem::new("status", status_text).disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    menu
}

fn update_tray_menu(app_handle: &tauri::AppHandle, status: &ServerStatus) {
    let menu = create_tray_menu(status);

    // Update the tray menu
    let _ = app_handle.tray_handle().set_menu(menu);

    // Swap icon based on server status
    #[cfg(target_os = "macos")]
    {
        let is_running = matches!(status, ServerStatus::Running { .. });

        // Determine which icon to load
        let icon_path = if is_running {
            "icons/icon-running.png"
        } else {
            "icons/icon.png"
        };

        // Load and set the icon
        if let Ok(icon_bytes) = std::fs::read(icon_path) {
            if let Ok(img) = image::load_from_memory(&icon_bytes) {
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();
                let icon = Icon::Rgba {
                    rgba: rgba.into_raw(),
                    width,
                    height,
                };
                let _ = app_handle.tray_handle().set_icon(icon);
            }
        }
    }
}

fn handle_tray_event(app: &tauri::AppHandle, event_id: &str) {
    info!("Tray event: {}", event_id);

    match event_id {
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
