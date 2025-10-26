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
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
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

fn main() {
    // Initialize logging
    let log_dir = paths::get_logs_dir().expect("Failed to get logs directory");
    std::fs::create_dir_all(&log_dir).expect("Failed to create logs directory");

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

    info!("Starting Porua Wrapper");

    // Create system tray
    let tray_menu = create_tray_menu(false);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                handle_tray_event(app, &id);
            }
        })
        .setup(|app| {
            let app_handle = app.handle();

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
                // Don't prevent exit
                api.prevent_exit();
            }
        });
}

async fn setup_app(app_handle: tauri::AppHandle) -> anyhow::Result<()> {
    info!("Setting up application");

    // Check if installation is needed
    if Installer::needs_installation()? {
        info!("First run detected, starting installation");
        let installer = Installer::new(app_handle.clone());
        installer.install().await?;
        info!("Installation completed successfully");
    } else {
        info!("Application already installed");
    }

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

fn create_tray_menu(server_running: bool) -> SystemTrayMenu {
    let mut menu = SystemTrayMenu::new();

    if server_running {
        menu = menu
            .add_item(CustomMenuItem::new("stop", "⏹ Stop Server"))
            .add_native_item(SystemTrayMenuItem::Separator);
    } else {
        menu = menu
            .add_item(CustomMenuItem::new("start", "▶ Start Server"))
            .add_native_item(SystemTrayMenuItem::Separator);
    }

    let status_text = if server_running {
        "ℹ️ Status: Running (3000)"
    } else {
        "ℹ️ Status: Stopped"
    };

    menu = menu
        .add_item(CustomMenuItem::new("status", status_text).disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "❌ Quit"));

    menu
}

fn update_tray_menu(app_handle: &tauri::AppHandle, status: &ServerStatus) {
    let is_running = matches!(status, ServerStatus::Running { .. });
    let menu = create_tray_menu(is_running);

    if let Some(tray) = app_handle.tray_handle().get_item("main") {
        let _ = tray.set_menu(menu);
    } else {
        let _ = app_handle.tray_handle().set_menu(menu);
    }

    // Update icon based on status
    #[cfg(target_os = "macos")]
    {
        let icon_name = if is_running {
            "icon-green.png"
        } else {
            "icon-gray.png"
        };
        // Note: In a real implementation, you'd load different icon files
        // For now, we'll just use the same icon
        let _ = icon_name;
    }
}

fn handle_tray_event(app: &tauri::AppHandle, event_id: &str) {
    info!("Tray event: {}", event_id);

    match event_id {
        "start" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let mut manager = state.server_manager.lock().await;
                    match manager.start().await {
                        Ok(_) => info!("Server start initiated"),
                        Err(e) => error!("Failed to start server: {}", e),
                    }
                }
            });
        }
        "stop" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let mut manager = state.server_manager.lock().await;
                    match manager.stop().await {
                        Ok(_) => info!("Server stopped successfully"),
                        Err(e) => error!("Failed to stop server: {}", e),
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
