/// Integration tests for streaming endpoint normalization
///
/// These tests verify that the streaming endpoint properly normalizes text
/// before chunking and passing to the TTS engine, ensuring consistency with
/// the general endpoint.

use porua_server::chunking::*;
use porua_server::text_processing::normalization::*;

#[test]
fn test_streaming_normalizes_currency_integration() {
    let text = "Only one member of the Magnificent Seven (outside of NVIDIA) has ever disclosed its AI revenue — Microsoft, which stopped reporting in January 2025, when it reported \"$13 billion in annualized revenue,\" so around $1.083 billion a month.";

    // This is what streaming endpoint should do
    let normalized = normalize_simple(text);
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&normalized, &config);

    // Verify no raw currency symbols in chunks
    for (i, chunk) in chunks.iter().enumerate() {
        assert!(
            !chunk.contains('$'),
            "Chunk {} should not contain $ symbol: {}",
            i,
            chunk
        );
    }

    // Verify normalized content is present
    let combined = chunks.join(" ");
    assert!(
        combined.contains("billion dollars"),
        "Combined chunks should contain normalized currency"
    );

    // Verify em dash is normalized
    assert!(
        !combined.contains('\u{2014}'),
        "Should not contain em dash in normalized chunks"
    );

    // Verify smart quotes are normalized
    assert!(
        !combined.contains('\u{201C}') && !combined.contains('\u{201D}'),
        "Should not contain smart quotes in normalized chunks"
    );
}

#[test]
fn test_streaming_chunk_count_may_change_integration() {
    let text = "The price is $1.083 billion today. That's 50% more.";

    // Chunk raw text (what it used to do - WRONG)
    let config = ChunkingConfig::default();
    let raw_chunks = chunk_text(text, &config);

    // Chunk normalized text (what it does now - CORRECT)
    let normalized = normalize_simple(text);
    let normalized_chunks = chunk_text(&normalized, &config);

    // Log for debugging
    println!("Raw text: {} chars, {} chunks", text.len(), raw_chunks.len());
    println!(
        "Normalized: {} chars, {} chunks",
        normalized.len(),
        normalized_chunks.len()
    );

    // The important thing is all chunks are normalized
    for chunk in &normalized_chunks {
        assert!(!chunk.contains('$'), "Chunk should not contain $");
        assert!(!chunk.contains('%'), "Chunk should not contain %");
    }

    // Normalized text is longer, so may have different chunk count
    assert!(
        normalized.len() > text.len(),
        "Normalized text should be longer"
    );
}

#[test]
fn test_streaming_preserves_semantic_meaning() {
    let test_cases = vec![
        ("$100", "one hundred dollars"),
        ("$1.5 billion", "one point five billion dollars"),
        ("50%", "fifty percent"),
        ("$13 billion", "thirteen billion dollars"),
    ];

    for (input, expected_fragment) in test_cases {
        let normalized = normalize_simple(input);
        assert!(
            normalized.contains(expected_fragment),
            "Expected '{}' to normalize to contain '{}', got '{}'",
            input,
            expected_fragment,
            normalized
        );
    }
}

#[test]
fn test_streaming_handles_empty_and_edge_cases() {
    let test_cases = vec![
        "",
        " ",
        "   ",
        "No special characters here",
        ".",
        "!",
    ];

    for text in test_cases {
        let normalized = normalize_simple(text);
        let config = ChunkingConfig::default();
        let chunks = chunk_text(&normalized, &config);

        // Should not panic and should produce valid chunks
        assert!(!chunks.is_empty(), "Should produce at least one chunk");
    }
}

#[test]
fn test_streaming_unicode_normalization_integration() {
    let text = "\u{201C}Hello world\u{201D} \u{2014} this is a test with \u{2018}quotes\u{2019} and ellipsis\u{2026}";

    let normalized = normalize_simple(text);

    // All unicode should be normalized to ASCII
    assert!(!normalized.contains('\u{201C}'), "No left double quote");
    assert!(!normalized.contains('\u{201D}'), "No right double quote");
    assert!(!normalized.contains('\u{2018}'), "No left single quote");
    assert!(!normalized.contains('\u{2019}'), "No right single quote");
    assert!(!normalized.contains('\u{2014}'), "No em dash");
    assert!(!normalized.contains('\u{2026}'), "No ellipsis character");

    // Should contain ASCII equivalents
    assert!(normalized.contains('"'), "Should have ASCII quotes");
    assert!(normalized.contains('-'), "Should have ASCII dash");
    assert!(normalized.contains("..."), "Should have three dots");
}

#[test]
fn test_streaming_multiple_patterns_integration() {
    let text = "Price: $100. Growth: 50%. Quote: \u{201C}test\u{201D}. Done.";

    let normalized = normalize_simple(text);
    let config = ChunkingConfig::default();
    let chunks = chunk_text(&normalized, &config);

    // Verify all patterns are normalized across all chunks
    let combined = chunks.join(" ");

    assert!(
        combined.contains("one hundred dollars"),
        "Should normalize currency"
    );
    assert!(combined.contains("fifty percent"), "Should normalize percentage");
    assert!(
        !combined.contains('$') && !combined.contains('%'),
        "Should not contain raw symbols"
    );
    assert!(
        !combined.contains('\u{201C}') && !combined.contains('\u{201D}'),
        "Should not contain smart quotes"
    );
}

#[test]
fn test_streaming_normalization_idempotent() {
    let text = "Price: $1.083 billion";

    let normalized1 = normalize_simple(text);
    let normalized2 = normalize_simple(&normalized1);

    // Normalizing already normalized text should not change it
    assert_eq!(
        normalized1, normalized2,
        "Normalization should be idempotent"
    );
}

#[test]
fn test_streaming_chunk_boundaries_on_normalized() {
    let text = "First with $100. Second with $200. Third with $300. Fourth with $400.";

    let normalized = normalize_simple(text);

    // Chunk with small size to force multiple chunks
    let config = ChunkingConfig {
        max_chunk_size: 80,
        min_chunk_size: 20,
    };
    let chunks = chunk_text(&normalized, &config);

    // Should have multiple chunks
    assert!(
        chunks.len() >= 2,
        "Should split into multiple chunks: got {} chunks",
        chunks.len()
    );

    // Every chunk should be normalized
    for (i, chunk) in chunks.iter().enumerate() {
        assert!(
            !chunk.contains('$'),
            "Chunk {} should not contain $: {}",
            i,
            chunk
        );
        assert!(
            chunk.contains("dollars"),
            "Chunk {} should contain 'dollars': {}",
            i,
            chunk
        );
    }
}

#[test]
fn test_streaming_large_currency_expansion() {
    // Text that expands significantly when normalized
    let text = "$1M $2M $3M $4M $5M";

    let normalized = normalize_simple(text);

    // Should expand significantly
    assert!(
        normalized.len() > text.len() * 3,
        "Normalized text should be much longer: {} -> {}",
        text.len(),
        normalized.len()
    );

    // All currency should be converted
    assert!(!normalized.contains('$'), "Should not contain any $");
    assert!(
        normalized.matches("million dollars").count() == 5,
        "Should have 5 instances of 'million dollars'"
    );
}
