use anyhow::{Context, Result};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{info, warn, error};

use crate::config::Config;

#[derive(Debug, Clone, PartialEq)]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running { port: u16 },
    Stopping,
    Error(String),
}

pub struct ServerManager {
    process: Option<Child>,
    status: Arc<RwLock<ServerStatus>>,
    config: Config,
}

impl ServerManager {
    pub fn new(config: Config) -> Self {
        Self {
            process: None,
            status: Arc::new(RwLock::new(ServerStatus::Stopped)),
            config,
        }
    }

    /// Start the server
    pub async fn start(&mut self) -> Result<()> {
        // Check if already running
        {
            let status = self.status.read().await;
            if matches!(*status, ServerStatus::Running { .. } | ServerStatus::Starting) {
                return Ok(());
            }
        }

        info!("Starting server...");
        *self.status.write().await = ServerStatus::Starting;

        // Build command
        let mut cmd = Command::new(&self.config.paths.server_binary);

        // Server arguments
        cmd.args(["--server", "--port", &self.config.server.port.to_string()]);

        // Environment variables
        cmd.env("TTS_MODEL_DIR", &self.config.paths.model_dir);
        cmd.env(
            "TTS_POOL_SIZE",
            &self.config.server.pool_size.to_string(),
        );
        cmd.env(
            "PIPER_ESPEAKNG_DATA_DIRECTORY",
            &self.config.paths.espeak_data_dir,
        );
        cmd.env("RUST_LOG", &self.config.server.log_level);

        // Redirect logs to log directory with rotation
        // Use daily rotation to prevent unbounded log growth
        let log_file_path = self.config.paths.log_dir.join("server.log");

        // Clean up old log files (keep last 7 days)
        cleanup_old_logs(&self.config.paths.log_dir, "server.log", 7)?;

        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
            .context("Failed to create server log file")?;

        cmd.stdout(Stdio::from(
            log_file.try_clone().context("Failed to clone log file")?,
        ));
        cmd.stderr(Stdio::from(log_file));

        // Spawn process
        let child = cmd.spawn().context("Failed to spawn server process")?;

        info!("Server process spawned with PID: {:?}", child.id());
        self.process = Some(child);

        // Wait for server to be ready
        let status_clone = Arc::clone(&self.status);
        let port = self.config.server.port;

        tokio::spawn(async move {
            match wait_for_server_ready(port).await {
                Ok(_) => {
                    info!("Server is ready on port {}", port);
                    *status_clone.write().await = ServerStatus::Running { port };
                }
                Err(e) => {
                    error!("Server failed to start: {}", e);
                    *status_clone.write().await =
                        ServerStatus::Error(format!("Failed to start: {}", e));
                }
            }
        });

        Ok(())
    }

    /// Stop the server
    pub async fn stop(&mut self) -> Result<()> {
        // Check if already stopped
        {
            let status = self.status.read().await;
            if matches!(*status, ServerStatus::Stopped | ServerStatus::Stopping) {
                return Ok(());
            }
        }

        info!("Stopping server...");
        *self.status.write().await = ServerStatus::Stopping;

        if let Some(mut child) = self.process.take() {
            // Try graceful shutdown first
            info!("Sending termination signal...");

            #[cfg(unix)]
            {
                // Send SIGTERM
                unsafe {
                    libc::kill(child.id() as i32, libc::SIGTERM);
                }
            }

            #[cfg(windows)]
            {
                // On Windows, kill is more abrupt
                let _ = child.kill();
            }

            // Wait for process to exit (with timeout)
            let timeout = Duration::from_secs(5);
            let start = std::time::Instant::now();

            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        info!("Server exited with status: {}", status);
                        break;
                    }
                    Ok(None) => {
                        if start.elapsed() > timeout {
                            warn!("Server didn't exit gracefully, forcing kill");
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        sleep(Duration::from_millis(100)).await;
                    }
                    Err(e) => {
                        error!("Error waiting for server: {}", e);
                        break;
                    }
                }
            }
        }

        *self.status.write().await = ServerStatus::Stopped;
        info!("Server stopped");

        Ok(())
    }

    /// Get current server status
    pub async fn get_status(&self) -> ServerStatus {
        self.status.read().await.clone()
    }
}

impl Drop for ServerManager {
    fn drop(&mut self) {
        // Cleanup: kill process if still running
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Wait for server to be ready by checking health endpoint
async fn wait_for_server_ready(port: u16) -> Result<()> {
    let url = format!("http://localhost:{}/health", port);
    let client = reqwest::Client::new();
    let max_attempts = 100; // 10 seconds total
    let delay = Duration::from_millis(100);

    for attempt in 1..=max_attempts {
        match client.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                info!("Server health check passed on attempt {}", attempt);
                return Ok(());
            }
            Ok(response) => {
                warn!(
                    "Server health check returned status {} on attempt {}",
                    response.status(),
                    attempt
                );
            }
            Err(e) => {
                if attempt == max_attempts {
                    return Err(anyhow::anyhow!(
                        "Server failed to start after {} attempts: {}",
                        max_attempts,
                        e
                    ));
                }
            }
        }

        sleep(delay).await;
    }

    Err(anyhow::anyhow!("Server failed to start within timeout"))
}

/// Clean up old log files to prevent unbounded disk usage
/// Keeps only the specified number of days worth of logs
fn cleanup_old_logs(log_dir: &std::path::Path, base_name: &str, days_to_keep: u64) -> Result<()> {
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
            // Match both "server.log" and "server.log.YYYY-MM-DD" patterns
            if file_name.starts_with(base_name) {
                // Check file modification time
                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        if modified < cutoff_time {
                            info!("Cleaning up old log file: {:?}", path);
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
