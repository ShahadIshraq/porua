use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{api::notification::Notification, AppHandle, Manager};
use tracing::{info, warn};

use crate::{config::Config, paths};

#[derive(Clone, serde::Serialize)]
pub struct InstallProgress {
    pub step: String,
    pub progress: f32,
    pub message: String,
    pub details: Option<String>,
}

const MODELS: &[(&str, &str, u64)] = &[
    (
        "kokoro-v1.0.onnx",
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
        325_000_000, // ~310 MB
    ),
    (
        "voices-v1.0.bin",
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        28_000_000, // ~27 MB
    ),
];

pub struct Installer {
    app_handle: AppHandle,
}

impl Installer {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn emit_progress(&self, progress: InstallProgress) {
        let _ = self.app_handle.emit_all("install-progress", progress);
    }

    fn emit_error(&self, error: &str) {
        let _ = self.app_handle.emit_all("install-error", error);
    }

    /// Check if installation is needed
    pub fn needs_installation() -> Result<bool> {
        let flag_file = paths::get_install_flag_file()?;
        Ok(!flag_file.exists())
    }

    /// Run the full installation process
    pub async fn install(&self) -> Result<()> {
        info!("Starting installation process");

        self.notify("Setting up Porua...");

        // Step 1: Create directories (10%)
        self.emit_progress(InstallProgress {
            step: "CreatingDirectories".to_string(),
            progress: 0.1,
            message: "Creating directories...".to_string(),
            details: None,
        });
        self.notify("Creating directories...");
        if let Err(e) = paths::ensure_directories_exist()
            .context("Failed to create directories") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Directories created successfully");
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Step 2: Extract server binary (20%)
        self.emit_progress(InstallProgress {
            step: "ExtractingServer".to_string(),
            progress: 0.2,
            message: "Extracting server binary...".to_string(),
            details: None,
        });
        self.notify("Extracting server files...");
        if let Err(e) = self.extract_server_binary()
            .context("Failed to extract server binary") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Server binary extracted");
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Step 3: Extract espeak-ng data (30%)
        self.emit_progress(InstallProgress {
            step: "ExtractingEspeak".to_string(),
            progress: 0.3,
            message: "Extracting espeak-ng data...".to_string(),
            details: None,
        });
        self.notify("Extracting espeak-ng data...");
        if let Err(e) = self.extract_espeak_data()
            .context("Failed to extract espeak-ng data") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("espeak-ng data extracted");
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Step 4: Extract voice samples (40%)
        self.emit_progress(InstallProgress {
            step: "ExtractingSamples".to_string(),
            progress: 0.4,
            message: "Extracting voice samples...".to_string(),
            details: None,
        });
        self.notify("Extracting voice samples...");
        if let Err(e) = self.extract_samples()
            .context("Failed to extract samples") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Voice samples extracted");
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Step 5: Download models (50-95%)
        self.emit_progress(InstallProgress {
            step: "DownloadingModels".to_string(),
            progress: 0.5,
            message: "Downloading TTS models...".to_string(),
            details: None,
        });
        self.notify("Downloading TTS models (this may take a few minutes)...");
        if let Err(e) = self.download_models()
            .await
            .context("Failed to download models") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Models downloaded successfully");

        // Step 6: Create configuration (95%)
        self.emit_progress(InstallProgress {
            step: "CreatingConfig".to_string(),
            progress: 0.95,
            message: "Creating configuration...".to_string(),
            details: None,
        });
        self.notify("Creating configuration...");
        if let Err(e) = Config::new().and_then(|config| config.save())
            .context("Failed to create configuration") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Configuration created");
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Step 7: Mark installation as complete (100%)
        let flag_file = paths::get_install_flag_file()?;
        if let Err(e) = std::fs::write(&flag_file, "installed")
            .context("Failed to create installation flag") {
            self.emit_error(&e.to_string());
            return Err(e);
        }
        info!("Installation completed successfully");

        self.emit_progress(InstallProgress {
            step: "Complete".to_string(),
            progress: 1.0,
            message: "Installation complete!".to_string(),
            details: None,
        });
        self.notify("Setup complete! Starting server...");

        Ok(())
    }

