use hound::WavReader;
use std::io::Cursor;
use crate::error::Result;

/// Calculate duration in milliseconds from WAV file bytes
pub fn calculate(wav_bytes: &[u8]) -> Result<f64> {
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
