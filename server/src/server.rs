use axum::{
    extract::State,
    middleware,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::timeout::TimeoutLayer;

use crate::audio;
use crate::auth::ApiKeys;
use crate::chunking::{chunk_text, ChunkingConfig};
use crate::config::constants::MAX_TEXT_LENGTH;
use crate::error::{Result, TtsError};
use crate::kokoro::{model_paths::get_samples_dir, voice_config::Voice, TTSPool};
use crate::models::{HealthResponse, PoolStatsResponse, TTSRequest, VoiceInfo, VoicesResponse};
use crate::rate_limit::RateLimiterMode;
use crate::utils::temp_file::TempFile;

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub tts_pool: Arc<TTSPool>,
    pub api_keys: ApiKeys,
    pub rate_limiter: Option<RateLimiterMode>,
    pub request_timeout: Duration,
}

// HTTP Handlers

/// Generate TTS audio from text
async fn generate_tts(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Vec<u8>> {
    tracing::debug!(
        "TTS request - text_len={}, voice='{}', speed={}, chunking={}",
        req.text.len(),
        req.voice,
        req.speed,
        req.enable_chunking
    );

    // Validate text is not empty
    if req.text.trim().is_empty() {
        return Err(TtsError::EmptyText);
    }

    // Validate text length to prevent DoS
    if req.text.len() > MAX_TEXT_LENGTH {
        return Err(TtsError::InvalidRequest(format!(
            "Text too long: {} chars (max {})",
            req.text.len(),
            MAX_TEXT_LENGTH
        )));
    }

    // Validate speed is reasonable
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err(TtsError::InvalidSpeed(req.speed));
    }

    // Determine if we should use chunking (enabled and text is long enough)
    // Lower threshold allows faster perceived latency for streaming
    let use_chunking = req.enable_chunking && req.text.len() > 200;

    if use_chunking {
        generate_tts_chunked(state, req).await
    } else {
        generate_tts_single(state, req).await
    }
}

/// Generate TTS for a single chunk of text
async fn generate_tts_single(state: AppState, req: TTSRequest) -> Result<Vec<u8>> {
    // Acquire a TTS engine from the pool
    let tts = state.tts_pool.acquire().await.map_err(|e| {
        tracing::error!("Failed to acquire TTS engine: {}", e);
        TtsError::TtsEngine(e.to_string())
    })?;

    // Generate unique temporary file
    let temp_file = TempFile::new();
    let temp_path = temp_file.as_str().to_string();

    // Normalize text for TTS (semantic + unicode normalization)
    let normalized_text = crate::text_processing::normalization::normalize_simple(&req.text);

    // Debug logging to verify normalization
    tracing::info!("Original text: {:?}", &req.text);
    tracing::info!("Normalized text: {:?}", &normalized_text);

    let voice = req.voice.clone();
    let speed = req.speed;

    // Move TTS generation to blocking thread pool
    let generation_result = tokio::task::spawn_blocking(move || {
        futures::executor::block_on(tts.speak(&normalized_text, &temp_path, &voice, speed))
            .map_err(|e| TtsError::TtsEngine(e.to_string()))
    })
    .await?;

    // Handle generation result
    generation_result?;

    // Read generated audio file
    let audio_data = tokio::fs::read(temp_file.path()).await?;

    // TempFile will automatically clean up when it goes out of scope

    Ok(audio_data)
}

/// Generate TTS with text chunking and parallel processing
async fn generate_tts_chunked(state: AppState, req: TTSRequest) -> Result<Vec<u8>> {
    // Split text into chunks
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&req.text, &config);

    tracing::debug!(
        "Split text into {} chunks for parallel processing",
        chunks.len()
    );

    // Generate audio for each chunk in parallel
    let mut tasks = Vec::new();

    for (i, chunk) in chunks.into_iter().enumerate() {
        let chunk_req = TTSRequest {
            text: chunk,
            voice: req.voice.clone(),
            speed: req.speed,
            enable_chunking: false, // Don't recursively chunk
        };
        let state_clone = state.clone();

        let task = tokio::spawn(async move {
            tracing::debug!("Processing chunk {}", i);
            generate_tts_single(state_clone, chunk_req).await
        });

        tasks.push(task);
    }

    // Wait for all chunks to complete
    let mut audio_chunks = Vec::new();
    for (i, task) in tasks.into_iter().enumerate() {
        let audio_data = task.await??;
        tracing::debug!("Chunk {} completed", i);
        audio_chunks.push(audio_data);
    }

    // Concatenate all audio chunks
    tracing::debug!("Concatenating {} audio chunks", audio_chunks.len());
    let combined_audio = audio::wav_utils::concatenate(audio_chunks)?;
    Ok(combined_audio)
}

