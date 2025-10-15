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

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{WavWriter, WavSpec, SampleFormat};

    fn create_test_wav(sample_rate: u32, channels: u16, num_samples: u32, bits_per_sample: u16) -> Vec<u8> {
        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample,
            sample_format: SampleFormat::Int,
        };

        let mut buffer = Vec::new();
        {
            let cursor = Cursor::new(&mut buffer);
            let mut writer = WavWriter::new(cursor, spec).unwrap();

            // Write silence samples
            for _ in 0..(num_samples * channels as u32) {
                if bits_per_sample == 16 {
                    writer.write_sample(0i16).unwrap();
                } else {
                    writer.write_sample(0i32).unwrap();
                }
            }

            writer.finalize().unwrap();
        }

        buffer
    }

    #[test]
    fn test_calculate_duration_mono() {
        // 24000 Hz, mono, 1 second = 24000 samples
        let wav = create_test_wav(24000, 1, 24000, 16);
        let duration = calculate(&wav).unwrap();

        // Should be approximately 1000ms
        assert!((duration - 1000.0).abs() < 1.0, "Expected ~1000ms, got {}ms", duration);
    }

    #[test]
    fn test_calculate_duration_stereo() {
        // 24000 Hz, stereo, 1 second = 24000 samples per channel
        let wav = create_test_wav(24000, 2, 24000, 16);
        let duration = calculate(&wav).unwrap();

        // Should be approximately 1000ms
        assert!((duration - 1000.0).abs() < 1.0, "Expected ~1000ms, got {}ms", duration);
    }

    #[test]
    fn test_calculate_duration_various_sample_rates() {
        // Test different sample rates
        let test_cases = vec![
            (8000, 1, 8000),   // 1 second at 8kHz
            (16000, 1, 16000), // 1 second at 16kHz
            (44100, 1, 44100), // 1 second at 44.1kHz
            (48000, 1, 48000), // 1 second at 48kHz
        ];

        for (sample_rate, channels, num_samples) in test_cases {
            let wav = create_test_wav(sample_rate, channels, num_samples, 16);
            let duration = calculate(&wav).unwrap();

            assert!(
                (duration - 1000.0).abs() < 1.0,
                "Expected ~1000ms for {}Hz, got {}ms",
                sample_rate, duration
            );
        }
    }

    #[test]
    fn test_calculate_duration_half_second() {
        // 24000 Hz, mono, 0.5 seconds = 12000 samples
        let wav = create_test_wav(24000, 1, 12000, 16);
        let duration = calculate(&wav).unwrap();

        // Should be approximately 500ms
        assert!((duration - 500.0).abs() < 1.0, "Expected ~500ms, got {}ms", duration);
    }

    #[test]
    fn test_calculate_duration_very_short() {
        // 24000 Hz, mono, 0.1 seconds = 2400 samples
        let wav = create_test_wav(24000, 1, 2400, 16);
        let duration = calculate(&wav).unwrap();

        // Should be approximately 100ms
        assert!((duration - 100.0).abs() < 1.0, "Expected ~100ms, got {}ms", duration);
    }

    #[test]
    fn test_calculate_duration_invalid_wav_data() {
        // Invalid WAV data should return an error
        let invalid_data = vec![0u8; 100];
        let result = calculate(&invalid_data);

        assert!(result.is_err(), "Expected error for invalid WAV data");
    }

    #[test]
    fn test_calculate_duration_empty_data() {
        // Empty data should return an error
        let empty_data: Vec<u8> = vec![];
        let result = calculate(&empty_data);

        assert!(result.is_err(), "Expected error for empty data");
    }

    #[test]
    fn test_calculate_duration_multi_channel() {
        // Test with 5.1 surround sound (6 channels)
        let wav = create_test_wav(48000, 6, 48000, 16);
        let duration = calculate(&wav).unwrap();

        // Should still be 1000ms
        assert!((duration - 1000.0).abs() < 1.0, "Expected ~1000ms, got {}ms", duration);
    }

    #[test]
    fn test_calculate_duration_24bit() {
        // Test with 24-bit audio
        let wav = create_test_wav(24000, 1, 24000, 24);
        let duration = calculate(&wav).unwrap();

        // Should be approximately 1000ms
        assert!((duration - 1000.0).abs() < 1.0, "Expected ~1000ms, got {}ms", duration);
    }
}
