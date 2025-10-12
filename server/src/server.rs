use axum::{
    body::Bytes,
    extract::State,
    http::{header, StatusCode},
    middleware,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use hound::{WavReader, WavWriter, SampleFormat};
use std::io::Cursor;

use crate::kokoro::{
    voice_config::Voice,
    TTSPool,
};
use crate::chunking::{chunk_text, ChunkingConfig};
use crate::auth::ApiKeys;

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub tts_pool: Arc<TTSPool>,
    pub api_keys: ApiKeys,
}

// Request/Response DTOs
#[derive(Debug, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    #[serde(default = "default_voice")]
    pub voice: String,
    #[serde(default = "default_speed")]
    pub speed: f32,
    #[serde(default = "default_enable_chunking")]
    pub enable_chunking: bool,
}

fn default_enable_chunking() -> bool {
    true
}

fn default_voice() -> String {
    "bf_lily".to_string()
}

fn default_speed() -> f32 {
    1.0
}

#[derive(Debug, Serialize)]
pub struct TTSResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub gender: String,
    pub language: String,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct VoicesResponse {
    pub voices: Vec<VoiceInfo>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
}

// HTTP Handlers

/// Generate TTS audio from text
async fn generate_tts(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Vec<u8>, (StatusCode, Json<TTSResponse>)> {
    tracing::debug!(
        "TTS request - text_len={}, voice='{}', speed={}, chunking={}",
        req.text.len(),
        req.voice,
        req.speed,
        req.enable_chunking
    );

    // Validate text is not empty
    if req.text.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(TTSResponse {
                status: "error".to_string(),
                error: Some("Text cannot be empty".to_string()),
            }),
        ));
    }

    // Validate speed is reasonable
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(TTSResponse {
                status: "error".to_string(),
                error: Some("Speed must be between 0.0 and 3.0".to_string()),
            }),
        ));
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
) -> Result<Vec<u8>, (StatusCode, Json<TTSResponse>)> {
    // Acquire a TTS engine from the pool
    let tts = state.tts_pool.acquire().await
        .map_err(|e| {
            tracing::error!("Failed to acquire TTS engine: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TTSResponse {
                    status: "error".to_string(),
                    error: Some(format!("Failed to acquire TTS engine: {}", e)),
                }),
            )
        })?;

    // Generate unique temporary filename
    let temp_file = format!("/tmp/tts_{}.wav", Uuid::new_v4());
    let temp_file_clone = temp_file.clone();

    let text = req.text.clone();
    let voice = req.voice.clone();
    let speed = req.speed;

    // Move TTS generation to blocking thread pool
    let generation_result = tokio::task::spawn_blocking(move || {
        futures::executor::block_on(tts.speak(&text, &temp_file, &voice, speed))
            .map_err(|e| e.to_string())
    })
    .await;

    // Handle result
    match generation_result {
        Ok(Ok(())) => {
            match tokio::fs::read(&temp_file_clone).await {
                Ok(audio_data) => {
                    let _ = tokio::fs::remove_file(&temp_file_clone).await;
                    Ok(audio_data)
                }
                Err(e) => {
                    tracing::error!("Failed to read audio file: {}", e);
                    Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(TTSResponse {
                            status: "error".to_string(),
                            error: Some(format!("Failed to read audio file: {}", e)),
                        }),
                    ))
                }
            }
        }
        Ok(Err(e)) => {
            tracing::error!("TTS generation failed: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TTSResponse {
                    status: "error".to_string(),
                    error: Some(format!("TTS generation failed: {}", e)),
                }),
            ))
        }
        Err(e) => {
            tracing::error!("Task join error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TTSResponse {
                    status: "error".to_string(),
                    error: Some("Internal task execution error".to_string()),
                }),
            ))
        }
    }
}

