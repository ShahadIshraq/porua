use std::env;
use std::path::PathBuf;

// Search multiple standard paths for models
pub fn find_model_file(filename: &str) -> PathBuf {
    // 1. If TTS_MODEL_DIR is explicitly set, ONLY check that location
    // This ensures the environment variable is strictly respected when configured
    if let Ok(model_dir) = env::var("TTS_MODEL_DIR") {
        let explicit_path = PathBuf::from(model_dir);
        let model_path = explicit_path.join(filename);

        // If the file exists at the explicit path, use it
        if model_path.exists() {
            return model_path;
        }

        // If TTS_MODEL_DIR is set but file doesn't exist, still return that path
        // This gives a clear error message about the configured location
        // Only fall through to search paths if the directory itself doesn't exist
        if explicit_path.exists() {
            return model_path;
        }
        // If TTS_MODEL_DIR points to a non-existent directory, fall through to search
    }

    // 2. Search fallback paths (only if TTS_MODEL_DIR not set or points to invalid location)
    let search_paths = vec![
        // AWS Lambda container image standard location
        Some(PathBuf::from("/opt/models")),
        // System-wide installation paths
        Some(PathBuf::from("/usr/local/porua/models")),
        Some(PathBuf::from("/usr/local/share/tts-server/models")),
        Some(PathBuf::from("/opt/tts-server/models")),
        // User home directory installations
        env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".local/porua/models")),
        env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".tts-server/models")),
        // Relative to executable (for packaged installations with symlinks)
        env::current_exe().ok().and_then(|path| {
            // Resolve symlinks to find the actual binary location
            std::fs::canonicalize(&path)
                .ok()
                .and_then(|p| p.parent().map(|parent| parent.join("../models")))
        }),
        // Current directory (lowest priority - for local development only)
        Some(PathBuf::from("models")),
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

// Search multiple standard paths for samples directory
pub fn find_samples_dir() -> PathBuf {
    // 1. If TTS_SAMPLES_DIR is explicitly set, ONLY check that location
    if let Ok(samples_dir) = env::var("TTS_SAMPLES_DIR") {
        let explicit_path = PathBuf::from(samples_dir);

        // If the directory exists at the explicit path, use it
        if explicit_path.exists() {
            return explicit_path;
        }

        // If TTS_SAMPLES_DIR is set but directory doesn't exist, still return that path
        // This gives a clear error message about the configured location
        return explicit_path;
    }

    // 2. Search fallback paths (only if TTS_SAMPLES_DIR not set)
    let search_paths = vec![
        // AWS Lambda container image standard location
        Some(PathBuf::from("/opt/samples")),
        // System-wide installation paths
        Some(PathBuf::from("/usr/local/porua/samples")),
        Some(PathBuf::from("/usr/local/share/tts-server/samples")),
        Some(PathBuf::from("/opt/tts-server/samples")),
        // User home directory installations
        env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".local/porua/samples")),
        env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join(".tts-server/samples")),
        // Relative to executable (for packaged installations with symlinks)
        env::current_exe().ok().and_then(|path| {
            // Resolve symlinks to find the actual binary location
            std::fs::canonicalize(&path)
                .ok()
                .and_then(|p| p.parent().map(|parent| parent.join("../samples")))
        }),
        // Current directory (lowest priority - for local development only)
        Some(PathBuf::from("samples")),
    ];

    // Search all paths in order
    for base_path in search_paths.into_iter().flatten() {
        if base_path.exists() {
            return base_path;
        }
    }

    // Fallback: return "samples" for current directory (development mode)
    PathBuf::from("samples")
}

pub fn get_model_path() -> PathBuf {
    find_model_file("kokoro-v1.0.onnx")
}

pub fn get_voices_path() -> PathBuf {
    find_model_file("voices-v1.0.bin")
}

pub fn get_samples_dir() -> PathBuf {
    find_samples_dir()
}