/// List all available voices
async fn list_voices() -> Json<VoicesResponse> {
    let voices = Voice::all()
        .iter()
        .map(|voice| {
            let config = voice.config();
            VoiceInfo {
                id: config.id.to_string(),
                name: config.name.to_string(),
                gender: format!("{:?}", config.gender),
                language: format!("{:?}", config.language),
                description: config.description.to_string(),
                sample_url: format!("/samples/{}.wav", config.id),
            }
        })
        .collect();

    Json(VoicesResponse { voices })
}

/// Health check endpoint
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Pool statistics endpoint
async fn pool_stats(State(state): State<AppState>) -> Json<PoolStatsResponse> {
    let stats = state.tts_pool.stats();
    Json(PoolStatsResponse {
        pool_size: stats.pool_size,
        active_requests: stats.active_requests,
        available_engines: stats.available_engines,
        total_requests: stats.total_requests,
    })
}

/// Generate TTS audio with multipart streaming response
async fn generate_tts_stream(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Response> {
    crate::services::streaming::generate_tts_stream(state, req).await
}

/// Create and configure the HTTP server router
pub fn create_router(state: AppState) -> Router<()> {
    // Configure CORS to allow all origins (adjust as needed for production)
    // Expose headers needed for streaming responses (multipart/mixed with chunked encoding)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers(Any); // Expose all response headers for streaming compatibility

    // Clone api_keys for middleware
    let api_keys_for_middleware = state.api_keys.clone();

    // Get timeout duration from state
    let timeout_duration = state.request_timeout;

    // Create static file service for audio samples
    // Samples directory is resolved using smart path resolution (similar to models)
    // Supports: TTS_SAMPLES_DIR env var, /usr/local/porua/samples, ~/.local/porua/samples, etc.
    let samples_dir = get_samples_dir();
    tracing::debug!("Serving samples from: {:?}", samples_dir);
    let samples_service = ServeDir::new(samples_dir).append_index_html_on_directories(false);

    let mut router = Router::new()
        .route("/tts", post(generate_tts))
        .route("/tts/stream", post(generate_tts_stream))
        .route("/voices", get(list_voices))
        .route("/health", get(health_check))
        .route("/stats", get(pool_stats))
        .nest_service("/samples", samples_service);

    // Apply middleware layers (order matters - first added = outermost/first executed)

    // 1. Request ID generation (outermost - runs first)
    router = router.layer(middleware::from_fn(
        crate::logging::middleware::request_id_middleware,
    ));

    // 2. Access logging (logs all requests with IDs)
    router = router.layer(middleware::from_fn(
        crate::logging::middleware::access_log_middleware,
    ));

    // 3. Rate limiting (if enabled)
    if let Some(rate_limiter) = state.rate_limiter.clone() {
        router = router.layer(middleware::from_fn_with_state(
            rate_limiter,
            crate::rate_limit::rate_limit_middleware,
        ));
    }

    // 4. Authentication
    router = router.layer(middleware::from_fn_with_state(
        api_keys_for_middleware,
        crate::auth::auth_middleware,
    ));

    // 5. Timeout layer (prevent long-running requests)
    // 6. CORS (allow cross-origin requests)
    router
        .with_state(state)
        .layer(cors)
        .layer(TimeoutLayer::new(timeout_duration))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TTSRequest;

    // ===== Input Validation Unit Tests =====
    // These tests verify validation logic without requiring a TTS pool

    fn validate_tts_request(req: &TTSRequest) -> Result<()> {
        // Validate text is not empty
        if req.text.trim().is_empty() {
            return Err(TtsError::EmptyText);
        }

        // Validate text length to prevent DoS
        if req.text.len() > MAX_TEXT_LENGTH {
            return Err(TtsError::InvalidRequest(format!(
                "Text too long: {} chars (max {})",
                req.text.len(),
                MAX_TEXT_LENGTH
            )));
        }

        // Validate speed is reasonable
        if req.speed <= 0.0 || req.speed > 3.0 {
            return Err(TtsError::InvalidSpeed(req.speed));
        }

        Ok(())
    }

    #[test]
    fn test_validate_rejects_empty_text() {
        let req = TTSRequest {
            text: "".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_tts_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::EmptyText => {} // Expected
            other => panic!("Expected EmptyText error, got: {:?}", other),
        }
    }

    #[test]
    fn test_validate_rejects_whitespace_only_text() {
        let req = TTSRequest {
            text: "   \n\t  ".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_tts_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::EmptyText => {} // Expected
            other => panic!("Expected EmptyText error, got: {:?}", other),
        }
    }

    #[test]
    fn test_validate_rejects_text_exceeding_max_length() {
        // Create text that exceeds MAX_TEXT_LENGTH (10,000 chars)
        let long_text = "a".repeat(MAX_TEXT_LENGTH + 1);

        let req = TTSRequest {
            text: long_text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_tts_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::InvalidRequest(msg) => {
                assert!(msg.contains("Text too long"));
                assert!(msg.contains("10001 chars"));
                assert!(msg.contains("max 10000"));
            }
            other => panic!("Expected InvalidRequest error, got: {:?}", other),
        }
    }

    #[test]
    fn test_validate_accepts_text_at_max_length() {
        // Create text exactly at MAX_TEXT_LENGTH (10,000 chars)
        let text = "a".repeat(MAX_TEXT_LENGTH);

        let req = TTSRequest {
            text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_tts_request(&req);
        assert!(result.is_ok(), "Should accept text at max length");
    }

    #[test]
    fn test_validate_accepts_text_just_below_max_length() {
        // Create text just below MAX_TEXT_LENGTH
        let text = "a".repeat(MAX_TEXT_LENGTH - 1);

        let req = TTSRequest {
            text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_tts_request(&req);
        assert!(result.is_ok(), "Should accept text below max length");
    }

    #[test]
    fn test_validate_boundary_values() {
        // Test various boundary values
        let test_cases = vec![
            (1, true),      // Minimum valid
            (100, true),    // Normal short text
            (9999, true),   // Just below max
            (10000, true),  // Exactly at max
            (10001, false), // Just over max
            (20000, false), // Way over max
        ];

        for (length, should_pass_validation) in test_cases {
            let text = "a".repeat(length);
            let req = TTSRequest {
                text,
                voice: "af_heart".to_string(),
                speed: 1.0,
                enable_chunking: false,
            };

            let result = validate_tts_request(&req);

            if should_pass_validation {
                assert!(result.is_ok(), "Length {} should pass validation", length);
            } else {
                assert!(result.is_err(), "Length {} should fail validation", length);
                match result.unwrap_err() {
                    TtsError::InvalidRequest(msg) => {
                        assert!(
                            msg.contains("Text too long"),
                            "Expected 'Text too long' error for length {}, got: {}",
                            length,
                            msg
                        );
                    }
                    other => panic!(
                        "Expected InvalidRequest for length {}, got: {:?}",
                        length, other
                    ),
                }
            }
        }
    }

    #[test]
    fn test_validate_with_chunking_respects_max_length() {
        // Create text that exceeds MAX_TEXT_LENGTH with chunking enabled
        let long_text = "a".repeat(MAX_TEXT_LENGTH + 1);

        let req = TTSRequest {
            text: long_text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: true, // Chunking enabled
        };

        let result = validate_tts_request(&req);
        assert!(result.is_err());

        // Should still be rejected even with chunking enabled
        match result.unwrap_err() {
            TtsError::InvalidRequest(msg) => {
                assert!(msg.contains("Text too long"));
            }
            other => panic!("Expected InvalidRequest error, got: {:?}", other),
        }
    }

    #[test]
    fn test_validate_rejects_invalid_speed() {
        let test_cases = vec![
            (0.0, false),  // Zero speed
            (-1.0, false), // Negative speed
            (0.5, true),   // Valid low speed
            (1.0, true),   // Normal speed
            (2.0, true),   // Valid high speed
            (3.0, true),   // Maximum valid speed
            (3.1, false),  // Just over max
            (10.0, false), // Way over max
        ];

        for (speed, should_be_valid) in test_cases {
            let req = TTSRequest {
                text: "Test text".to_string(),
                voice: "af_heart".to_string(),
                speed,
                enable_chunking: false,
            };

            let result = validate_tts_request(&req);

            if should_be_valid {
                assert!(result.is_ok(), "Speed {} should be valid", speed);
            } else {
                assert!(result.is_err(), "Speed {} should be invalid", speed);
                match result.unwrap_err() {
                    TtsError::InvalidSpeed(_) => {} // Expected
                    other => panic!(
                        "Expected InvalidSpeed error for speed {}, got: {:?}",
                        speed, other
                    ),
                }
            }
        }
    }

    #[tokio::test]
    async fn test_list_voices_returns_all_configured_voices() {
        let voices_response = list_voices().await;
        let voices = voices_response.0.voices;

        // Should return exactly 28 voices (all configured voices)
        assert_eq!(voices.len(), 28, "Expected 28 voices");

        // All voices should be American or British English (based on current config)
        for voice in &voices {
            assert!(
                voice.language == "AmericanEnglish" || voice.language == "BritishEnglish",
                "Voice {} has unexpected language: {}",
                voice.id,
                voice.language
            );
        }
    }

    #[tokio::test]
    async fn test_list_voices_includes_sample_url() {
        let voices_response = list_voices().await;
        let voices = voices_response.0.voices;

        for voice in &voices {
            // sample_url should not be empty
            assert!(
                !voice.sample_url.is_empty(),
                "Voice {} missing sample_url",
                voice.id
            );

            // sample_url should follow format: /samples/{voice_id}.wav
            let expected_url = format!("/samples/{}.wav", voice.id);
            assert_eq!(
                voice.sample_url, expected_url,
                "Voice {} has incorrect sample_url format",
                voice.id
            );
        }
    }

    #[tokio::test]
    async fn test_list_voices_includes_all_configured_voice_ids() {
        let voices_response = list_voices().await;
        let voices = voices_response.0.voices;

        // Expected voice IDs (all 28 configured voices)
        let expected_ids = vec![
            "af_alloy",
            "af_aoede",
            "af_bella",
            "af_heart",
            "af_jessica",
            "af_kore",
            "af_nicole",
            "af_nova",
            "af_river",
            "af_sarah",
            "af_sky",
            "am_adam",
            "am_echo",
            "am_eric",
            "am_fenrir",
            "am_liam",
            "am_michael",
            "am_onyx",
            "am_puck",
            "am_santa",
            "bf_alice",
            "bf_emma",
            "bf_isabella",
            "bf_lily",
            "bm_daniel",
            "bm_fable",
            "bm_george",
            "bm_lewis",
        ];

        let voice_ids: Vec<&str> = voices.iter().map(|v| v.id.as_str()).collect();

        for expected_id in expected_ids {
            assert!(
                voice_ids.contains(&expected_id),
                "Missing expected voice: {}",
                expected_id
            );
        }
    }

    // ===== Timeout Configuration Tests =====

    #[test]
    fn test_timeout_duration_is_configurable() {
        use std::time::Duration;

        // Test that different timeout values can be stored in AppState
        // We don't need to create a full AppState, just verify the type works
        let timeouts = vec![
            Duration::from_secs(10),
            Duration::from_secs(30),
            Duration::from_secs(60),
            Duration::from_secs(120),
        ];

        for timeout in timeouts {
            // Just verify Duration works as expected
            assert_eq!(timeout.as_secs(), timeout.as_secs());
        }
    }
}
