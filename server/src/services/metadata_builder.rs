use crate::audio;
use crate::models::{PhraseMetadata, ChunkMetadata};
use crate::error::Result;

/// Build metadata from audio bytes and text
pub fn build_metadata(
    audio_bytes: &[u8],
    text: &str,
    chunk_index: usize,
    start_offset_ms: f64,
) -> Result<ChunkMetadata> {
    // Calculate duration
    let duration_ms = audio::duration::calculate(audio_bytes)?;

    // Segment text into phrases
    let phrase_texts = audio::segmentation::segment_phrases(text);

    // Calculate character-weighted durations for each phrase
    let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
    let mut phrases = Vec::new();
    let mut cumulative_time = 0.0;

    for phrase_text in phrase_texts {
        let phrase_words = audio::segmentation::segment_words(&phrase_text);
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
    Ok(ChunkMetadata {
        chunk_index,
        text: text.to_string(),
        phrases,
        duration_ms,
        start_offset_ms,
    })
}