    /// Extract server binary from Tauri resources
    fn extract_server_binary(&self) -> Result<()> {
        let resource_path = self.get_resource_path("porua_server")?;
        let dest_path = paths::get_server_binary_path()?;

        std::fs::copy(&resource_path, &dest_path)
            .context("Failed to copy server binary")?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dest_path)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dest_path, perms)?;
        }

        Ok(())
    }

    /// Extract espeak-ng data from Tauri resources
    fn extract_espeak_data(&self) -> Result<()> {
        let resource_path = self.get_resource_path("espeak-ng-data")?;
        let dest_path = paths::get_espeak_data_dir()?;

        copy_dir_recursive(&resource_path, &dest_path)
            .context("Failed to copy espeak-ng data")?;

        Ok(())
    }

    /// Extract voice samples from Tauri resources
    fn extract_samples(&self) -> Result<()> {
        let resource_path = self.get_resource_path("samples")?;
        let dest_path = paths::get_samples_dir()?;

        copy_dir_recursive(&resource_path, &dest_path)
            .context("Failed to copy samples")?;

        Ok(())
    }

    /// Download TTS models from GitHub
    async fn download_models(&self) -> Result<()> {
        let models_dir = paths::get_models_dir()?;

        for (filename, url, expected_size) in MODELS {
            let dest_path = models_dir.join(filename);

            // Skip if already exists and has correct size
            if dest_path.exists() {
                if let Ok(metadata) = std::fs::metadata(&dest_path) {
                    if metadata.len() == *expected_size {
                        info!("Model {} already exists, skipping", filename);
                        continue;
                    } else {
                        warn!("Model {} exists but has incorrect size, re-downloading", filename);
                        std::fs::remove_file(&dest_path)?;
                    }
                }
            }

            info!("Downloading {} from {}", filename, url);
            self.download_file_with_progress(url, &dest_path, *expected_size)
                .await
                .context(format!("Failed to download {}", filename))?;
        }

        Ok(())
    }

    /// Download a file with progress notifications
    async fn download_file_with_progress(
        &self,
        url: &str,
        dest: &Path,
        expected_size: u64,
    ) -> Result<()> {
        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .send()
            .await
            .context("Failed to start download")?;

        if !response.status().is_success() {
            anyhow::bail!("Download failed with status: {}", response.status());
        }

        let mut file = File::create(dest).context("Failed to create file")?;
        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_progress_time = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read chunk")?;
            file.write_all(&chunk).context("Failed to write to file")?;
            downloaded += chunk.len() as u64;

            // Emit progress every 500ms
            if last_progress_time.elapsed() >= std::time::Duration::from_millis(500) {
                let progress_mb = downloaded / (1024 * 1024);
                let total_mb = expected_size / (1024 * 1024);

                // Calculate overall progress: 0.5 + (downloaded / expected_size) * 0.45
                let download_progress = downloaded as f32 / expected_size as f32;
                let overall_progress = 0.5 + (download_progress * 0.45);

                self.emit_progress(InstallProgress {
                    step: "DownloadingModels".to_string(),
                    progress: overall_progress,
                    message: "Downloading TTS models...".to_string(),
                    details: Some(format!("{} MB / {} MB", progress_mb, total_mb)),
                });

                // Keep notification as backup
                self.notify(&format!(
                    "Downloading models... {} MB / {} MB",
                    progress_mb, total_mb
                ));

                last_progress_time = std::time::Instant::now();
            }
        }

        file.flush().context("Failed to flush file")?;
        info!("Download complete: {:?}", dest);

        Ok(())
    }

    /// Get resource path from Tauri bundle
    fn get_resource_path(&self, resource: &str) -> Result<PathBuf> {
        let resource_path = self
            .app_handle
            .path_resolver()
            .resolve_resource(format!("resources/{}", resource))
            .context(format!("Failed to resolve resource: {}", resource))?;

        Ok(resource_path)
    }

    /// Send a system notification
    fn notify(&self, message: &str) {
        let _ = Notification::new(&self.app_handle.config().tauri.bundle.identifier)
            .title("Porua")
            .body(message)
            .show();
    }
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}
