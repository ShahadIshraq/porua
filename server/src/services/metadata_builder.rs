use crate::audio;
use crate::models::{
    PhraseMetadata, ChunkMetadata, ValidationResult, ValidationError,
    ValidationWarning, DebugInfo
};
use crate::utils::text_normalization;
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
    let norm_result = text_normalization::normalize_for_tts(text);
    let normalization_info = text_normalization::get_normalization_info(&norm_result);

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
        let original_phrase = text_normalization::extract_original_phrase(
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