/// Generate TTS with text chunking and parallel processing
async fn generate_tts_chunked(
    state: AppState,
    req: TTSRequest,
) -> Result<Vec<u8>, (StatusCode, Json<TTSResponse>)> {
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
        match task.await {
            Ok(Ok(audio_data)) => {
                tracing::debug!("Chunk {} completed", i);
                audio_chunks.push(audio_data);
            }
            Ok(Err(e)) => {
                tracing::error!("Chunk {} failed: {:?}", i, e);
                return Err(e);
            }
            Err(e) => {
                tracing::error!("Chunk {} task failed: {}", i, e);
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(TTSResponse {
                        status: "error".to_string(),
                        error: Some(format!("Chunk processing failed: {}", e)),
                    }),
                ));
            }
        }
    }

    // Concatenate all audio chunks
    tracing::debug!("Concatenating {} audio chunks", audio_chunks.len());
    match concatenate_wav_files(audio_chunks) {
        Ok(combined_audio) => Ok(combined_audio),
        Err(e) => {
            tracing::error!("Failed to concatenate audio: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TTSResponse {
                    status: "error".to_string(),
                    error: Some(format!("Failed to concatenate audio: {}", e)),
                }),
            ))
        }
    }
}

/// Concatenate multiple WAV files into a single WAV file
fn concatenate_wav_files(wav_files: Vec<Vec<u8>>) -> Result<Vec<u8>, String> {
    if wav_files.is_empty() {
        return Err("No audio files to concatenate".to_string());
    }

    if wav_files.len() == 1 {
        return Ok(wav_files.into_iter().next().unwrap());
    }

    // Read the first file to get the WAV spec
    let first_cursor = Cursor::new(&wav_files[0]);
    let first_reader = WavReader::new(first_cursor)
        .map_err(|e| format!("Failed to read first WAV file: {}", e))?;
    let spec = first_reader.spec();

    // Determine sample type based on spec
    match spec.sample_format {
        SampleFormat::Float => concatenate_wav_files_typed::<f32>(wav_files, spec),
        SampleFormat::Int => {
            // Handle different bit depths for integers
            match spec.bits_per_sample {
                16 => concatenate_wav_files_typed::<i16>(wav_files, spec),
                32 => concatenate_wav_files_typed::<i32>(wav_files, spec),
                _ => Err(format!("Unsupported bits per sample: {}", spec.bits_per_sample))
            }
        }
    }
}

/// Generic function to concatenate WAV files with a specific sample type
fn concatenate_wav_files_typed<T>(
    wav_files: Vec<Vec<u8>>,
    spec: hound::WavSpec
) -> Result<Vec<u8>, String>
where
    T: hound::Sample + Copy,
{
    // Collect all samples from all files
    let mut all_samples: Vec<T> = Vec::new();

    for (i, wav_data) in wav_files.iter().enumerate() {
        let cursor = Cursor::new(wav_data);
        let reader = WavReader::new(cursor)
            .map_err(|e| format!("Failed to read WAV file {}: {}", i, e))?;

        // Verify all files have the same spec
        if reader.spec() != spec {
            return Err(format!("WAV file {} has different spec", i));
        }

        // Collect samples
        for sample in reader.into_samples::<T>() {
            let sample = sample.map_err(|e| format!("Failed to read sample: {}", e))?;
            all_samples.push(sample);
        }
    }

    // Write combined WAV to buffer
    let mut output = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut output, spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

        for sample in all_samples {
            writer.write_sample(sample)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }

        writer.finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;
    }

    Ok(output.into_inner())
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

#[derive(Debug, Serialize)]
pub struct PoolStatsResponse {
    pub pool_size: usize,
    pub active_requests: usize,
    pub available_engines: usize,
    pub total_requests: usize,
}

