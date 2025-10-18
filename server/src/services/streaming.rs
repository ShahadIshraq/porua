use axum::{
    body::Bytes,
    http::header,
    response::Response,
};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use std::time::Instant;

use crate::server::AppState;
use crate::models::{TTSRequest, ChunkMetadata};
use crate::chunking::{chunk_text, ChunkingConfig};
use crate::config::constants::{MAX_TEXT_LENGTH, MULTIPART_BOUNDARY};
use crate::error::{Result, TtsError};

fn create_boundary_start() -> String {
    format!("\r\n--{}\r\n", MULTIPART_BOUNDARY)
}

fn create_boundary_end() -> String {
    format!("\r\n--{}--\r\n", MULTIPART_BOUNDARY)
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

/// Generate a single chunk with metadata
async fn generate_chunk_with_metadata(
    state: &AppState,
    text: &str,
    voice: &str,
    speed: f32,
    chunk_index: usize,
    start_offset_ms: f64,
) -> Result<(ChunkMetadata, Vec<u8>)> {
    use crate::utils::temp_file::TempFile;
    use crate::services::metadata_builder;

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

    // Build metadata using shared function
    let metadata = metadata_builder::build_metadata(&audio_bytes, text, chunk_index, start_offset_ms)?;

    Ok((metadata, audio_bytes))
}

/// Generate TTS audio with multipart streaming response
pub async fn generate_tts_stream(
    state: AppState,
    req: TTSRequest,
) -> Result<Response> {
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

    // Validate text length to prevent DoS
    if req.text.len() > MAX_TEXT_LENGTH {
        return Err(TtsError::InvalidRequest(
            format!("Text too long: {} chars (max {})", req.text.len(), MAX_TEXT_LENGTH)
        ));
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
    let (tx, rx) = tokio::sync::mpsc::channel::<std::result::Result<Bytes, String>>(10);

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
                            let _ = tx.send(Err(e.to_string())).await;
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
                    let _ = tx.send(Err(e.to_string())).await;
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
                        let _ = tx.send(Err(e.to_string())).await;
                        return;
                    }
                    Err(e) => {
                        let _ = tx.send(Err(e.to_string())).await;
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
                        let _ = tx.send(Err(e.to_string())).await;
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
        .header(header::CONTENT_TYPE, format!("multipart/mixed; boundary={}", MULTIPART_BOUNDARY))
        .header(header::TRANSFER_ENCODING, "chunked")
        .body(body)
        .unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PhraseMetadata;

    #[test]
    fn test_create_metadata_part() {
        let metadata = ChunkMetadata {
            version: Some("2.0".to_string()),
            chunk_index: 0,
            text: "Hello world".to_string(),
            original_text: None,
            phrases: vec![PhraseMetadata {
                text: "Hello world".to_string(),
                original_text: None,
                words: vec!["Hello".to_string(), "world".to_string()],
                start_ms: 0.0,
                duration_ms: 850.0,
                char_offset_start: Some(0),
                char_offset_end: Some(11),
            }],
            duration_ms: 850.0,
            start_offset_ms: 0.0,
            validation: None,
            debug_info: None,
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

    // ===== Input Size Limit Tests for Streaming =====

    fn validate_streaming_request(req: &TTSRequest) -> Result<()> {
        // Validate text
        if req.text.trim().is_empty() {
            return Err(TtsError::EmptyText);
        }

        // Validate text length to prevent DoS
        if req.text.len() > MAX_TEXT_LENGTH {
            return Err(TtsError::InvalidRequest(
                format!("Text too long: {} chars (max {})", req.text.len(), MAX_TEXT_LENGTH)
            ));
        }

        // Validate speed
        if req.speed <= 0.0 || req.speed > 3.0 {
            return Err(TtsError::InvalidSpeed(req.speed));
        }

        Ok(())
    }

    #[test]
    fn test_streaming_rejects_empty_text() {
        let req = TTSRequest {
            text: "".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::EmptyText => {}, // Expected
            other => panic!("Expected EmptyText error, got: {:?}", other),
        }
    }

    #[test]
    fn test_streaming_rejects_whitespace_only_text() {
        let req = TTSRequest {
            text: "   \n\t  ".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::EmptyText => {}, // Expected
            other => panic!("Expected EmptyText error, got: {:?}", other),
        }
    }

    #[test]
    fn test_streaming_rejects_text_exceeding_max_length() {
        // Create text that exceeds MAX_TEXT_LENGTH (10,000 chars)
        let long_text = "a".repeat(MAX_TEXT_LENGTH + 1);

        let req = TTSRequest {
            text: long_text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::InvalidRequest(msg) => {
                assert!(msg.contains("Text too long"));
                assert!(msg.contains("10001 chars"));
                assert!(msg.contains("max 10000"));
            },
            other => panic!("Expected InvalidRequest error, got: {:?}", other),
        }
    }

    #[test]
    fn test_streaming_accepts_text_at_max_length() {
        // Create text exactly at MAX_TEXT_LENGTH (10,000 chars)
        let text = "a".repeat(MAX_TEXT_LENGTH);

        let req = TTSRequest {
            text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_ok(), "Should accept text at max length");
    }

    #[test]
    fn test_streaming_accepts_text_just_below_max_length() {
        // Create text just below MAX_TEXT_LENGTH
        let text = "a".repeat(MAX_TEXT_LENGTH - 1);

        let req = TTSRequest {
            text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_ok(), "Should accept text below max length");
    }

    #[test]
    fn test_streaming_boundary_values() {
        // Test various boundary values
        let test_cases = vec![
            (1, true),           // Minimum valid
            (100, true),         // Normal short text
            (9999, true),        // Just below max
            (10000, true),       // Exactly at max
            (10001, false),      // Just over max
            (20000, false),      // Way over max
        ];

        for (length, should_pass_validation) in test_cases {
            let text = "a".repeat(length);
            let req = TTSRequest {
                text,
                voice: "af_heart".to_string(),
                speed: 1.0,
                enable_chunking: false,
            };

            let result = validate_streaming_request(&req);

            if should_pass_validation {
                assert!(result.is_ok(), "Length {} should pass validation", length);
            } else {
                assert!(result.is_err(), "Length {} should fail validation", length);
                match result.unwrap_err() {
                    TtsError::InvalidRequest(msg) => {
                        assert!(msg.contains("Text too long"),
                            "Expected 'Text too long' error for length {}, got: {}", length, msg);
                    },
                    other => panic!("Expected InvalidRequest for length {}, got: {:?}", length, other),
                }
            }
        }
    }

    #[test]
    fn test_streaming_rejects_excessively_long_text() {
        // Test with very large text (100,000 chars - 10x the limit)
        let very_long_text = "a".repeat(MAX_TEXT_LENGTH * 10);

        let req = TTSRequest {
            text: very_long_text,
            voice: "af_heart".to_string(),
            speed: 1.0,
            enable_chunking: false,
        };

        let result = validate_streaming_request(&req);
        assert!(result.is_err());

        match result.unwrap_err() {
            TtsError::InvalidRequest(msg) => {
                assert!(msg.contains("Text too long"));
            },
            other => panic!("Expected InvalidRequest error, got: {:?}", other),
        }
    }
}
