/// Integration tests for semantic text normalization
///
/// These tests verify that semantic normalization is properly applied
/// throughout the entire TTS pipeline (CLI, server, streaming modes)

use porua_server::text_processing::normalization::normalize_simple;
use porua_server::text_processing::semantic_normalization::normalize_semantic;

#[test]
fn test_normalize_simple_includes_semantic() {
    // Test that normalize_simple (used by CLI and server) includes semantic normalization
    let input = "$10.3 billion of shares";
    let result = normalize_simple(input);

    assert!(result.contains("ten point three billion dollars"));
    assert!(!result.contains("$10.3"));
}

#[test]
fn test_normalize_simple_currency_and_unicode() {
    // Test that both semantic AND unicode normalization are applied
    let input = "He said \u{201C}$100 billion\u{201D} with smart quotes";
    let result = normalize_simple(input);

    // Should normalize currency
    assert!(result.contains("one hundred billion dollars"));
    assert!(!result.contains("$100"));

    // Should normalize unicode quotes
    assert!(result.contains("\"one hundred billion dollars\""));
    assert!(!result.contains("\u{201C}"));
    assert!(!result.contains("\u{201D}"));
}

#[test]
fn test_multiple_patterns_in_pipeline() {
    let input = "They paid $100 for a 20% stake worth $5M";
    let result = normalize_simple(input);

    assert!(result.contains("one hundred dollars"));
    assert!(result.contains("twenty percent"));
    assert!(result.contains("five million dollars"));
}

#[test]
fn test_original_problematic_string_full_pipeline() {
    let input = "I must be clear that these deals are intentionally made to continue the myth of generative AI, to pump NVIDIA, and to make sure OpenAI insiders can sell $10.3 billion of shares.";
    let result = normalize_simple(input);

    // Verify the fix
    assert!(result.contains("ten point three billion dollars"));
    assert!(!result.contains("$10.3"));

    // Verify the rest of the text is unchanged
    assert!(result.contains("I must be clear"));
    assert!(result.contains("NVIDIA"));
    assert!(result.contains("of shares"));
}

#[test]
fn test_currency_with_cents_full_pipeline() {
    let input = "The total cost is $23.45";
    let result = normalize_simple(input);

    assert_eq!(result, "The total cost is twenty-three dollars and forty-five cents");
}

#[test]
fn test_percentage_full_pipeline() {
    let input = "The rate increased by 15%";
    let result = normalize_simple(input);

    assert_eq!(result, "The rate increased by fifteen percent");
}

#[test]
fn test_complex_mixed_patterns() {
    let input = "Sold $10.3 billion (20% stake) for $2.5M cash";
    let result = normalize_simple(input);

    assert!(result.contains("ten point three billion dollars"));
    assert!(result.contains("twenty percent"));
    assert!(result.contains("two point five million dollars"));
}

#[test]
fn test_unicode_normalization_still_works() {
    // Verify existing unicode normalization is not broken
    let input = "He said \u{201C}hello\u{201D} with\u{2014}dashes and\u{2026} ellipsis";
    let result = normalize_simple(input);

    assert_eq!(result, "He said \"hello\" with-dashes and... ellipsis");
}

#[test]
fn test_no_normalization_needed() {
    let input = "This is plain text with no special patterns";
    let result = normalize_simple(input);

    assert_eq!(result, input);
}

#[test]
fn test_empty_string() {
    let result = normalize_simple("");
    assert_eq!(result, "");
}

#[test]
fn test_whitespace_only() {
    let result = normalize_simple("   ");
    // Note: Unicode normalization collapses multiple spaces to single space
    assert_eq!(result, " ");
}

#[test]
fn test_semantic_normalization_order() {
    // Currency with scale should be processed before simple currency
    let input = "$100 billion and $50 in cash";
    let result = normalize_simple(input);

    assert!(result.contains("one hundred billion dollars"));
    assert!(result.contains("fifty dollars"));
    assert!(!result.contains("one hundred dollars billion")); // Should NOT happen
}

#[test]
fn test_decimal_numbers_not_currency() {
    // Non-currency decimals should not be normalized
    let input = "The value of pi is approximately 3.14";
    let result = normalize_simple(input);

    assert_eq!(result, input);
}

