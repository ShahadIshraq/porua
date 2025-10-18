use crate::audio;
use crate::models::{
    PhraseMetadata, ChunkMetadata, ValidationResult, ValidationError,
    ValidationWarning, DebugInfo
};
use crate::text_processing::normalization;
use crate::error::Result;

/// Build metadata from audio bytes and text with enhanced features
pub fn build_metadata(
    audio_bytes: &[u8],
    text: &str,
    chunk_index: usize,
    start_offset_ms: f64,
) -> Result<ChunkMetadata> {
    build_metadata_with_options(audio_bytes, text, chunk_index, start_offset_ms, true, true)
}

/// Build metadata with options for validation and debug info
pub fn build_metadata_with_options(
    audio_bytes: &[u8],
    text: &str,
    chunk_index: usize,
    start_offset_ms: f64,
    include_validation: bool,
    include_debug: bool,
) -> Result<ChunkMetadata> {
    // Normalize text for TTS while preserving original
    let norm_result = normalization::normalize_for_tts(text);
    let normalization_info = normalization::get_normalization_info(&norm_result);

    // Calculate duration
    let duration_ms = audio::duration::calculate(audio_bytes)?;

    // Segment normalized text into phrases
    let phrase_texts = audio::segmentation::segment_phrases(&norm_result.normalized);

    // Calculate character-weighted durations for each phrase
    let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
    let mut phrases = Vec::new();
    let mut cumulative_time = 0.0;
    let mut current_char_offset = 0;

    for phrase_text in phrase_texts {
        let phrase_words = audio::segmentation::segment_words(&phrase_text);
        let char_weight = phrase_text.len() as f64 / total_chars as f64;
        let phrase_duration = duration_ms * char_weight;

        // Find this phrase in the normalized text
        let phrase_start = norm_result.normalized[current_char_offset..]
            .find(&phrase_text)
            .map(|pos| current_char_offset + pos);

        let (char_offset_start, char_offset_end) = if let Some(start) = phrase_start {
            let end = start + phrase_text.len();
            current_char_offset = end;
            (Some(start), Some(end))
        } else {
            // Fallback: use current position
            let end = current_char_offset + phrase_text.len();
            current_char_offset = end;
            (Some(current_char_offset - phrase_text.len()), Some(end))
        };

        // Extract original phrase text
        let original_phrase = normalization::extract_original_phrase(
            &phrase_text,
            &norm_result,
            char_offset_start,
        );

        phrases.push(PhraseMetadata {
            text: phrase_text.clone(),
            original_text: if original_phrase != phrase_text {
                Some(original_phrase)
            } else {
                None
            },
            words: phrase_words,
            start_ms: cumulative_time,
            duration_ms: phrase_duration,
            char_offset_start,
            char_offset_end,
        });

        cumulative_time += phrase_duration;
    }

    // Validation
    let validation = if include_validation {
        Some(validate_phrases(&phrases, &norm_result.normalized, &norm_result.original))
    } else {
        None
    };

    // Debug info
    let debug_info = if include_debug {
        Some(DebugInfo {
            tts_engine: "kokoro".to_string(),
            text_length_original: normalization_info.original_length,
            text_length_normalized: normalization_info.normalized_length,
            normalization_changes: normalization_info.changes_count,
            phrase_count: phrases.len(),
            total_duration_ms: duration_ms,
        })
    } else {
        None
    };

    // Create metadata
    Ok(ChunkMetadata {
        version: Some("2.0".to_string()),
        chunk_index,
        text: norm_result.normalized.clone(),
        original_text: if norm_result.original != norm_result.normalized {
            Some(norm_result.original)
        } else {
            None
        },
        phrases,
        duration_ms,
        start_offset_ms,
        validation,
        debug_info,
    })
}

