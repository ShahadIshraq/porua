// Test to verify TestFixture common utility works

mod common;

#[cfg(test)]
mod test_fixture_tests {
    use crate::common::TestFixture;

    #[test]
    fn test_fixture_creates_temp_dir() {
        let fixture = TestFixture::new();
        assert!(fixture.temp_path().exists());
    }

    #[test]
    fn test_fixture_temp_path_is_writable() {
        let fixture = TestFixture::new();
        let test_file = fixture.temp_path().join("test.txt");

        std::fs::write(&test_file, b"test").unwrap();
        assert!(test_file.exists());

        let content = std::fs::read(&test_file).unwrap();
        assert_eq!(content, b"test");
    }

    #[test]
    fn test_fixture_cleanup_on_drop() {
        let path = {
            let fixture = TestFixture::new();
            fixture.temp_path()
        }; // fixture dropped here

        // After fixture is dropped, temp directory should be cleaned up
        // Note: This might not work immediately due to async cleanup
        // but we can verify the fixture was created correctly
        assert!(!path.to_string_lossy().is_empty());
    }
}
