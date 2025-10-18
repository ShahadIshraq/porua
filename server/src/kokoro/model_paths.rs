use std::env;
use std::path::PathBuf;

// Search multiple standard paths for models
pub fn find_model_file(filename: &str) -> PathBuf {
    let search_paths = vec![
        // 1. Environment variable (highest priority)
        env::var("TTS_MODEL_DIR").ok().map(PathBuf::from),
        // 2. AWS Lambda container image standard location
        Some(PathBuf::from("/opt/models")),
        // 3. System-wide installation paths
        Some(PathBuf::from("/usr/local/share/tts-server/models")),
        Some(PathBuf::from("/opt/tts-server/models")),
        // 4. User home directory
        env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".tts-server/models")),
        // 5. Current directory (for local development)
        Some(PathBuf::from("models")),
        // 6. Relative to executable (for dev builds in target/release/)
        env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|p| p.join("../../models"))),
    ];

    // Search all paths in order
    for base_path in search_paths.into_iter().flatten() {
        let model_path = base_path.join(filename);
        if model_path.exists() {
            return model_path;
        }
    }

    // Fallback: return expected path even if it doesn't exist
    // (will trigger helpful error message from TTS library)
    PathBuf::from("models").join(filename)
}

pub fn get_model_path() -> PathBuf {
    find_model_file("kokoro-v1.0.onnx")
}

pub fn get_voices_path() -> PathBuf {
    find_model_file("voices-v1.0.bin")
}
