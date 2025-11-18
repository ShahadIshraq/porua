pub mod test_app;

use std::path::PathBuf;
use tempfile::TempDir;

/// Test fixture for screen capture tests
pub struct TestFixture {
    pub temp_dir: TempDir,
}

impl TestFixture {
    pub fn new() -> Self {
        Self {
            temp_dir: TempDir::new().unwrap(),
        }
    }

    pub fn temp_path(&self) -> PathBuf {
        self.temp_dir.path().to_path_buf()
    }
}

impl Default for TestFixture {
    fn default() -> Self {
        Self::new()
    }
}