/// Validate phrase metadata for consistency
fn validate_phrases(
    phrases: &[PhraseMetadata],
    normalized_text: &str,
    _original_text: &str,
) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for (i, phrase) in phrases.iter().enumerate() {
        // Check 1: Phrase text should be found in normalized text
        if let (Some(start), Some(end)) = (phrase.char_offset_start, phrase.char_offset_end) {
            if start < normalized_text.len() && end <= normalized_text.len() {
                let expected = &phrase.text;
                let actual = &normalized_text[start..end];

                if expected != actual {
                    errors.push(ValidationError {
                        phrase_index: i,
                        error_type: "text_mismatch".to_string(),
                        message: format!(
                            "Expected '{}...', found '{}...'",
                            &expected.chars().take(30).collect::<String>(),
                            &actual.chars().take(30).collect::<String>()
                        ),
                    });
                }
            } else {
                errors.push(ValidationError {
                    phrase_index: i,
                    error_type: "offset_out_of_bounds".to_string(),
                    message: format!("Offsets [{}, {}) exceed text length {}", start, end, normalized_text.len()),
                });
            }
        }

        // Check 2: No overlapping phrases
        if i > 0 {
            if let (Some(prev_end), Some(curr_start)) = (
                phrases[i - 1].char_offset_end,
                phrase.char_offset_start,
            ) {
                if prev_end > curr_start {
                    warnings.push(ValidationWarning {
                        phrase_index: i,
                        warning_type: "overlapping_phrases".to_string(),
                        message: format!("Overlaps with previous phrase by {} chars", prev_end - curr_start),
                    });
                }

                // Check 3: Large gaps between phrases
                let gap = curr_start.saturating_sub(prev_end);
                if gap > 50 {
                    warnings.push(ValidationWarning {
                        phrase_index: i,
                        warning_type: "large_gap".to_string(),
                        message: format!("Gap of {} chars before this phrase", gap),
                    });
                }
            }
        }

        // Check 4: Duration sanity check
        if phrase.duration_ms < 0.0 {
            errors.push(ValidationError {
                phrase_index: i,
                error_type: "negative_duration".to_string(),
                message: format!("Duration is negative: {}", phrase.duration_ms),
            });
        }

        if phrase.duration_ms > 60000.0 {
            warnings.push(ValidationWarning {
                phrase_index: i,
                warning_type: "very_long_phrase".to_string(),
                message: format!("Duration exceeds 60s: {:.1}s", phrase.duration_ms / 1000.0),
            });
        }
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{WavWriter, WavSpec, SampleFormat};
    use std::io::Cursor;

    fn create_test_wav_with_duration(duration_ms: f64) -> Vec<u8> {
        let sample_rate = 24000;
        let channels = 1;
        let num_samples = ((duration_ms / 1000.0) * sample_rate as f64) as u32;

        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };

        let mut buffer = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = WavWriter::new(cursor, spec).unwrap();

            for _ in 0..(num_samples * channels as u32) {
                writer.write_sample(0i16).unwrap();
            }

            writer.finalize().unwrap();
        }

        buffer
    }

    #[test]
    fn test_build_metadata_single_phrase() {
        let text = "Hello world";
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        assert_eq!(metadata.chunk_index, 0);
        assert_eq!(metadata.start_offset_ms, 0.0);
        assert!((metadata.duration_ms - 1000.0).abs() < 10.0);
        assert!(!metadata.phrases.is_empty());
    }

    #[test]
    fn test_build_metadata_multiple_phrases() {
        let text = "Hello world. How are you?";
        let audio_bytes = create_test_wav_with_duration(2000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        assert!(metadata.phrases.len() >= 2, "Expected at least 2 phrases");
        assert!((metadata.duration_ms - 2000.0).abs() < 10.0);
    }

    #[test]
    fn test_build_metadata_empty_text() {
        let text = "";
        let audio_bytes = create_test_wav_with_duration(100.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        // Empty text should still produce metadata
        assert_eq!(metadata.text, "");
    }

    #[test]
    fn test_build_metadata_duration_calculation() {
        let text = "This is a test sentence.";
        let audio_bytes = create_test_wav_with_duration(1500.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        // Total duration of phrases should equal audio duration
        let total_phrase_duration: f64 = metadata.phrases.iter()
            .map(|p| p.duration_ms)
            .sum();

        assert!(
            (total_phrase_duration - metadata.duration_ms).abs() < 1.0,
            "Expected phrase durations to sum to {}, got {}",
            metadata.duration_ms, total_phrase_duration
        );
    }

    #[test]
    fn test_build_metadata_phrase_timing_sequential() {
        let text = "First sentence. Second sentence.";
        let audio_bytes = create_test_wav_with_duration(2000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        // Verify phrases are sequential (no overlaps)
        for i in 1..metadata.phrases.len() {
            let prev_end = metadata.phrases[i - 1].start_ms + metadata.phrases[i - 1].duration_ms;
            let curr_start = metadata.phrases[i].start_ms;

            assert!(
                (curr_start - prev_end).abs() < 0.1,
                "Phrase {} starts at {}, but previous phrase ends at {}",
                i, curr_start, prev_end
            );
        }
    }

    #[test]
    fn test_build_metadata_with_chunk_index() {
        let text = "Hello";
        let audio_bytes = create_test_wav_with_duration(500.0);

        let metadata = build_metadata(&audio_bytes, text, 5, 1000.0).unwrap();

        assert_eq!(metadata.chunk_index, 5);
        assert_eq!(metadata.start_offset_ms, 1000.0);
    }

    #[test]
    fn test_build_metadata_char_offsets() {
        let text = "Hello world.";
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        for phrase in &metadata.phrases {
            if let (Some(start), Some(end)) = (phrase.char_offset_start, phrase.char_offset_end) {
                assert!(start < end, "Start offset should be less than end offset");
                assert!(end <= text.len(), "End offset should not exceed text length");
            }
        }
    }

    #[test]
    fn test_build_metadata_with_normalization() {
        let text = "\u{201C}Hello world\u{201D}"; // Smart quotes
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        // Should have original text preserved
        assert!(metadata.original_text.is_some());
        assert_ne!(metadata.text, text); // Normalized version should be different
    }

    #[test]
    fn test_build_metadata_version() {
        let text = "Test";
        let audio_bytes = create_test_wav_with_duration(500.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        assert_eq!(metadata.version, Some("2.0".to_string()));
    }

    #[test]
    fn test_build_metadata_validation_included() {
        let text = "Test sentence.";
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        assert!(metadata.validation.is_some());
    }

    #[test]
    fn test_build_metadata_debug_info_included() {
        let text = "Test sentence.";
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        assert!(metadata.debug_info.is_some());
        if let Some(debug) = metadata.debug_info {
            assert_eq!(debug.tts_engine, "kokoro");
            assert!(debug.phrase_count > 0);
        }
    }

    #[test]
    fn test_build_metadata_without_validation() {
        let text = "Test";
        let audio_bytes = create_test_wav_with_duration(500.0);

        let metadata = build_metadata_with_options(&audio_bytes, text, 0, 0.0, false, true).unwrap();

        assert!(metadata.validation.is_none());
        assert!(metadata.debug_info.is_some());
    }

    #[test]
    fn test_build_metadata_without_debug() {
        let text = "Test";
        let audio_bytes = create_test_wav_with_duration(500.0);

        let metadata = build_metadata_with_options(&audio_bytes, text, 0, 0.0, true, false).unwrap();

        assert!(metadata.validation.is_some());
        assert!(metadata.debug_info.is_none());
    }

    #[test]
    fn test_validate_phrases_valid() {
        let text = "Hello world";
        let audio_bytes = create_test_wav_with_duration(1000.0);

        let metadata = build_metadata(&audio_bytes, text, 0, 0.0).unwrap();

        if let Some(validation) = metadata.validation {
            assert!(validation.valid || validation.warnings.len() > 0);
        }
    }

    #[test]
    fn test_build_metadata_invalid_audio() {
        let text = "Test";
        let invalid_audio = vec![0u8; 100]; // Invalid WAV data

        let result = build_metadata(&invalid_audio, text, 0, 0.0);

        assert!(result.is_err());
    }
}
