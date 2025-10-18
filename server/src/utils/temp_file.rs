use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

/// Automatically cleaned-up temporary file
pub struct TempFile {
    path: PathBuf,
}

impl Default for TempFile {
    fn default() -> Self {
        Self::new()
    }
}

impl TempFile {
    /// Create a new temporary file with .wav extension
    pub fn new() -> Self {
        let path = std::env::temp_dir().join(format!("tts_{}.wav", Uuid::new_v4()));
        Self { path }
    }

    /// Get the path to the temporary file
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Convert to string path
    pub fn as_str(&self) -> &str {
        self.path.to_str().unwrap_or("")
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        // Spawn cleanup task (best effort, logged but not awaited)
        let path = self.path.clone();
        tokio::spawn(async move {
            if let Err(e) = fs::remove_file(&path).await {
                tracing::debug!("Failed to cleanup temp file {:?}: {}", path, e);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_temp_file_cleanup() {
        let path = {
            let temp = TempFile::new();
            fs::write(temp.path(), b"test").await.unwrap();
            assert!(temp.path().exists());
            temp.path().to_path_buf()
        };

        // Give cleanup task time to run
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // File should be cleaned up
        assert!(!path.exists());
    }
}
