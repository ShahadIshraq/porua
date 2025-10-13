use axum::{
    body::Bytes,
    extract::State,
    http::header,
    middleware,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, Clone)]
pub struct PhraseMetadata {
    pub text: String,
    #[serde(skip_serializing)]
    pub words: Vec<String>,
    pub start_ms: f64,
    pub duration_ms: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChunkMetadata {
    pub chunk_index: usize,
    pub text: String,
    pub phrases: Vec<PhraseMetadata>,
    pub duration_ms: f64,
    pub start_offset_ms: f64,
}

// Helper Functions

/// Calculate duration in milliseconds from WAV file bytes
pub fn calculate_wav_duration_cli(wav_bytes: &[u8]) -> Result<f64> {
    calculate_wav_duration(wav_bytes)
}

/// Calculate duration in milliseconds from WAV file bytes (internal version)
fn calculate_wav_duration(wav_bytes: &[u8]) -> Result<f64> {
    let cursor = Cursor::new(wav_bytes);
    let reader = WavReader::new(cursor)?;

    let spec = reader.spec();
    let num_samples = reader.len() as f64;
    let sample_rate = spec.sample_rate as f64;
    let num_channels = spec.channels as f64;

    // reader.len() returns total samples across all channels
    // We need frames (samples per channel) for duration calculation
    let num_frames = num_samples / num_channels;
    let duration_ms = (num_frames / sample_rate) * 1000.0;

    Ok(duration_ms)
}

/// Split text into words, preserving punctuation with words (public version for CLI)
pub fn segment_words_cli(text: &str) -> Vec<String> {
    segment_words(text)
}

/// Split text into words, preserving punctuation with words
fn segment_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current_word = String::new();

    for ch in text.chars() {
        if ch.is_whitespace() {
            if !current_word.is_empty() {
                words.push(current_word.clone());
                current_word.clear();
            }
        } else {
            current_word.push(ch);
        }
    }

    // Add last word if any
    if !current_word.is_empty() {
        words.push(current_word);
    }

    words
}

/// Split text into phrases (sentences or 5-word groups, whichever is shorter) - public version for CLI
pub fn segment_phrases_cli(text: &str) -> Vec<String> {
    segment_phrases(text)
}

/// Split text into phrases (sentences or 5-word groups, whichever is shorter)
fn segment_phrases(text: &str) -> Vec<String> {
    let mut phrases = Vec::new();

    // First, split by sentence-ending punctuation
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect();

    for sentence in sentences {
        let sentence = sentence.trim();
        let words = segment_words(sentence);

        if words.len() <= 5 {
            // Sentence has 5 or fewer words, use as-is
            phrases.push(sentence.to_string());
        } else {
            // Split into 5-word chunks
            for chunk in words.chunks(5) {
                let phrase = chunk.join(" ");
                phrases.push(phrase);
            }
        }
    }

    phrases
}

const BOUNDARY: &str = "tts_chunk_boundary";

fn create_boundary_start() -> String {
    format!("\r\n--{}\r\n", BOUNDARY)
}

fn create_boundary_end() -> String {
    format!("\r\n--{}--\r\n", BOUNDARY)
}

fn create_metadata_part(metadata: &ChunkMetadata) -> Result<Bytes> {
    let json = serde_json::to_string(metadata)?;

    let part = format!(
        "{}Content-Type: application/json\r\n\r\n{}\r\n",
        create_boundary_start(),
        json
    );

    Ok(Bytes::from(part))
}

fn create_audio_part(audio_bytes: Vec<u8>) -> Bytes {
    let mut part = Vec::new();

    // Boundary + headers
    let header = format!(
        "{}Content-Type: audio/wav\r\nContent-Length: {}\r\n\r\n",
        create_boundary_start(),
        audio_bytes.len()
    );
    part.extend_from_slice(header.as_bytes());

    // Audio data
    part.extend_from_slice(&audio_bytes);

    Bytes::from(part)
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
    let combined_audio = concatenate_wav_files(audio_chunks)?;
    Ok(combined_audio)
}

