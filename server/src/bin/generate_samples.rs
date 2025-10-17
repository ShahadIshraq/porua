use tts_server::kokoro::{TTS, voice_config::{Voice, Language}};
use std::path::Path;

const SAMPLE_TEXT: &str = "Hello, I'm here to help you read any text on the web. Whether it's an article, a blog post, or a long document, I can read it aloud for you in a natural and clear voice. Just select the text you want to hear, and I'll take care of the rest.";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let model_path = "models/kokoro-v1.0.onnx";
    let voices_path = "models/voices-v1.0.bin";

    println!("Initializing TTS engine...");
    let tts = TTS::new(model_path, voices_path).await?;

    // Get English voices only
    let english_voices: Vec<Voice> = Voice::all()
        .into_iter()
        .filter(|voice| {
            let config = voice.config();
            matches!(config.language, Language::AmericanEnglish | Language::BritishEnglish)
        })
        .collect();

    // Create samples directory
    let samples_dir = Path::new("samples");
    std::fs::create_dir_all(samples_dir)?;

    println!("\nGenerating {} voice samples...", english_voices.len());
    println!("Sample text: \"{}\"", SAMPLE_TEXT);
    println!();

    for voice in &english_voices {
        let voice_id = voice.id();
        let output_path = samples_dir.join(format!("{}.wav", voice_id));

        print!("Generating: {:<20} ", voice_id);

        match tts.speak(SAMPLE_TEXT, output_path.to_str().unwrap(), voice_id, 1.0) {
            Ok(_) => {
                let size = std::fs::metadata(&output_path)?.len();
                println!("✓ ({} KB)", size / 1024);
            }
            Err(e) => {
                println!("✗ Error: {}", e);
            }
        }
    }

    println!("\nSample generation complete!");

    // Print summary
    let mut total_size = 0u64;
    let mut count = 0;
    for entry in std::fs::read_dir(samples_dir)? {
        let entry = entry?;
        if entry.path().extension().and_then(|s| s.to_str()) == Some("wav") {
            total_size += entry.metadata()?.len();
            count += 1;
        }
    }

    println!("Total files: {}", count);
    println!("Total size: {:.2} MB", total_size as f64 / 1_048_576.0);

    Ok(())
}
