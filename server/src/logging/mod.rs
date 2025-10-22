pub mod config;
pub mod middleware;
pub mod paths;
pub mod cleanup;

use std::io;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer};

pub use config::LogConfig;
pub use middleware::{access_log_middleware, RequestId};

/// Initialize the dual-stream logging system (console + file-based)
///
/// This sets up:
/// - Console logging for immediate visibility
/// - Access log file (JSON format) for HTTP request tracking
/// - Application log file (JSON format) for server events
/// - Automatic log rotation at 50MB or daily
pub fn init_logging(config: &LogConfig) -> Result<(), Box<dyn std::error::Error>> {
    // Create log directory if it doesn't exist
    let log_dir = paths::get_log_directory(config.custom_log_dir.as_deref())?;

    tracing::info!("Initializing logging system");
    tracing::info!("Log directory: {:?}", log_dir);

    // Create rolling file appenders for both log types
    // Using daily rotation - files are automatically named with date suffix
    let access_appender = tracing_appender::rolling::daily(&log_dir, "access.log");
    let app_appender = tracing_appender::rolling::daily(&log_dir, "application.log");

    // Create non-blocking writers for async performance
    let (access_writer, _access_guard) = tracing_appender::non_blocking(access_appender);
    let (app_writer, _app_guard) = tracing_appender::non_blocking(app_appender);

    // Console layer - for immediate visibility during development/debugging
    let console_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .compact()
        .with_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                EnvFilter::new(&config.console_log_level)
            }),
        );

    // Access log layer - JSON formatted, only logs with target "access_log"
    let access_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(access_writer)
        .with_filter(
            EnvFilter::new("access_log=info")
                .add_directive(tracing::Level::INFO.into()),
        );

    // Application log layer - JSON formatted, excludes access logs
    let app_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(app_writer)
        .with_filter(
            EnvFilter::new(&config.file_log_level)
                .add_directive("access_log=off".parse()?) // Exclude access logs from app log
        );

    // Combine all layers
    tracing_subscriber::registry()
        .with(console_layer)
        .with(access_layer)
        .with(app_layer)
        .init();

    // Store guards to prevent them from being dropped
    // (dropping guards would close the log files)
    std::mem::forget(_access_guard);
    std::mem::forget(_app_guard);

    tracing::info!(
        "Logging initialized - access: access.log, application: application.log"
    );

    // Start background cleanup task
    if config.enable_cleanup {
        tokio::spawn(cleanup::cleanup_task(log_dir.clone(), config.clone()));
        tracing::info!(
            "Log cleanup task started (retention: {} days, max size: {} MB)",
            config.retention_days,
            config.max_total_size_mb
        );
    }

    Ok(())
}

/// Log platform-specific information on startup
pub fn log_platform_info() {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let family = std::env::consts::FAMILY;

    tracing::info!(
        platform = os,
        architecture = arch,
        family = family,
        "Server starting on platform"
    );
}
