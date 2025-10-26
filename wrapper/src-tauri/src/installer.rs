use anyhow::{Context, Result};
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{api::notification::Notification, AppHandle};
use tracing::{info, warn, error};

use crate::{config::Config, paths};

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

    /// Check if installation is needed
    pub fn needs_installation() -> Result<bool> {
        let flag_file = paths::get_install_flag_file()?;
        Ok(!flag_file.exists())
    }

    /// Run the full installation process
    pub async fn install(&self) -> Result<()> {
        info!("Starting installation process");

        self.notify("Setting up Porua...");

        // Step 1: Create directories
        self.notify("Creating directories...");
        paths::ensure_directories_exist()
            .context("Failed to create directories")?;
        info!("Directories created successfully");

        // Step 2: Extract bundled resources
        self.notify("Extracting server files...");
        self.extract_server_binary()
            .context("Failed to extract server binary")?;
        info!("Server binary extracted");

        self.notify("Extracting espeak-ng data...");
        self.extract_espeak_data()
            .context("Failed to extract espeak-ng data")?;
        info!("espeak-ng data extracted");

        self.notify("Extracting voice samples...");
        self.extract_samples()
            .context("Failed to extract samples")?;
        info!("Voice samples extracted");

        // Step 3: Download models
        self.notify("Downloading TTS models (this may take a few minutes)...");
        self.download_models()
            .await
            .context("Failed to download models")?;
        info!("Models downloaded successfully");

        // Step 4: Create configuration
        self.notify("Creating configuration...");
        let config = Config::new()?;
        config.save()?;
        info!("Configuration created");

        // Step 5: Mark installation as complete
        let flag_file = paths::get_install_flag_file()?;
        std::fs::write(&flag_file, "installed")
            .context("Failed to create installation flag")?;
        info!("Installation completed successfully");

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
        let mut last_notified_mb = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read chunk")?;
            file.write_all(&chunk).context("Failed to write to file")?;
            downloaded += chunk.len() as u64;

            // Notify every 50 MB
            let current_mb = downloaded / (50 * 1024 * 1024);
            if current_mb > last_notified_mb {
                let progress_mb = downloaded / (1024 * 1024);
                let total_mb = expected_size / (1024 * 1024);
                self.notify(&format!(
                    "Downloading models... {} MB / {} MB",
                    progress_mb, total_mb
                ));
                last_notified_mb = current_mb;
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
