mod audio;
mod auth;
mod chunking;
mod config;
mod error;
mod kokoro;
mod models;
mod rate_limit;
mod server;
mod services;
mod text_processing;
mod utils;

use auth::load_api_keys;
use kokoro::model_paths::{get_model_path, get_voices_path};
use kokoro::voice_config::Voice;
use kokoro::{TTSPool, TTS};
use rate_limit::{PerIpRateLimiter, PerKeyRateLimiter, RateLimitConfig, RateLimiterMode};
use server::{create_router, AppState};
use std::env;
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() -> error::Result<()> {
    // Load .env file if it exists (silently ignore if it doesn't)
    // This allows configuration via .env file without requiring it
    let _ = dotenvy::dotenv();

    // Initialize tracing for logging with environment variable support
    // Default log level is INFO for tts_server, WARN for dependencies
    // This hides noisy voice listings and ONNX logs by default
    // Override with RUST_LOG env var: RUST_LOG=debug for verbose, RUST_LOG=warn for quiet
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("tts_server=info,ort=warn,kokoros=warn")
            }),
        )
        .with_target(false) // Hide module path for cleaner output
        .compact() // Use compact formatting
        .init();

    // Parse command line arguments
    let args: Vec<String> = env::args().collect();

    // Check for --version flag
    if args.contains(&"--version".to_string()) || args.contains(&"-v".to_string()) {
        println!("Porua Server v{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

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
        println!("Porua Server v{}", env!("CARGO_PKG_VERSION"));
        println!("Starting TTS HTTP server on port {}...", port);

        // Load API keys
        let api_keys = load_api_keys();

        // Initialize rate limiter with dual-mode support
        let rate_limiter = load_rate_limit_config(api_keys.is_enabled());

        println!("Initializing TTS pool with {} engines...", pool_size);

        let tts_pool = TTSPool::new(
            pool_size,
            model_path.to_str().unwrap(),
            voices_path.to_str().unwrap(),
        )
        .await?;

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
        println!("\nRate Limiting:");
        if let Some(ref limiter) = rate_limiter {
            let config = limiter.config();
            println!("  Status: ENABLED");
            println!("  Mode: {}", limiter.mode_description());
            println!("  Rate: {} requests/second", config.per_second);
            println!("  Burst size: {} requests", config.burst_size);

            match limiter {
                RateLimiterMode::PerKey(_) => {
                    println!("  Each API key has independent rate limits");
                    println!("  Configure: RATE_LIMIT_AUTHENTICATED_PER_SECOND, RATE_LIMIT_AUTHENTICATED_BURST_SIZE");
                }
                RateLimiterMode::PerIp(_) => {
                    println!("  Each IP address has independent rate limits");
                    println!("  Configure: RATE_LIMIT_UNAUTHENTICATED_PER_SECOND, RATE_LIMIT_UNAUTHENTICATED_BURST_SIZE");
                }
            }
            println!("  Set RATE_LIMIT_MODE to change mode (auto, per-key, per-ip, disabled)");
        } else {
            println!("  Status: DISABLED");
            println!("  ⚠️  WARNING: Server is unprotected from abuse");
            println!("  Set RATE_LIMIT_MODE=auto to enable protection");
        }

        // Get request timeout from environment or default to 60 seconds
        let request_timeout = load_request_timeout();
        println!("\nRequest Timeout:");
        println!("  Timeout: {} seconds", request_timeout.as_secs());
        println!("  Configure: REQUEST_TIMEOUT_SECONDS (default: 60)");

        let state = AppState {
            tts_pool: Arc::new(tts_pool),
            api_keys: api_keys.clone(),
            rate_limiter,
            request_timeout,
        };

        let app = create_router(state);

        axum::serve(listener, app).await?;
    } else {
        // CLI mode - use single TTS instance
        println!("Initializing TTS engine for CLI mode...");

        let tts = TTS::new(model_path.to_str().unwrap(), voices_path.to_str().unwrap()).await?;

        let text = if args.len() > 1 {
            args[1..].join(" ")
        } else {
            "Hello, this is Kokoro TTS speaking!".to_string()
        };

        println!("Generating speech for: \"{}\"", text);

        // Select voice using the enum
        let voice = Voice::BritishFemaleLily;
        let voice_config = voice.config();

        println!(
            "Using voice: {} ({})",
            voice_config.name, voice_config.description
        );

        // Normalize text for TTS (semantic + unicode normalization)
        let normalized_text = text_processing::normalization::normalize_simple(&text);

        // Generate speech with selected voice and normal speed
        let output_path = "output.wav";
        tts.speak(&normalized_text, output_path, voice.id(), 1.0)?;

        println!("Speech saved to {}", output_path);

        // Generate timing metadata
        println!("\nGenerating timing metadata...");

        // Read the generated WAV file
        let audio_bytes = std::fs::read(output_path)?;

        // Build metadata using shared function
        let metadata = services::metadata_builder::build_metadata(&audio_bytes, &text, 0, 0.0)?;

        // Save metadata to JSON file
        let metadata_path = "output.json";
        let json = serde_json::to_string_pretty(&metadata)?;
        std::fs::write(metadata_path, json)?;

        println!("Metadata saved to {}", metadata_path);
        println!("\nTiming Summary:");
        println!("  Total duration: {:.2}s", metadata.duration_ms / 1000.0);
        println!("  Number of phrases: {}", metadata.phrases.len());
        println!("\nPhrase breakdown:");
        for (i, phrase) in metadata.phrases.iter().enumerate() {
            println!(
                "  {}. \"{}\" - {:.2}s @ {:.2}s",
                i + 1,
                phrase.text,
                phrase.duration_ms / 1000.0,
                phrase.start_ms / 1000.0
            );
        }
    }

    Ok(())
}