/// Concatenate multiple WAV files into a single WAV file
fn concatenate_wav_files(wav_files: Vec<Vec<u8>>) -> Result<Vec<u8>> {
    if wav_files.is_empty() {
        return Err(TtsError::WavConcatenation("No audio files to concatenate".to_string()));
    }

    if wav_files.len() == 1 {
        return Ok(wav_files.into_iter().next().unwrap());
    }

    // Read the first file to get the WAV spec
    let first_cursor = Cursor::new(&wav_files[0]);
    let first_reader = WavReader::new(first_cursor)?;
    let spec = first_reader.spec();

    // Determine sample type based on spec
    match spec.sample_format {
        SampleFormat::Float => concatenate_wav_files_typed::<f32>(wav_files, spec),
        SampleFormat::Int => {
            // Handle different bit depths for integers
            match spec.bits_per_sample {
                16 => concatenate_wav_files_typed::<i16>(wav_files, spec),
                32 => concatenate_wav_files_typed::<i32>(wav_files, spec),
                _ => Err(TtsError::WavConcatenation(format!("Unsupported bits per sample: {}", spec.bits_per_sample)))
            }
        }
    }
}

/// Generic function to concatenate WAV files with a specific sample type
fn concatenate_wav_files_typed<T>(
    wav_files: Vec<Vec<u8>>,
    spec: hound::WavSpec
) -> Result<Vec<u8>>
where
    T: hound::Sample + Copy,
{
    // Collect all samples from all files
    let mut all_samples: Vec<T> = Vec::new();

    for (i, wav_data) in wav_files.iter().enumerate() {
        let cursor = Cursor::new(wav_data);
        let reader = WavReader::new(cursor)?;

        // Verify all files have the same spec
        if reader.spec() != spec {
            return Err(TtsError::WavConcatenation(format!("WAV file {} has different spec", i)));
        }

        // Collect samples
        for sample in reader.into_samples::<T>() {
            let sample = sample?;
            all_samples.push(sample);
        }
    }

    // Write combined WAV to buffer
    let mut output = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut output, spec)?;

        for sample in all_samples {
            writer.write_sample(sample)?;
        }

        writer.finalize()?;
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

/// Generate a single chunk with metadata
async fn generate_chunk_with_metadata(
    state: &AppState,
    text: &str,
    voice: &str,
    speed: f32,
    chunk_index: usize,
    start_offset_ms: f64,
) -> Result<(ChunkMetadata, Vec<u8>)> {
    // Acquire TTS engine
    let tts = state.tts_pool.acquire().await
        .map_err(|e| TtsError::TtsEngine(e.to_string()))?;

    // Generate unique temp file
    let temp_file = TempFile::new();
    let temp_path = temp_file.as_str().to_string();
    let text_clone = text.to_string();
    let voice_clone = voice.to_string();

    // Generate audio in blocking thread
    let generation_result = tokio::task::spawn_blocking(move || {
        futures::executor::block_on(tts.speak(&text_clone, &temp_path, &voice_clone, speed))
            .map_err(|e| TtsError::TtsEngine(e.to_string()))
    })
    .await?;

    // Handle generation result
    generation_result?;

    // Read generated audio file
    let audio_bytes = tokio::fs::read(temp_file.path()).await?;

    // TempFile will automatically clean up when it goes out of scope

    // Calculate duration
    let duration_ms = calculate_wav_duration(&audio_bytes)?;

    // Segment text into phrases
    let phrase_texts = segment_phrases(text);

    // Calculate character-weighted durations for each phrase
    let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
    let mut phrases = Vec::new();
    let mut cumulative_time = 0.0;

    for phrase_text in phrase_texts {
        let phrase_words = segment_words(&phrase_text);
        let char_weight = phrase_text.len() as f64 / total_chars as f64;
        let phrase_duration = duration_ms * char_weight;

        phrases.push(PhraseMetadata {
            text: phrase_text,
            words: phrase_words,
            start_ms: cumulative_time,
            duration_ms: phrase_duration,
        });

        cumulative_time += phrase_duration;
    }

    // Create metadata
    let metadata = ChunkMetadata {
        chunk_index,
        text: text.to_string(),
        phrases,
        duration_ms,
        start_offset_ms,
    };

    Ok((metadata, audio_bytes))
}

