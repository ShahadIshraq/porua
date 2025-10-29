use axum::{body::Bytes, http::header, response::Response};
use std::time::Instant;
use tokio_stream::{StreamExt, wrappers::ReceiverStream};

use crate::chunking::{ChunkingConfig, chunk_text};
use crate::config::constants::{MAX_TEXT_LENGTH, MULTIPART_BOUNDARY};
use crate::error::{Result, TtsError};
use crate::models::{ChunkMetadata, TTSRequest};
use crate::server::AppState;

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
    use crate::services::metadata_builder;
    use crate::utils::temp_file::TempFile;

    // Acquire TTS engine
    let tts = state
        .tts_pool
        .acquire()
        .await
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
    let metadata =
        metadata_builder::build_metadata(&audio_bytes, text, chunk_index, start_offset_ms)?;

    Ok((metadata, audio_bytes))
}

/// Generate TTS audio with multipart streaming response
pub async fn generate_tts_stream(state: AppState, req: TTSRequest) -> Result<Response> {
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
        return Err(TtsError::InvalidRequest(format!(
            "Text too long: {} chars (max {})",
            req.text.len(),
            MAX_TEXT_LENGTH
        )));
    }

    // Validate speed
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err(TtsError::InvalidSpeed(req.speed));
    }

    // Normalize text for TTS (semantic + unicode normalization)
    // This ensures currency, percentages, and special characters are properly converted
    // BEFORE chunking, so the TTS engine receives clean, speakable text
    let normalized_text = crate::text_processing::normalization::normalize_simple(&req.text);

    // Split normalized text into chunks
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&normalized_text, &config);

    tracing::debug!(
        "Streaming {} text chunks with multipart format",
        chunks.len()
    );

    // Create channel for streaming multipart data
    let (tx, rx) = tokio::sync::mpsc::channel::<std::result::Result<Bytes, String>>(10);

    // Clone for background task
    let state_clone = state.clone();
    let voice_clone = req.voice.clone();
    let speed = req.speed;

    // Spawn background task to generate and stream chunks
    tokio::spawn(async move {
        if chunks.is_empty() {
            let _ = tx.send(Ok(Bytes::from(create_boundary_end()))).await;
            return;
        }

        // === ALL CHUNKS (parallel processing - send as ready) ===
        // Calculate estimated offsets for all chunks
        let mut chunk_offsets = Vec::new();
        let mut temp_offset = 0.0;

        for (i, chunk_text) in chunks.iter().enumerate() {
            chunk_offsets.push((i, chunk_text.clone(), temp_offset));
            // Estimate duration based on character count (rough approximation)
            // Average speech rate: ~150 words/min = ~2.5 words/sec = ~400ms/word
            // Average word length: ~5 chars => ~80ms/char
            temp_offset += (chunk_text.len() as f64) * 80.0;
        }

        // Spawn ALL chunks in parallel and collect their join handles
        let mut handles = Vec::new();

        for (chunk_index, chunk_text, start_offset) in chunk_offsets {
            let state = state_clone.clone();
            let voice = voice_clone.clone();
            let tx_clone = tx.clone();

            // Each chunk sends itself as soon as ready
            let handle = tokio::spawn(async move {
                match generate_chunk_with_metadata(
                    &state,
                    &chunk_text,
                    &voice,
                    speed,
                    chunk_index,
                    start_offset,
                )
                .await
                {
                    Ok((metadata, audio_bytes)) => {
                        tracing::debug!(
                            "Chunk {} ready ({:.0}ms duration), sending immediately",
                            chunk_index,
                            metadata.duration_ms
                        );

                        // Send metadata part immediately
                        if let Ok(metadata_bytes) = create_metadata_part(&metadata) {
                            let _ = tx_clone.send(Ok(metadata_bytes)).await;
                        }

                        // Send audio part immediately
                        let audio_part = create_audio_part(audio_bytes);
                        let _ = tx_clone.send(Ok(audio_part)).await;
                    }
                    Err(e) => {
                        let _ = tx_clone.send(Err(e.to_string())).await;
                    }
                }
            });

            handles.push(handle);
        }

        // Wait for ALL spawned chunks to actually complete
        for handle in handles {
            let _ = handle.await;
        }

        // Send final boundary
        let _ = tx.send(Ok(Bytes::from(create_boundary_end()))).await;

        tracing::debug!(
            "Multipart streaming complete (all {} chunks dispatched) in {:?}",
            chunks.len(),
            start.elapsed()
        );
    });

    // Create streaming response with multipart content type
    let stream = ReceiverStream::new(rx).map(|result| result.map_err(std::io::Error::other));

    let body = axum::body::Body::from_stream(stream);

    Ok(Response::builder()
        .header(
            header::CONTENT_TYPE,
            format!("multipart/mixed; boundary={}", MULTIPART_BOUNDARY),
        )
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
            return Err(TtsError::InvalidRequest(format!(
                "Text too long: {} chars (max {})",
                req.text.len(),
                MAX_TEXT_LENGTH
            )));
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
            TtsError::EmptyText => {} // Expected
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
            TtsError::EmptyText => {} // Expected
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
            }
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

            let result = validate_streaming_request(&req);

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
            }
            other => panic!("Expected InvalidRequest error, got: {:?}", other),
        }
    }

    // ===== Normalization Tests for Streaming Endpoint =====

    #[test]
    fn test_streaming_normalizes_currency() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "The price is $1.083 billion today.";
        let normalized = normalize_simple(text);

        // Verify normalization happens
        assert!(
            normalized.contains("billion dollars"),
            "Expected 'billion dollars' in normalized text"
        );
        assert!(
            !normalized.contains("$1.083"),
            "Should not contain raw currency"
        );

        // Verify chunking works on normalized text
        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);

        // All chunks should have normalized content
        for chunk in chunks {
            assert!(
                !chunk.contains('$'),
                "Chunk should not contain $ symbol: {}",
                chunk
            );
        }
    }

    #[test]
    fn test_streaming_normalizes_percentage() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "Growth was 50% this year.";
        let normalized = normalize_simple(text);

        assert!(
            normalized.contains("fifty percent"),
            "Expected 'fifty percent' in normalized text"
        );
        assert!(!normalized.contains("50%"), "Should not contain raw %");
    }

    #[test]
    fn test_streaming_normalizes_unicode() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "\u{201C}Hello\u{201D} \u{2014} test";
        let normalized = normalize_simple(text);

        // Smart quotes → ASCII quotes
        assert!(normalized.contains('"'), "Should contain ASCII quotes");
        assert!(
            !normalized.contains('\u{201C}'),
            "Should not contain smart quotes"
        );

        // Em dash → hyphen
        assert!(normalized.contains('-'), "Should contain hyphen");
        assert!(
            !normalized.contains('\u{2014}'),
            "Should not contain em dash"
        );
    }

    #[test]
    fn test_streaming_normalizes_multiple_currencies() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "Microsoft reported $13 billion, so around $1.083 billion a month.";
        let normalized = normalize_simple(text);

        // Should normalize both currency values
        assert!(
            normalized.contains("thirteen billion dollars")
                || normalized.contains("13 billion dollars"),
            "Should normalize first currency"
        );
        assert!(
            normalized.contains("one point zero eight three billion dollars"),
            "Should normalize second currency"
        );
        assert!(!normalized.contains('$'), "Should not contain $ symbols");
    }

    #[test]
    fn test_streaming_chunking_on_normalized_text() {
        use crate::text_processing::normalization::normalize_simple;

        // Text with currency that becomes much longer when normalized
        let text = "Price: $1M, $2M, $3M.";
        let normalized = normalize_simple(text);

        // Normalized text is much longer
        assert!(
            normalized.len() > text.len() * 2,
            "Normalized text should be significantly longer"
        );

        // Chunking should be based on normalized length
        let config = ChunkingConfig {
            max_chunk_size: 50,
            min_chunk_size: 10,
        };
        let chunks = chunk_text(&normalized, &config);

        // Should chunk based on normalized text length
        // (may create more chunks than if chunking raw text)
        for chunk in &chunks {
            assert!(
                !chunk.contains('$'),
                "Chunk should not contain raw currency"
            );
            assert!(
                chunk.contains("million dollars"),
                "Chunk should contain normalized text"
            );
        }
    }

    #[test]
    fn test_streaming_empty_text_normalization() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "";
        let normalized = normalize_simple(text);
        assert_eq!(normalized, "");

        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "");
    }

    #[test]
    fn test_streaming_normalization_preserves_sentence_boundaries() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "First sentence with $100. Second sentence with 50%. Third sentence.";
        let normalized = normalize_simple(text);

        // Sentence boundaries should be preserved
        let periods = normalized.matches('.').count();
        assert_eq!(periods, 3, "Should preserve all sentence-ending periods");

        // Chunking should still work correctly
        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);

        // Should have multiple chunks due to sentence boundaries
        assert!(chunks.len() >= 1);
    }

    #[test]
    fn test_streaming_complex_text_with_all_patterns() {
        use crate::text_processing::normalization::normalize_simple;

        let text = "Only one member of the Magnificent Seven (outside of NVIDIA) has ever disclosed its AI revenue — Microsoft, which stopped reporting in January 2025, when it reported \"$13 billion in annualized revenue,\" so around $1.083 billion a month.";

        let normalized = normalize_simple(text);

        // Should normalize both currency values
        assert!(!normalized.contains('$'), "Should not contain $ symbols");
        assert!(
            normalized.contains("billion dollars"),
            "Should contain normalized currency"
        );

        // Should normalize em dash
        assert!(
            !normalized.contains('\u{2014}'),
            "Should not contain em dash"
        );

        // Should normalize smart quotes
        assert!(
            !normalized.contains('\u{201C}') && !normalized.contains('\u{201D}'),
            "Should not contain smart quotes"
        );

        // Chunking should work correctly
        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);

        // Verify all chunks are normalized
        for chunk in chunks {
            assert!(!chunk.contains('$'), "No chunk should contain $");
            assert!(
                !chunk.contains('\u{201C}') && !chunk.contains('\u{201D}'),
                "No chunk should contain smart quotes"
            );
        }
    }

    // ===== Parallel Processing Behavior Tests =====

    #[test]
    fn test_parallel_chunk_processing_with_long_text() {
        use crate::chunking::{ChunkingConfig, chunk_text};
        use crate::text_processing::normalization::normalize_simple;

        // Create text long enough to generate multiple chunks
        let text = "This is sentence one with enough content to be substantial. \
                    This is sentence two with more content for testing purposes. \
                    This is sentence three continuing the pattern of verbose text. \
                    This is sentence four adding even more meaningful test content. \
                    This is sentence five providing another data point for testing.";

        let normalized = normalize_simple(text);
        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);

        // With 200 char max chunk size, should produce multiple chunks
        assert!(
            chunks.len() >= 2,
            "Long text should produce multiple chunks for parallel processing"
        );

        // Verify each chunk has valid content
        for (i, chunk) in chunks.iter().enumerate() {
            assert!(!chunk.is_empty(), "Chunk {} should not be empty", i);
            assert!(
                chunk.len() <= config.max_chunk_size,
                "Chunk {} exceeds max size: {} > {}",
                i,
                chunk.len(),
                config.max_chunk_size
            );
        }
    }

    #[test]
    fn test_chunk_offset_estimation() {
        // Test that offset estimation works correctly for parallel chunks
        let chunks = vec![
            "Short text".to_string(),
            "Medium length text here".to_string(),
            "This is a much longer piece of text for testing".to_string(),
        ];

        let mut offsets = Vec::new();
        let mut temp_offset = 0.0;

        // This mimics the offset calculation in generate_tts_stream
        for chunk_text in &chunks {
            offsets.push(temp_offset);
            // ~80ms per character estimation
            temp_offset += (chunk_text.len() as f64) * 80.0;
        }

        // Verify offsets are increasing
        for i in 1..offsets.len() {
            assert!(
                offsets[i] > offsets[i - 1],
                "Offset for chunk {} should be greater than previous chunk",
                i
            );
        }

        // First chunk always starts at 0
        assert_eq!(offsets[0], 0.0, "First chunk should start at offset 0");

        // Offsets should be proportional to text length
        let ratio_1_to_0 = offsets[1] / chunks[0].len() as f64;
        let ratio_2_to_1 = (offsets[2] - offsets[1]) / chunks[1].len() as f64;

        // Both should be ~80ms/char
        assert!(
            (ratio_1_to_0 - 80.0).abs() < 1.0,
            "Offset ratio should be approximately 80ms/char"
        );
        assert!(
            (ratio_2_to_1 - 80.0).abs() < 1.0,
            "Offset ratio should be approximately 80ms/char"
        );
    }

    #[test]
    fn test_empty_chunks_handling() {
        use crate::chunking::{ChunkingConfig, chunk_text};

        // Test that empty/whitespace text produces single chunk
        let config = ChunkingConfig::default();

        let empty_chunks = chunk_text("", &config);
        assert_eq!(
            empty_chunks.len(),
            1,
            "Empty text should produce single chunk"
        );

        let whitespace_chunks = chunk_text("   \n\t  ", &config);
        assert_eq!(
            whitespace_chunks.len(),
            1,
            "Whitespace-only text should produce single chunk"
        );
    }

    #[test]
    fn test_single_chunk_text() {
        use crate::chunking::{ChunkingConfig, chunk_text};

        // Text shorter than max chunk size should produce single chunk
        let config = ChunkingConfig::default();
        let short_text = "Hello world!";

        let chunks = chunk_text(short_text, &config);

        assert_eq!(chunks.len(), 1, "Short text should produce single chunk");
        assert_eq!(
            chunks[0], short_text,
            "Single chunk should contain entire text"
        );
    }

    #[test]
    fn test_chunk_metadata_contains_index() {
        use crate::models::PhraseMetadata;

        // Verify metadata includes chunk_index for client-side ordering
        let metadata = ChunkMetadata {
            version: Some("2.0".to_string()),
            chunk_index: 3,
            text: "Test text".to_string(),
            original_text: None,
            phrases: vec![PhraseMetadata {
                text: "Test text".to_string(),
                original_text: None,
                words: vec!["Test".to_string(), "text".to_string()],
                start_ms: 0.0,
                duration_ms: 500.0,
                char_offset_start: Some(0),
                char_offset_end: Some(9),
            }],
            duration_ms: 500.0,
            start_offset_ms: 0.0,
            validation: None,
            debug_info: None,
        };

        assert_eq!(
            metadata.chunk_index, 3,
            "Metadata should contain chunk_index for client ordering"
        );
    }
}
