// Test to verify test infrastructure is working

#[cfg(test)]
mod infrastructure_tests {
    use tempfile::TempDir;
    use std::fs;

    #[test]
    fn test_infrastructure_basic() {
        // Verify basic test functionality
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_tempfile_dependency() {
        // Verify tempfile dependency works
        let temp_dir = TempDir::new().unwrap();
        assert!(temp_dir.path().exists());
    }

    #[test]
    fn test_fs_operations() {
        // Verify filesystem operations work in tests
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        fs::write(&file_path, b"test content").unwrap();
        assert!(file_path.exists());

        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "test content");
    }

    #[tokio::test]
    async fn test_async_functionality() {
        // Verify async tests work
        let result = async_helper().await;
        assert_eq!(result, 42);
    }

    async fn async_helper() -> i32 {
        42
    }
}
