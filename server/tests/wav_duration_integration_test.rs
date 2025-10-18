use hound::WavWriter;
use std::io::Cursor;

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
    let duration = porua_server::audio::duration::calculate(&wav_bytes).unwrap();

    // Should be approximately 1000ms (allowing small floating point error)
    assert!((duration - 1000.0).abs() < 1.0);
}
