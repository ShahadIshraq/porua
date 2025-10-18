use crate::error::{Result, TtsError};
use hound::{SampleFormat, WavReader, WavWriter};
use std::io::Cursor;

/// Concatenate multiple WAV files into a single WAV file
pub fn concatenate(wav_files: Vec<Vec<u8>>) -> Result<Vec<u8>> {
    if wav_files.is_empty() {
        return Err(TtsError::WavConcatenation(
            "No audio files to concatenate".to_string(),
        ));
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
        SampleFormat::Float => concatenate_typed::<f32>(wav_files, spec),
        SampleFormat::Int => {
            // Handle different bit depths for integers
            match spec.bits_per_sample {
                16 => concatenate_typed::<i16>(wav_files, spec),
                32 => concatenate_typed::<i32>(wav_files, spec),
                _ => Err(TtsError::WavConcatenation(format!(
                    "Unsupported bits per sample: {}",
                    spec.bits_per_sample
                ))),
            }
        }
    }
}

/// Generic function to concatenate WAV files with a specific sample type
fn concatenate_typed<T>(wav_files: Vec<Vec<u8>>, spec: hound::WavSpec) -> Result<Vec<u8>>
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
            return Err(TtsError::WavConcatenation(format!(
                "WAV file {} has different spec",
                i
            )));
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
