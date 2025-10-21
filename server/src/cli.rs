/// CLI argument parsing and help text

pub fn print_help() {
    let version = env!("CARGO_PKG_VERSION");
    println!("Porua TTS Server v{}", version);
    println!("High-performance Text-to-Speech HTTP server powered by Kokoro TTS");
    println!();
    println!("USAGE:");
    println!("    porua_server [OPTIONS] [TEXT]");
    println!();
    println!("OPTIONS:");
    println!("    --server              Start HTTP server mode");
    println!("    --port <PORT>         Server port (default: 3000)");
    println!("    -h, --help            Print this help message");
    println!("    -v, --version         Print version information");
    println!();
    println!("EXAMPLES:");
    println!("    # Start HTTP server on default port 3000");
    println!("    porua_server --server");
    println!();
    println!("    # Start server on custom port");
    println!("    porua_server --server --port 8080");
    println!();
    println!("    # CLI mode: Generate speech from text");
    println!("    porua_server \"Hello, world!\"");
    println!();
    println!("    # CLI mode saves to output.wav and output.json by default");
    println!();
    println!("SERVER ENDPOINTS:");
    println!("    POST   /tts          - Generate speech from text");
    println!("    POST   /tts/stream   - Stream speech with chunked response");
    println!("    GET    /voices       - List available voices");
    println!("    GET    /health       - Health check");
    println!("    GET    /stats        - Pool statistics");
    println!();
    println!("ENVIRONMENT VARIABLES:");
    println!("    TTS_MODEL_DIR                    - Directory containing TTS models");
    println!("    TTS_POOL_SIZE                    - Number of TTS engines (default: 2)");
    println!("    PIPER_ESPEAKNG_DATA_DIRECTORY    - Path to espeak-ng-data parent directory");
    println!("    TTS_API_KEY_FILE                 - Path to API keys file");
    println!(
        "    RATE_LIMIT_MODE                  - Rate limit mode (auto/per-key/per-ip/disabled)"
    );
    println!("    REQUEST_TIMEOUT_SECONDS          - Request timeout in seconds (default: 60)");
    println!("    RUST_LOG                         - Log level (error/warn/info/debug/trace)");
    println!();
    println!("CONFIGURATION:");
    println!("    Settings can be configured via .env file in:");
    println!("    - Installation directory (e.g., ~/.local/porua/.env)");
    println!("    - Current working directory");
    println!();
    println!("For more information, visit: https://github.com/yourusername/porua");
}

pub fn print_version() {
    println!("Porua Server v{}", env!("CARGO_PKG_VERSION"));
}
