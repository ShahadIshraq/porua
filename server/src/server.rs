use axum::{
    extract::State,
    http::header,
    middleware,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use hound::{WavReader, WavWriter, SampleFormat};
use std::io::Cursor;

use crate::kokoro::{
    voice_config::Voice,
    TTSPool,
};
use crate::chunking::{chunk_text, ChunkingConfig};
use crate::auth::ApiKeys;
use crate::error::{Result, TtsError};
use crate::utils::temp_file::TempFile;
use crate::models::{TTSRequest, VoiceInfo, VoicesResponse, HealthResponse, PoolStatsResponse};
use crate::audio;

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub tts_pool: Arc<TTSPool>,
    pub api_keys: ApiKeys,
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
async fn generate_tts_single(
    state: AppState,
    req: TTSRequest,
) -> Result<Vec<u8>> {
    // Acquire a TTS engine from the pool
    let tts = state.tts_pool.acquire().await
        .map_err(|e| {
            tracing::error!("Failed to acquire TTS engine: {}", e);
            TtsError::TtsEngine(e.to_string())
        })?;

    // Generate unique temporary file
    let temp_file = TempFile::new();
    let temp_path = temp_file.as_str().to_string();

    let text = req.text.clone();
    let voice = req.voice.clone();
    let speed = req.speed;

    // Move TTS generation to blocking thread pool
    let generation_result = tokio::task::spawn_blocking(move || {
        futures::executor::block_on(tts.speak(&text, &temp_path, &voice, speed))
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
async fn generate_tts_chunked(
    state: AppState,
    req: TTSRequest,
) -> Result<Vec<u8>> {
    // Split text into chunks
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&req.text, &config);

    tracing::debug!("Split text into {} chunks for parallel processing", chunks.len());

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
            }
        })
        .collect();

    Json(VoicesResponse { voices })
}

/// Health check endpoint
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
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
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Clone api_keys for middleware
    let api_keys_for_middleware = state.api_keys.clone();

    Router::new()
        .route("/tts", post(generate_tts))
        .route("/tts/stream", post(generate_tts_stream))
        .route("/voices", get(list_voices))
        .route("/health", get(health_check))
        .route("/stats", get(pool_stats))
        .layer(middleware::from_fn_with_state(
            api_keys_for_middleware,
            crate::auth::auth_middleware,
        ))
        .with_state(state)
        .layer(cors)
}