/// Generate TTS audio with streaming response (Hybrid approach)
async fn generate_tts_stream(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Response, (StatusCode, Json<TTSResponse>)> {
    use std::time::Instant;

    let start = Instant::now();

    tracing::debug!(
        "TTS streaming request - text_len={}, voice='{}', speed={}",
        req.text.len(),
        req.voice,
        req.speed
    );

    // Validate text is not empty
    if req.text.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(TTSResponse {
                status: "error".to_string(),
                error: Some("Text cannot be empty".to_string()),
            }),
        ));
    }

    // Validate speed
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(TTSResponse {
                status: "error".to_string(),
                error: Some("Speed must be between 0.0 and 3.0".to_string()),
            }),
        ));
    }

    // Split text into chunks for streaming
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&req.text, &config);

    tracing::debug!("Streaming {} text chunks", chunks.len());

    // Create a channel for streaming chunks
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, String>>(10);

    // Handle edge case: if only one chunk, process normally
    if chunks.len() == 1 {
        let chunk = chunks[0].clone();
        let state_clone = state.clone();
        let voice = req.voice.clone();
        let speed = req.speed;

        tokio::spawn(async move {

            let tts = match state_clone.tts_pool.acquire().await {
                Ok(t) => t,
                Err(e) => {
                    let _ = tx.send(Err(format!("Failed to acquire TTS engine: {}", e))).await;
                    return;
                }
            };

            let temp_file = format!("/tmp/tts_stream_single_{}.wav", Uuid::new_v4());
            let temp_file_clone = temp_file.clone();
            let chunk_clone = chunk.clone();

            let result = tokio::task::spawn_blocking(move || {
                futures::executor::block_on(tts.speak(&chunk_clone, &temp_file, &voice, speed))
                    .map_err(|e| e.to_string())
            })
            .await;

            match result {
                Ok(Ok(())) => {
                    match tokio::fs::read(&temp_file_clone).await {
                        Ok(audio_data) => {
                            let _ = tokio::fs::remove_file(&temp_file_clone).await;
                            let _ = tx.send(Ok(Bytes::from(audio_data))).await;
                        }
                        Err(e) => {
                            let _ = tx.send(Err(format!("Failed to read audio file: {}", e))).await;
                        }
                    }
                }
                Ok(Err(e)) => {
                    let _ = tx.send(Err(format!("TTS generation failed: {}", e))).await;
                }
                Err(e) => {
                    let _ = tx.send(Err(format!("Task join error: {}", e))).await;
                }
            }
        });

        // Return streaming response
        let stream = ReceiverStream::new(rx).map(|result| {
            result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });

        let body = axum::body::Body::from_stream(stream);

        return Ok(Response::builder()
            .header(header::CONTENT_TYPE, "audio/wav")
            .header(header::TRANSFER_ENCODING, "chunked")
            .body(body)
            .unwrap());
    }

    // Split first chunk from rest
    let first_chunk = chunks[0].clone();
    let remaining_chunks: Vec<String> = chunks.into_iter().skip(1).collect();
    let num_remaining = remaining_chunks.len();


    // Clone state for the background task
    let state_clone = state.clone();
    let voice_clone = req.voice.clone();
    let speed = req.speed;

    // Spawn background task for all chunk generation
    tokio::spawn(async move {
        // STEP 1: Generate first chunk immediately (blocking this async task)

        let tts = match state_clone.tts_pool.acquire().await {
            Ok(t) => t,
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to acquire TTS engine for first chunk: {}", e))).await;
                return;
            }
        };

        let temp_file = format!("/tmp/tts_stream_first_{}.wav", Uuid::new_v4());
        let temp_file_clone = temp_file.clone();
        let chunk_clone = first_chunk.clone();
        let voice = voice_clone.clone();

        // Generate first chunk audio
        let result = tokio::task::spawn_blocking(move || {
            futures::executor::block_on(tts.speak(&chunk_clone, &temp_file, &voice, speed))
                .map_err(|e| e.to_string())
        })
        .await;

        // Send first chunk immediately
        match result {
            Ok(Ok(())) => {
                match tokio::fs::read(&temp_file_clone).await {
                    Ok(audio_data) => {
                        let _ = tokio::fs::remove_file(&temp_file_clone).await;
                        tracing::debug!("First chunk sent ({} bytes) in {:?}", audio_data.len(), start.elapsed());

                        if tx.send(Ok(Bytes::from(audio_data))).await.is_err() {
                            tracing::warn!("Stream receiver dropped before first chunk");
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(format!("Failed to read first chunk: {}", e))).await;
                        return;
                    }
                }
            }
            Ok(Err(e)) => {
                let _ = tx.send(Err(format!("First chunk generation failed: {}", e))).await;
                return;
            }
            Err(e) => {
                let _ = tx.send(Err(format!("First chunk task failed: {}", e))).await;
                return;
            }
        }

        // STEP 2: Generate remaining chunks in parallel
        if remaining_chunks.is_empty() {
            return;
        }

        // Spawn parallel tasks for all remaining chunks
        let mut tasks = Vec::new();

        for (i, chunk) in remaining_chunks.into_iter().enumerate() {
            let state = state_clone.clone();
            let voice = voice_clone.clone();
            let chunk_index = i + 1; // +1 because chunk 0 was already sent

            let task = tokio::spawn(async move {
                // Acquire TTS engine
                let tts = match state.tts_pool.acquire().await {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::error!("Failed to acquire TTS for chunk {}: {}", chunk_index, e);
                        return Err(format!("Failed to acquire TTS engine: {}", e));
                    }
                };

                // Generate audio
                let temp_file = format!("/tmp/tts_stream_{}_{}.wav", Uuid::new_v4(), chunk_index);
                let temp_file_clone = temp_file.clone();
                let chunk_clone = chunk.clone();

                let result = tokio::task::spawn_blocking(move || {
                    futures::executor::block_on(tts.speak(&chunk_clone, &temp_file, &voice, speed))
                        .map_err(|e| e.to_string())
                })
                .await;

                match result {
                    Ok(Ok(())) => {
                        match tokio::fs::read(&temp_file_clone).await {
                            Ok(audio_data) => {
                                let _ = tokio::fs::remove_file(&temp_file_clone).await;
                                Ok((chunk_index, Bytes::from(audio_data)))
                            }
                            Err(e) => {
                                tracing::error!("Failed to read chunk {}: {}", chunk_index, e);
                                Err(format!("Failed to read audio file: {}", e))
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::error!("Chunk {} generation failed: {}", chunk_index, e);
                        Err(format!("TTS generation failed: {}", e))
                    }
                    Err(e) => {
                        tracing::error!("Chunk {} task panicked: {}", chunk_index, e);
                        Err(format!("Task join error: {}", e))
                    }
                }
            });

            tasks.push((chunk_index, task));
        }

        // STEP 3: Collect results and send in order
        // Use a buffer to hold out-of-order chunks
        let mut completed_chunks: Vec<Option<Bytes>> = vec![None; num_remaining];
        let mut next_to_send = 0; // Next chunk index we should send (0-indexed in remaining_chunks)

        // Wait for all tasks to complete
        for (original_index, task) in tasks {
            match task.await {
                Ok(Ok((chunk_index, audio_data))) => {
                    let buffer_index = chunk_index - 1; // Adjust for 0-indexing
                    completed_chunks[buffer_index] = Some(audio_data);

                    // Send all consecutive chunks that are ready
                    while next_to_send < completed_chunks.len() {
                        if let Some(audio) = completed_chunks[next_to_send].take() {
                            let actual_chunk_num = next_to_send + 1;

                            if tx.send(Ok(audio)).await.is_err() {
                                tracing::warn!("Stream receiver dropped at chunk {}", actual_chunk_num);
                                return;
                            }

                            next_to_send += 1;
                        } else {
                            // Next chunk not ready yet, wait for more to complete
                            break;
                        }
                    }
                }
                Ok(Err(e)) => {
                    tracing::error!("Chunk {} failed: {}", original_index, e);
                    let _ = tx.send(Err(format!("Chunk {} failed: {}", original_index, e))).await;
                    return;
                }
                Err(e) => {
                    tracing::error!("Task for chunk {} panicked: {}", original_index, e);
                    let _ = tx.send(Err(format!("Task failed: {}", e))).await;
                    return;
                }
            }
        }

        tracing::debug!("Streaming complete: {} chunks sent in {:?}", num_remaining + 1, start.elapsed());
    });

    // Create streaming response
    let stream = ReceiverStream::new(rx).map(|result| {
        result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    });

    let body = axum::body::Body::from_stream(stream);

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "audio/wav")
        .header(header::TRANSFER_ENCODING, "chunked")
        .body(body)
        .unwrap())
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