/// Generate TTS audio with multipart streaming response
async fn generate_tts_stream(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Response> {
    use std::time::Instant;
    let start = Instant::now();

    tracing::debug!(
        "TTS multipart streaming request - text_len={}, voice='{}', speed={}",
        req.text.len(),
        req.voice,
        req.speed
    );

    // Validate text
    if req.text.trim().is_empty() {
        return Err(TtsError::EmptyText);
    }

    // Validate speed
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err(TtsError::InvalidSpeed(req.speed));
    }

    // Split text into chunks
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&req.text, &config);

    tracing::debug!("Streaming {} text chunks with multipart format", chunks.len());

    // Create channel for streaming multipart data
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, String>>(10);

    // Clone for background task
    let state_clone = state.clone();
    let voice_clone = req.voice.clone();
    let speed = req.speed;

    // Spawn background task to generate and stream chunks
    tokio::spawn(async move {
        let mut cumulative_offset_ms = 0.0;

        // === FIRST CHUNK (sequential for low latency) ===
        if !chunks.is_empty() {
            let first_chunk_text = chunks[0].clone();

            match generate_chunk_with_metadata(
                &state_clone,
                &first_chunk_text,
                &voice_clone,
                speed,
                0,
                cumulative_offset_ms,
            ).await {
                Ok((metadata, audio_bytes)) => {
                    cumulative_offset_ms += metadata.duration_ms;

                    // Send metadata part
                    match create_metadata_part(&metadata) {
                        Ok(metadata_bytes) => {
                            if tx.send(Ok(metadata_bytes)).await.is_err() {
                                tracing::warn!("Stream receiver dropped during metadata");
                                return;
                            }
                        }
                        Err(e) => {
                            let _ = tx.send(Err(format!("Metadata serialization error: {}", e))).await;
                            return;
                        }
                    }

                    // Send audio part
                    let audio_part = create_audio_part(audio_bytes);
                    if tx.send(Ok(audio_part)).await.is_err() {
                        tracing::warn!("Stream receiver dropped during audio");
                        return;
                    }

                    tracing::debug!(
                        "First chunk sent ({:.0}ms duration) in {:?}",
                        metadata.duration_ms,
                        start.elapsed()
                    );
                }
                Err(e) => {
                    let _ = tx.send(Err(format!("First chunk failed: {}", e))).await;
                    return;
                }
            }
        }

        // === REMAINING CHUNKS (parallel processing) ===
        if chunks.len() > 1 {
            let remaining_chunks: Vec<_> = chunks.into_iter().skip(1).collect();

            // Calculate start offsets for each chunk sequentially BEFORE spawning tasks
            let mut chunk_offsets = Vec::new();
            let mut temp_offset = cumulative_offset_ms;

            // We need to estimate durations OR process chunks sequentially for accurate offsets
            // For now, let's spawn tasks with estimated offsets (will fix after metadata arrives)
            for (i, chunk_text) in remaining_chunks.iter().enumerate() {
                chunk_offsets.push((i + 1, chunk_text.clone(), temp_offset));
                // Estimate duration based on character count (rough approximation)
                // Average speech rate: ~150 words/min = ~2.5 words/sec = ~400ms/word
                // Average word length: ~5 chars => ~80ms/char
                temp_offset += (chunk_text.len() as f64) * 80.0;
            }

            let mut tasks = Vec::new();

            for (chunk_index, chunk_text, start_offset) in chunk_offsets {
                let state = state_clone.clone();
                let voice = voice_clone.clone();

                let task = tokio::spawn(async move {
                    generate_chunk_with_metadata(
                        &state,
                        &chunk_text,
                        &voice,
                        speed,
                        chunk_index,
                        start_offset,
                    ).await
                });

                tasks.push((chunk_index, task));
            }

            // Collect results in order and fix offsets
            let mut results: Vec<Option<(ChunkMetadata, Vec<u8>)>> = vec![None; tasks.len()];

            for (chunk_index, task) in tasks {
                match task.await {
                    Ok(Ok((mut metadata, audio))) => {
                        // Fix the start_offset_ms to be accurate
                        metadata.start_offset_ms = cumulative_offset_ms;
                        cumulative_offset_ms += metadata.duration_ms;

                        let buffer_index = chunk_index - 1;
                        results[buffer_index] = Some((metadata, audio));
                    }
                    Ok(Err(e)) => {
                        let _ = tx.send(Err(format!("Chunk {} failed: {}", chunk_index, e))).await;
                        return;
                    }
                    Err(e) => {
                        let _ = tx.send(Err(format!("Task {} panicked: {}", chunk_index, e))).await;
                        return;
                    }
                }
            }

            // Send all remaining chunks in order
            for (metadata, audio_bytes) in results.into_iter().flatten() {
                // Send metadata
                match create_metadata_part(&metadata) {
                    Ok(metadata_bytes) => {
                        if tx.send(Ok(metadata_bytes)).await.is_err() {
                            tracing::warn!("Stream receiver dropped");
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                }

                // Send audio
                let audio_part = create_audio_part(audio_bytes);
                if tx.send(Ok(audio_part)).await.is_err() {
                    tracing::warn!("Stream receiver dropped");
                    return;
                }
            }
        }

        // Send final boundary
        let _ = tx.send(Ok(Bytes::from(create_boundary_end()))).await;

        tracing::debug!("Multipart streaming complete in {:?}", start.elapsed());
    });

    // Create streaming response with multipart content type
    let stream = ReceiverStream::new(rx).map(|result| {
        result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    });

    let body = axum::body::Body::from_stream(stream);

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, format!("multipart/mixed; boundary={}", BOUNDARY))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segment_words_basic() {
        let text = "Hello world, this is great!";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world,", "this", "is", "great!"]);
    }

    #[test]
    fn test_segment_words_multiple_spaces() {
        let text = "Hello    world";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world"]);
    }

    #[test]
    fn test_segment_words_empty() {
        let text = "";
        let words = segment_words(text);
        assert_eq!(words, Vec::<String>::new());
    }

    #[test]
    fn test_segment_words_whitespace_only() {
        let text = "   \t\n  ";
        let words = segment_words(text);
        assert_eq!(words, Vec::<String>::new());
    }

    #[test]
    fn test_segment_words_punctuation() {
        let text = "Hello, world! How are you?";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello,", "world!", "How", "are", "you?"]);
    }

    #[tokio::test]
    async fn test_calculate_wav_duration() {
        // Create a simple WAV file in memory
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 24000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = WavWriter::new(&mut cursor, spec).unwrap();
            // Write 1 second of silence (24000 samples)
            for _ in 0..24000 {
                writer.write_sample(0i16).unwrap();
            }
            writer.finalize().unwrap();
        }

        let wav_bytes = cursor.into_inner();
        let duration = calculate_wav_duration(&wav_bytes).unwrap();

        // Should be approximately 1000ms (allowing small floating point error)
        assert!((duration - 1000.0).abs() < 1.0);
    }

    #[test]
    fn test_segment_phrases_basic() {
        let text = "Hello world. This is great!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 2);
        assert_eq!(phrases[0], "Hello world");
        assert_eq!(phrases[1], "This is great");
    }

    #[test]
    fn test_segment_phrases_long_sentence() {
        let text = "This is a very long sentence with more than five words in it.";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 3);
        assert_eq!(phrases[0], "This is a very long");
        assert_eq!(phrases[1], "sentence with more than five");
        assert_eq!(phrases[2], "words in it");
    }

    #[test]
    fn test_segment_phrases_short_sentence() {
        let text = "Hello there!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 1);
        assert_eq!(phrases[0], "Hello there");
    }

    #[test]
    fn test_create_metadata_part() {
        let metadata = ChunkMetadata {
            chunk_index: 0,
            text: "Hello world".to_string(),
            phrases: vec![PhraseMetadata {
                text: "Hello world".to_string(),
                words: vec!["Hello".to_string(), "world".to_string()],
                start_ms: 0.0,
                duration_ms: 850.0,
            }],
            duration_ms: 850.0,
            start_offset_ms: 0.0,
        };

        let result = create_metadata_part(&metadata);
        assert!(result.is_ok());

        let part = result.unwrap();
        let part_str = String::from_utf8_lossy(&part);

        // Check that it contains the boundary
        assert!(part_str.contains("--tts_chunk_boundary"));
        // Check that it contains the Content-Type header
        assert!(part_str.contains("Content-Type: application/json"));
        // Check that it contains the JSON data
        assert!(part_str.contains("\"chunk_index\":0"));
        assert!(part_str.contains("\"text\":\"Hello world\""));
        assert!(part_str.contains("\"phrases\""));
    }

    #[test]
    fn test_create_audio_part() {
        let audio_data = vec![1, 2, 3, 4, 5];
        let part = create_audio_part(audio_data.clone());

        let part_str = String::from_utf8_lossy(&part);

        // Check that it contains the boundary
        assert!(part_str.contains("--tts_chunk_boundary"));
        // Check that it contains the Content-Type header
        assert!(part_str.contains("Content-Type: audio/wav"));
        // Check that it contains the Content-Length header
        assert!(part_str.contains("Content-Length: 5"));
        // The actual audio bytes should be at the end
        assert!(part.ends_with(&audio_data));
    }
}