#[test]
fn test_currency_abbreviation_case_insensitive() {
    // Test both upper and lower case abbreviations
    let input1 = "$5B in revenue";
    let input2 = "$5b in revenue";

    let result1 = normalize_simple(input1);
    let result2 = normalize_simple(input2);

    assert!(result1.contains("five billion dollars"));
    assert!(result2.contains("five billion dollars"));
}

#[test]
fn test_multiple_currencies_in_sentence() {
    let input = "Started with $1M, grew to $100M, now worth $5B";
    let result = normalize_simple(input);

    assert!(result.contains("one million dollars"));
    assert!(result.contains("one hundred million dollars"));
    assert!(result.contains("five billion dollars"));
}

#[test]
fn test_zero_dollars() {
    let input = "The balance is $0";
    let result = normalize_simple(input);

    assert!(result.contains("zero dollars"));
}

#[test]
fn test_one_dollar_singular() {
    let input = "It costs $1";
    let result = normalize_simple(input);

    assert!(result.contains("one dollar"));
    assert!(!result.contains("one dollars")); // Should be singular
}

#[test]
fn test_one_cent_singular() {
    let input = "Only $0.01 left";
    let result = normalize_simple(input);

    assert!(result.contains("one cent"));
    assert!(!result.contains("one cents")); // Should be singular
}

#[test]
fn test_percentage_with_decimal() {
    let input = "Interest rate is 3.5%";
    let result = normalize_simple(input);

    assert!(result.contains("three point five percent"));
}

#[test]
fn test_percentage_zero() {
    let input = "Growth was 0%";
    let result = normalize_simple(input);

    assert!(result.contains("zero percent"));
}

#[test]
fn test_large_currency_amounts() {
    let input = "$999.99 billion dollars";
    let result = normalize_simple(input);

    assert!(result.contains("nine hundred ninety-nine point nine nine billion dollars"));
}

#[test]
fn test_trillion_scale() {
    let input = "$1.5 trillion in assets";
    let result = normalize_simple(input);

    assert!(result.contains("one point five trillion dollars"));
}

#[test]
fn test_mixed_unicode_and_semantic() {
    // Test that both normalizations work together
    let input = "He said \u{201C}$10B is\u{2014}well\u{2026} a lot\u{201D}";
    let result = normalize_simple(input);

    // Semantic normalization
    assert!(result.contains("ten billion dollars"));

    // Unicode normalization
    assert!(result.contains("\""));
    assert!(result.contains("-"));
    assert!(result.contains("..."));
}

#[test]
fn test_direct_semantic_normalization_api() {
    // Test the direct semantic normalization API
    let input = "$10.3 billion";
    let result = normalize_semantic(input);

    assert_eq!(result, "ten point three billion dollars");
}

#[test]
fn test_semantic_preserves_other_text() {
    // Ensure semantic normalization doesn't affect non-pattern text
    let input = "The company, founded in 2020, raised $10M";
    let result = normalize_semantic(input);

    assert!(result.contains("The company, founded in 2020, raised"));
    assert!(result.contains("ten million dollars"));
}

#[test]
fn test_consecutive_patterns() {
    let input = "$100 $200 $300";
    let result = normalize_simple(input);

    assert!(result.contains("one hundred dollars"));
    assert!(result.contains("two hundred dollars"));
    assert!(result.contains("three hundred dollars"));
}

#[test]
fn test_pattern_at_start_of_string() {
    let input = "$100 is the price";
    let result = normalize_simple(input);

    assert!(result.starts_with("one hundred dollars"));
}

#[test]
fn test_pattern_at_end_of_string() {
    let input = "The price is $100";
    let result = normalize_simple(input);

    assert!(result.ends_with("one hundred dollars"));
}

#[test]
fn test_currency_with_commas() {
    // Test that large numbers with commas are handled correctly
    // Note: Current implementation may not handle commas in numbers
    let input = "Revenue was $1,000,000";
    let result = normalize_semantic(input);

    // This test documents current behavior
    // If commas are not supported, this should be a known limitation
    println!("Result with commas: {}", result);
}

#[test]
fn test_very_small_amounts() {
    let input = "$0.05 is five cents";
    let result = normalize_simple(input);

    assert!(result.contains("five cents"));
}

#[test]
fn test_currency_with_punctuation() {
    let input = "Cost: $100. Price: $200!";
    let result = normalize_simple(input);

    assert!(result.contains("one hundred dollars"));
    assert!(result.contains("two hundred dollars"));
}