/// Load rate limit configuration based on environment variables and API key status
fn load_rate_limit_config(api_keys_enabled: bool) -> Option<RateLimiterMode> {
    // Parse RATE_LIMIT_MODE environment variable
    let mode = env::var("RATE_LIMIT_MODE")
        .unwrap_or_else(|_| "auto".to_string())
        .to_lowercase();

    match mode.as_str() {
        "disabled" => None,
        "per-key" => {
            let config = load_authenticated_config();
            Some(RateLimiterMode::PerKey(PerKeyRateLimiter::new(config)))
        }
        "per-ip" => {
            let config = load_unauthenticated_config();
            Some(RateLimiterMode::PerIp(PerIpRateLimiter::new(config)))
        }
        "auto" | _ => {
            // Auto mode: choose based on API key status
            if api_keys_enabled {
                let config = load_authenticated_config();
                Some(RateLimiterMode::PerKey(PerKeyRateLimiter::new(config)))
            } else {
                let config = load_unauthenticated_config();
                Some(RateLimiterMode::PerIp(PerIpRateLimiter::new(config)))
            }
        }
    }
}

/// Load configuration for authenticated (per-key) rate limiting
fn load_authenticated_config() -> RateLimitConfig {
    let per_second = env::var("RATE_LIMIT_AUTHENTICATED_PER_SECOND")
        .or_else(|_| env::var("RATE_LIMIT_PER_SECOND"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let burst_size = env::var("RATE_LIMIT_AUTHENTICATED_BURST_SIZE")
        .or_else(|_| env::var("RATE_LIMIT_BURST_SIZE"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);

    RateLimitConfig {
        per_second,
        burst_size,
    }
}

/// Load configuration for unauthenticated (per-IP) rate limiting
fn load_unauthenticated_config() -> RateLimitConfig {
    let per_second = env::var("RATE_LIMIT_UNAUTHENTICATED_PER_SECOND")
        .or_else(|_| env::var("RATE_LIMIT_PER_SECOND"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5); // More restrictive default for unauthenticated

    let burst_size = env::var("RATE_LIMIT_UNAUTHENTICATED_BURST_SIZE")
        .or_else(|_| env::var("RATE_LIMIT_BURST_SIZE"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10); // More restrictive default for unauthenticated

    RateLimitConfig {
        per_second,
        burst_size,
    }
}

/// Load request timeout configuration from environment variable
fn load_request_timeout() -> Duration {
    let timeout_seconds = env::var("REQUEST_TIMEOUT_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60); // Default to 60 seconds

    Duration::from_secs(timeout_seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_request_timeout_default() {
        // Clear environment variable to test default
        env::remove_var("REQUEST_TIMEOUT_SECONDS");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(60),
            "Default timeout should be 60 seconds"
        );
    }

    #[test]
    fn test_load_request_timeout_custom() {
        // Set custom timeout
        env::set_var("REQUEST_TIMEOUT_SECONDS", "120");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(120),
            "Custom timeout should be 120 seconds"
        );

        // Cleanup
        env::remove_var("REQUEST_TIMEOUT_SECONDS");
    }

    #[test]
    fn test_load_request_timeout_invalid_falls_back_to_default() {
        // Set invalid timeout value
        env::set_var("REQUEST_TIMEOUT_SECONDS", "invalid");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(60),
            "Invalid timeout should fall back to 60 seconds"
        );

        // Cleanup
        env::remove_var("REQUEST_TIMEOUT_SECONDS");
    }

    #[test]
    fn test_load_request_timeout_negative_falls_back_to_default() {
        // Set negative timeout value
        env::set_var("REQUEST_TIMEOUT_SECONDS", "-1");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(60),
            "Negative timeout should fall back to 60 seconds"
        );

        // Cleanup
        env::remove_var("REQUEST_TIMEOUT_SECONDS");
    }

    #[test]
    fn test_load_request_timeout_zero_is_valid() {
        // Set zero timeout (edge case - effectively disables timeout)
        env::set_var("REQUEST_TIMEOUT_SECONDS", "0");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(0),
            "Zero timeout should be accepted"
        );

        // Cleanup
        env::remove_var("REQUEST_TIMEOUT_SECONDS");
    }

    #[test]
    fn test_load_request_timeout_large_value() {
        // Test large timeout value (e.g., 1 hour)
        env::set_var("REQUEST_TIMEOUT_SECONDS", "3600");

        let timeout = load_request_timeout();
        assert_eq!(
            timeout,
            Duration::from_secs(3600),
            "Large timeout should be accepted"
        );

        // Cleanup
        env::remove_var("REQUEST_TIMEOUT_SECONDS");
    }
}
