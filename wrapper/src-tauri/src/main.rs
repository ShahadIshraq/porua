#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod api_keys;
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

use crate::api_keys::{KeyStatus, Provider, ValidationResult};
use crate::config::{Config, LlmConfig};
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

// ============================================================================
// API Key Management Commands
// ============================================================================

/// Get the status of an API key for a provider
#[tauri::command]
async fn get_api_key_status(provider: String) -> Result<KeyStatus, String> {
    info!("get_api_key_status called for provider: {}", provider);

    let provider = Provider::from_str(&provider)
        .ok_or_else(|| format!("Invalid provider: {}. Must be 'gemini' or 'openai'", provider))?;

    api_keys::get_key_status(provider).map_err(|e| e.to_string())
}

/// Validate and save an API key for a provider
#[tauri::command]
async fn validate_and_save_api_key(provider: String, key: String) -> Result<ValidationResult, String> {
    info!("validate_and_save_api_key called for provider: {}", provider);

    let provider = Provider::from_str(&provider)
        .ok_or_else(|| format!("Invalid provider: {}. Must be 'gemini' or 'openai'", provider))?;

    // Validate the key first
    let result = api_keys::validate_api_key(provider, &key)
        .await
        .map_err(|e| e.to_string())?;

    // Only store if valid
    if result.valid {
        api_keys::store_api_key(provider, &key).map_err(|e| e.to_string())?;
        info!("API key stored successfully for provider: {:?}", provider);
    } else {
        info!("API key validation failed for provider: {:?}: {}", provider, result.message);
    }

    Ok(result)
}

/// Remove an API key for a provider
#[tauri::command]
async fn remove_api_key(provider: String) -> Result<(), String> {
    info!("remove_api_key called for provider: {}", provider);

    let provider = Provider::from_str(&provider)
        .ok_or_else(|| format!("Invalid provider: {}. Must be 'gemini' or 'openai'", provider))?;

    api_keys::delete_api_key(provider).map_err(|e| e.to_string())?;
    info!("API key removed for provider: {:?}", provider);

    Ok(())
}

/// Response structure for API keys configuration
#[derive(serde::Serialize)]
struct ApiKeysConfig {
    gemini_configured: bool,
    openai_configured: bool,
    active_provider: Option<String>,
}

/// Get the current API keys configuration
#[tauri::command]
async fn get_api_keys_config() -> Result<ApiKeysConfig, String> {
    info!("get_api_keys_config called");

    let gemini_configured = api_keys::has_api_key(Provider::Gemini).map_err(|e| e.to_string())?;
    let openai_configured = api_keys::has_api_key(Provider::OpenAI).map_err(|e| e.to_string())?;

    // Load config to get active provider preference
    let config = Config::load().map_err(|e| e.to_string())?;
    let active_provider = config.llm.active_provider.clone();

    // Determine effective active provider
    let effective_provider = match &active_provider {
        Some(p) => {
            // Verify the configured provider actually has a key
            let has_key = match p.as_str() {
                "gemini" => gemini_configured,
                "openai" => openai_configured,
                _ => false,
            };
            if has_key {
                Some(p.clone())
            } else {
                // Fall back to auto-selection
                None
            }
        }
        None => None,
    };

    // Auto-select if no explicit preference or preference invalid
    let final_provider = effective_provider.or_else(|| {
        if gemini_configured {
            Some("gemini".to_string())
        } else if openai_configured {
            Some("openai".to_string())
        } else {
            None
        }
    });

    Ok(ApiKeysConfig {
        gemini_configured,
        openai_configured,
        active_provider: final_provider,
    })
}

/// Set the active LLM provider
#[tauri::command]
async fn set_active_provider(provider: Option<String>) -> Result<(), String> {
    info!("set_active_provider called: {:?}", provider);

    // Validate provider if provided
    if let Some(ref p) = provider {
        if !LlmConfig::is_valid_provider(p) {
            return Err(format!("Invalid provider: {}. Must be 'gemini' or 'openai'", p));
        }
    }

    // Load, update, and save config
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.llm.set_active_provider(provider).map_err(|e| e.to_string())?;
    config.save().map_err(|e| e.to_string())?;

    info!("Active provider updated to: {:?}", config.llm.active_provider);
    Ok(())
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
            // API Key Management
            get_api_key_status,
            validate_and_save_api_key,
            remove_api_key,
            get_api_keys_config,
            set_active_provider,
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

#[cfg(test)]
mod tests {
    use super::*;

    // Tests for API key command logic
    // These test the underlying functions that the Tauri commands use

    #[test]
    fn test_provider_parsing_valid() {
        assert!(Provider::from_str("gemini").is_some());
        assert!(Provider::from_str("openai").is_some());
        assert!(Provider::from_str("GEMINI").is_some());
        assert!(Provider::from_str("OpenAI").is_some());
    }

    #[test]
    fn test_provider_parsing_invalid() {
        assert!(Provider::from_str("invalid").is_none());
        assert!(Provider::from_str("").is_none());
        assert!(Provider::from_str("gpt4").is_none());
    }

    #[test]
    fn test_llm_config_provider_validation() {
        assert!(LlmConfig::is_valid_provider("gemini"));
        assert!(LlmConfig::is_valid_provider("openai"));
        assert!(!LlmConfig::is_valid_provider("invalid"));
    }

    #[test]
    fn test_api_keys_config_serialization() {
        let config = ApiKeysConfig {
            gemini_configured: true,
            openai_configured: false,
            active_provider: Some("gemini".to_string()),
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("gemini_configured"));
        assert!(json.contains("openai_configured"));
        assert!(json.contains("active_provider"));
    }

    #[test]
    fn test_api_keys_config_auto_select_gemini() {
        // When both are configured, prefer gemini
        let config = ApiKeysConfig {
            gemini_configured: true,
            openai_configured: true,
            active_provider: Some("gemini".to_string()),
        };
        assert_eq!(config.active_provider, Some("gemini".to_string()));
    }

    #[test]
    fn test_api_keys_config_none_when_unconfigured() {
        let config = ApiKeysConfig {
            gemini_configured: false,
            openai_configured: false,
            active_provider: None,
        };
        assert!(config.active_provider.is_none());
    }

    // Integration tests for command error handling
    #[tokio::test]
    async fn test_get_api_key_status_invalid_provider() {
        let result = get_api_key_status("invalid_provider".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid provider"));
    }

    #[tokio::test]
    async fn test_validate_and_save_invalid_provider() {
        let result = validate_and_save_api_key(
            "invalid_provider".to_string(),
            "some-key".to_string(),
        ).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid provider"));
    }

    #[tokio::test]
    async fn test_remove_api_key_invalid_provider() {
        let result = remove_api_key("invalid_provider".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid provider"));
    }

    #[tokio::test]
    async fn test_set_active_provider_invalid() {
        let result = set_active_provider(Some("invalid".to_string())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid provider"));
    }

    #[tokio::test]
    async fn test_validate_and_save_empty_key() {
        // Empty key should be rejected at validation level
        let result = validate_and_save_api_key(
            "gemini".to_string(),
            "".to_string(),
        ).await;
        assert!(result.is_ok());
        let validation = result.unwrap();
        assert!(!validation.valid);
        assert!(validation.message.contains("empty"));
    }

    #[tokio::test]
    async fn test_get_api_key_status_valid_provider() {
        // Should succeed for valid provider (even if no key configured)
        let result = get_api_key_status("gemini".to_string()).await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.provider, "gemini");
    }
}
