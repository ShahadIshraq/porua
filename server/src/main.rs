mod kokoro;
mod server;
mod chunking;
mod auth;

use kokoro::model_paths::{get_model_path, get_voices_path};
use kokoro::voice_config::Voice;
use kokoro::{TTS, TTSPool};
use server::{create_router, AppState};
use auth::load_api_keys;
use std::env;
use std::sync::Arc;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for logging with environment variable support
    // Default log level is INFO for tts_server, WARN for dependencies
    // This hides noisy voice listings and ONNX logs by default
    // Override with RUST_LOG env var: RUST_LOG=debug for verbose, RUST_LOG=warn for quiet
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("tts_server=info,ort=warn,kokoros=warn"))
        )
        .with_target(false)  // Hide module path for cleaner output
        .compact()           // Use compact formatting
        .init();

    // Parse command line arguments
    let args: Vec<String> = env::args().collect();

    // Check if we should run in server mode
    let server_mode = args.contains(&"--server".to_string());
    let port = args
        .iter()
        .position(|arg| arg == "--port")
        .and_then(|pos| args.get(pos + 1))
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3000);

    // Get TTS pool size from environment or default to 2
    let pool_size = env::var("TTS_POOL_SIZE")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(2);

    // Get model paths
    let model_path = get_model_path();
    let voices_path = get_voices_path();

    println!("Loading model from: {}", model_path.display());
    println!("Loading voices from: {}", voices_path.display());

    if server_mode {
        // Server mode - initialize pool
        println!("Starting TTS HTTP server on port {}...", port);

        // Load API keys
        let api_keys = load_api_keys();

        println!("Initializing TTS pool with {} engines...", pool_size);

        let tts_pool = TTSPool::new(
            pool_size,
            model_path.to_str().unwrap(),
            voices_path.to_str().unwrap(),
        )
        .await?;

        let state = AppState {
            tts_pool: Arc::new(tts_pool),
            api_keys: api_keys.clone(),
        };

        let app = create_router(state);
        let addr = format!("0.0.0.0:{}", port);
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        println!("\nServer listening on http://{}", addr);
        println!("\nAvailable endpoints:");
        println!("  POST   /tts          - Generate speech from text");
        println!("  POST   /tts/stream   - Generate speech with streaming response");
        println!("  GET    /voices       - List available voices");
        println!("  GET    /health       - Health check");
        println!("  GET    /stats        - Pool statistics");
        println!("\nPool configuration:");
        println!("  Pool size: {} engines", pool_size);
        println!("  Set TTS_POOL_SIZE environment variable to change");
        println!("\nAuthentication:");
        if api_keys.is_enabled() {
            println!("  Status: ENABLED ({} key(s) configured)", api_keys.count());
            println!("  Use X-API-Key or Authorization: Bearer header");
        } else {
            println!("  Status: DISABLED (no key file found)");
            println!("  Set TTS_API_KEY_FILE or create ./api_keys.txt to enable");
        }

        axum::serve(listener, app).await?;
    } else {
        // CLI mode - use single TTS instance
        println!("Initializing TTS engine for CLI mode...");

        let tts = TTS::new(
            model_path.to_str().unwrap(),
            voices_path.to_str().unwrap(),
        )
        .await?;

        let text = if args.len() > 1 {
            args[1..].join(" ")
        } else {
            "Hello, this is Kokoro TTS speaking!".to_string()
        };

        println!("Generating speech for: \"{}\"", text);

        // Select voice using the enum
        let voice = Voice::BritishFemaleLily;
        let voice_config = voice.config();

        println!("Using voice: {} ({})", voice_config.name, voice_config.description);

        // Generate speech with selected voice and normal speed
        tts.speak(&text, "output.wav", voice.id(), 1.0)?;

        println!("Speech saved to output.wav");
    }

    Ok(())
}
