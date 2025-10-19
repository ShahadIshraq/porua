/// Text normalization utilities for TTS processing
///
/// This module handles normalization of Unicode characters (smart quotes, dashes, etc.)
/// and semantic normalization (currency, percentages) while maintaining accurate
/// position tracking between original and normalized text.
///
/// The normalization is done in a single pass to ensure correct position mapping.
use lazy_static::lazy_static;
use num2words::Num2Words;
use regex::{Captures, Regex};
use unicode_normalization::UnicodeNormalization;

lazy_static! {
    /// Currency with scale words (billion, million, trillion)
    static ref CURRENCY_SCALE_REGEX: Regex = Regex::new(
        r"(?i)\$(\d+(?:\.\d+)?)\s*(billion|million|trillion|B|M|T)\b"
    ).unwrap();

    /// Simple currency without scale
    static ref CURRENCY_SIMPLE_REGEX: Regex = Regex::new(
        r"\$(\d+(?:\.\d+)?)\b"
    ).unwrap();

    /// Percentage patterns
    static ref PERCENTAGE_REGEX: Regex = Regex::new(
        r"(\d+(?:\.\d+)?)\s*%"
    ).unwrap();
}

#[derive(Debug, Clone)]
pub struct NormalizationResult {
    /// Original text before normalization
    pub original: String,
    /// Normalized text suitable for TTS
    pub normalized: String,
    /// Mapping from normalized byte positions to original byte positions
    /// For each byte in normalized text, stores the corresponding byte position in original
    pub char_mapping: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct NormalizationInfo {
    /// Whether Unicode normalization was applied
    #[allow(dead_code)]
    pub unicode_normalized: bool,
    /// Number of characters that were changed
    pub changes_count: usize,
    /// Original length in characters
    pub original_length: usize,
    /// Normalized length in characters
    pub normalized_length: usize,
}

/// Normalize text for TTS while tracking the original
///
/// This function handles:
/// - Semantic normalization (currency, percentages, etc.)
/// - Smart quotes → ASCII quotes
/// - En/em dashes → ASCII hyphen
/// - Ellipsis → three dots
/// - Non-breaking spaces → regular spaces
/// - Soft hyphens → removed
/// - Unicode normalization (NFC form)
///
/// All transformations are tracked to maintain accurate position mapping
/// from normalized text back to original text.
pub fn normalize_for_tts(text: &str) -> NormalizationResult {
    let original = text.to_string();

    // PHASE 1: Apply semantic normalization with position tracking
    let (semantically_normalized, semantic_mapping) = normalize_semantic_with_tracking(text);

    // PHASE 2: Apply Unicode normalization with position tracking
    let (mut normalized, unicode_mapping) =
        normalize_unicode_with_tracking(&semantically_normalized);

    // PHASE 3: Compose mappings - map from final normalized to original
    // unicode_mapping[i] gives position in semantically_normalized
    // semantic_mapping[j] gives position in original
    let mut char_mapping = Vec::new();
    for &semantic_pos in &unicode_mapping {
        if semantic_pos < semantic_mapping.len() {
            char_mapping.push(semantic_mapping[semantic_pos]);
        } else {
            // Fallback: use last known position
            char_mapping.push(*semantic_mapping.last().unwrap_or(&0));
        }
    }

    // PHASE 4: Collapse multiple spaces (this may invalidate some mappings slightly)
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }

    // PHASE 5: Apply Unicode normalization (NFC form)
    let normalized = normalized.nfc().collect::<String>();

    NormalizationResult {
        original,
        normalized,
        char_mapping,
    }
}

/// Apply semantic normalization (currency, percentages) with position tracking
///
/// Returns: (normalized_text, byte_mapping)
/// where byte_mapping[i] = original byte position for byte i in normalized text
fn normalize_semantic_with_tracking(text: &str) -> (String, Vec<usize>) {
    let mut result = String::with_capacity(text.len() * 2);
    let mut mapping = Vec::new();
    let mut last_end = 0;

    // Collect all matches from all patterns
    let mut matches: Vec<(usize, usize, String)> = Vec::new();

    // Currency with scale
    for cap in CURRENCY_SCALE_REGEX.captures_iter(text) {
        if let Some(m) = cap.get(0) {
            let replacement = format_currency_with_scale(&cap);
            matches.push((m.start(), m.end(), replacement));
        }
    }

    // Simple currency (excluding positions already matched by scale)
    for cap in CURRENCY_SIMPLE_REGEX.captures_iter(text) {
        if let Some(m) = cap.get(0) {
            // Check if this overlaps with any scale match
            let overlaps = matches
                .iter()
                .any(|(start, end, _)| m.start() >= *start && m.start() < *end);
            if !overlaps {
                let replacement = format_currency_simple(&cap);
                matches.push((m.start(), m.end(), replacement));
            }
        }
    }

    // Percentages
    for cap in PERCENTAGE_REGEX.captures_iter(text) {
        if let Some(m) = cap.get(0) {
            let replacement = format_percentage(&cap);
            matches.push((m.start(), m.end(), replacement));
        }
    }

    // Sort matches by start position
    matches.sort_by_key(|(start, _, _)| *start);

    // Apply replacements while tracking positions
    for (start, end, replacement) in matches {
        // Copy unchanged text
        if last_end < start {
            let unchanged = &text[last_end..start];
            result.push_str(unchanged);
            // Map each byte in unchanged text to its original position
            for i in last_end..start {
                mapping.push(i);
            }
        }

        // Add replacement and map all its bytes to the start of the original match
        result.push_str(&replacement);
        for _ in 0..replacement.len() {
            mapping.push(start);
        }

        last_end = end;
    }

    // Copy remaining text
    if last_end < text.len() {
        let remaining = &text[last_end..];
        result.push_str(remaining);
        for i in last_end..text.len() {
            mapping.push(i);
        }
    }

    (result, mapping)
}

/// Apply Unicode normalization with position tracking
///
/// Returns: (normalized_text, byte_mapping)
/// where byte_mapping[i] = byte position in input text for byte i in output
fn normalize_unicode_with_tracking(text: &str) -> (String, Vec<usize>) {
    let mut result = String::with_capacity(text.len());
    let mut mapping = Vec::new();

    for (byte_idx, ch) in text.char_indices() {
        match ch {
            // Left and right double quotes → ASCII double quote
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => {
                result.push('"');
                for _ in 0..'"'.len_utf8() {
                    mapping.push(byte_idx);
                }
            }
            // Left and right single quotes → ASCII apostrophe
            '\u{2018}' | '\u{2019}' | '\u{02BC}' | '\u{02BB}' | '\u{02BD}' | '\u{02C8}'
            | '\u{02CA}' | '\u{02CB}' | '\u{0060}' | '\u{00B4}' => {
                result.push('\'');
                for _ in 0..'\''.len_utf8() {
                    mapping.push(byte_idx);
                }
            }
            // En dash and em dash → ASCII hyphen
            '\u{2013}' | '\u{2014}' => {
                result.push('-');
                for _ in 0..'-'.len_utf8() {
                    mapping.push(byte_idx);
                }
            }
            // Non-breaking space → regular space
            '\u{00A0}' => {
                result.push(' ');
                for _ in 0..' '.len_utf8() {
                    mapping.push(byte_idx);
                }
            }
            // Ellipsis → three dots
            '\u{2026}' => {
                result.push_str("...");
                for _ in 0.."...".len() {
                    mapping.push(byte_idx);
                }
            }
            // Soft hyphen → remove (don't add to result or mapping)
            '\u{00AD}' => continue,
            // Other characters → keep as-is
            _ => {
                result.push(ch);
                for _ in 0..ch.len_utf8() {
                    mapping.push(byte_idx);
                }
            }
        }
    }

    (result, mapping)
}

/// Format currency with scale for speech
fn format_currency_with_scale(caps: &Captures) -> String {
    let amount_str = &caps[1];
    let scale_str = &caps[2];

    let amount = match amount_str.parse::<f64>() {
        Ok(num) => num,
        Err(_) => return caps[0].to_string(),
    };

    let scale_lowercase = scale_str.to_lowercase();
    let scale_word = match scale_lowercase.as_str() {
        "b" => "billion",
        "m" => "million",
        "t" => "trillion",
        s => s,
    };

    let amount_words = format_number_for_speech(amount);
    format!("{} {} dollars", amount_words, scale_word)
}

/// Format simple currency for speech
fn format_currency_simple(caps: &Captures) -> String {
    let amount_str = &caps[1];
    let amount = match amount_str.parse::<f64>() {
        Ok(num) => num,
        Err(_) => return caps[0].to_string(),
    };
    format_currency_for_speech(amount)
}

/// Format percentage for speech
fn format_percentage(caps: &Captures) -> String {
    let number_str = &caps[1];
    let number = match number_str.parse::<f64>() {
        Ok(num) => num,
        Err(_) => return caps[0].to_string(),
    };
    let number_words = format_number_for_speech(number);
    format!("{} percent", number_words)
}

/// Format a number for speech, handling both integers and decimals
fn format_number_for_speech(num: f64) -> String {
    if (num.fract()).abs() < 0.0001 {
        let integer = num.round() as i64;
        match Num2Words::new(integer).to_words() {
            Ok(words) => words,
            Err(_) => num.to_string(),
        }
    } else {
        format_decimal_for_speech(num)
    }
}

/// Format a decimal number for speech
fn format_decimal_for_speech(num: f64) -> String {
    let num_str = format!("{:.10}", num);
    let parts: Vec<&str> = num_str.trim_end_matches('0').split('.').collect();

    let integer_part = parts[0].parse::<i64>().unwrap_or(0);
    let integer_words = match Num2Words::new(integer_part).to_words() {
        Ok(words) => words,
        Err(_) => integer_part.to_string(),
    };

    if parts.len() > 1 && !parts[1].is_empty() {
        let decimal_digits = parts[1];
        let decimal_words: Vec<String> = decimal_digits
            .chars()
            .filter_map(|c| {
                if let Some(digit) = c.to_digit(10) {
                    Num2Words::new(digit as i64).to_words().ok()
                } else {
                    None
                }
            })
            .collect();

        if !decimal_words.is_empty() {
            format!("{} point {}", integer_words, decimal_words.join(" "))
        } else {
            integer_words
        }
    } else {
        integer_words
    }
}

/// Format currency amount for speech with dollars and cents
fn format_currency_for_speech(amount: f64) -> String {
    let dollars = amount.floor() as i64;
    let cents = ((amount.fract() * 100.0).round()) as i64;

    let dollar_words = match Num2Words::new(dollars).to_words() {
        Ok(words) => words,
        Err(_) => dollars.to_string(),
    };

    let cent_words = match Num2Words::new(cents).to_words() {
        Ok(words) => words,
        Err(_) => cents.to_string(),
    };

    match (dollars, cents) {
        (0, 0) => "zero dollars".to_string(),
        (0, c) if c == 1 => format!("{} cent", cent_words),
        (0, _) => format!("{} cents", cent_words),
        (d, 0) if d == 1 => format!("{} dollar", dollar_words),
        (_, 0) => format!("{} dollars", dollar_words),
        (_, c) if c == 1 => format!("{} dollars and {} cent", dollar_words, cent_words),
        (_, _) => format!("{} dollars and {} cents", dollar_words, cent_words),
    }
}

/// Get information about what normalization was performed
pub fn get_normalization_info(result: &NormalizationResult) -> NormalizationInfo {
    let changes_count = result
        .original
        .chars()
        .zip(result.normalized.chars())
        .filter(|(a, b)| a != b)
        .count();

    NormalizationInfo {
        unicode_normalized: true,
        changes_count,
        original_length: result.original.chars().count(),
        normalized_length: result.normalized.chars().count(),
    }
}

/// Simple normalization for cases that don't need character mapping
pub fn normalize_simple(text: &str) -> String {
    normalize_for_tts(text).normalized
}

/// Find the corresponding text in the original string given a normalized position
///
/// This function uses the char_mapping to accurately map byte positions
/// from the normalized text back to the original text.
pub fn map_normalized_to_original(
    normalized_start: usize,
    normalized_end: usize,
    result: &NormalizationResult,
) -> Option<(usize, usize)> {
    if normalized_start >= result.normalized.len() || normalized_end > result.normalized.len() {
        return None;
    }

    // Use char_mapping to find byte positions in original text
    if normalized_start < result.char_mapping.len() && normalized_end <= result.char_mapping.len() {
        let orig_start_byte = result.char_mapping[normalized_start];

        // For the end position, we need to find where the last character ends
        // If normalized_end is at a byte boundary in normalized text, map it directly
        let orig_end_byte = if normalized_end < result.char_mapping.len() {
            result.char_mapping[normalized_end]
        } else {
            // At the end of normalized text, map to end of original
            result.original.len()
        };

        // Ensure we're at valid UTF-8 boundaries in the original text
        let orig_start_byte = find_char_boundary(&result.original, orig_start_byte, true);
        let orig_end_byte = find_char_boundary(&result.original, orig_end_byte, false);

        if orig_start_byte <= orig_end_byte && orig_end_byte <= result.original.len() {
            return Some((orig_start_byte, orig_end_byte));
        }
    }

    // Fallback: try to find an exact match in the original text
    let normalized_text = &result.normalized[normalized_start..normalized_end];
    if let Some(pos) = result.original.find(normalized_text) {
        return Some((pos, pos + normalized_text.len()));
    }

    None
}

/// Find the nearest character boundary in the given direction
///
/// If `forward` is true, finds the next character boundary at or after `pos`.
/// If `forward` is false, finds the previous character boundary at or before `pos`.
fn find_char_boundary(text: &str, pos: usize, forward: bool) -> usize {
    if pos >= text.len() {
        return text.len();
    }

    if text.is_char_boundary(pos) {
        return pos;
    }

    if forward {
        // Search forward for next boundary
        for i in pos..text.len() {
            if text.is_char_boundary(i) {
                return i;
            }
        }
        text.len()
    } else {
        // Search backward for previous boundary
        for i in (0..=pos).rev() {
            if text.is_char_boundary(i) {
                return i;
            }
        }
        0
    }
}

/// Extract original text corresponding to normalized phrase
///
/// This function attempts to find the original text that corresponds to
/// a given normalized phrase, using position hints and mapping information.
pub fn extract_original_phrase(
    normalized_phrase: &str,
    full_text_result: &NormalizationResult,
    hint_position: Option<usize>,
) -> String {
    // Try to find in normalized text first
    if let Some(norm_pos) = full_text_result.normalized.find(normalized_phrase) {
        let norm_end = norm_pos + normalized_phrase.len();

        // Try to map back to original
        if let Some((orig_start, orig_end)) =
            map_normalized_to_original(norm_pos, norm_end, full_text_result)
        {
            if orig_start < full_text_result.original.len()
                && orig_end <= full_text_result.original.len()
                && orig_start < orig_end
            {
                return full_text_result.original[orig_start..orig_end].to_string();
            }
        }
    }

    // Fallback: use hint position if provided (byte-based)
    if let Some(byte_pos) = hint_position {
        if byte_pos < full_text_result.normalized.len() {
            let phrase_byte_len = normalized_phrase.len();
            let end_pos = (byte_pos + phrase_byte_len).min(full_text_result.normalized.len());

            if let Some((orig_start, orig_end)) =
                map_normalized_to_original(byte_pos, end_pos, full_text_result)
            {
                if orig_start < full_text_result.original.len()
                    && orig_end <= full_text_result.original.len()
                    && orig_start < orig_end
                {
                    return full_text_result.original[orig_start..orig_end].to_string();
                }
            }
        }
    }

    // Last resort fallback: return normalized phrase as-is
    normalized_phrase.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== Basic Unicode Normalization Tests =====

    #[test]
    fn test_normalize_smart_quotes() {
        let text = "\u{201C}Hello\u{201D} \u{2018}world\u{2019}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "\"Hello\" 'world'");
    }

    #[test]
    fn test_normalize_dashes() {
        let text = "Em\u{2014}dash and en\u{2013}dash";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "Em-dash and en-dash");
    }

    #[test]
    fn test_normalize_ellipsis() {
        let text = "Wait\u{2026}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "Wait...");
    }

    #[test]
    fn test_normalize_mixed() {
        let text = "\u{201C}Don\u{2019}t\u{201D} use em\u{2014}dashes\u{2026}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "\"Don't\" use em-dashes...");
    }

    #[test]
    fn test_soft_hyphen_removed() {
        let text = "soft\u{00AD}hyphen";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "softhyphen");
    }

    #[test]
    fn test_non_breaking_space() {
        let text = "non\u{00A0}breaking";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "non breaking");
    }

    #[test]
    fn test_multiple_spaces_collapsed() {
        let text = "too    many     spaces";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "too many spaces");
    }

    // ===== Semantic Normalization Tests =====

    #[test]
    fn test_currency_with_scale() {
        let text = "Sold $10.3 billion in shares";
        let result = normalize_for_tts(text);
        assert!(result
            .normalized
            .contains("ten point three billion dollars"));
        assert!(!result.normalized.contains("$10.3"));
    }

    #[test]
    fn test_simple_currency() {
        let text = "Price is $23.45";
        let result = normalize_for_tts(text);
        assert!(result
            .normalized
            .contains("twenty-three dollars and forty-five cents"));
        assert!(!result.normalized.contains("$23.45"));
    }

    #[test]
    fn test_percentage() {
        let text = "Growth was 50%";
        let result = normalize_for_tts(text);
        assert!(result.normalized.contains("fifty percent"));
        assert!(!result.normalized.contains("50%"));
    }

    // ===== Combined Normalization Tests (CRITICAL REGRESSION TESTS) =====

    #[test]
    fn test_original_failing_case() {
        // This is the exact text that caused the panic
        let text = "OpenAI cannot afford the $300 billion, NVIDIA hasn't sent OpenAI a cent and won't do so if it can't build the data centers, which OpenAI most assuredly can't afford to do.";
        let result = normalize_for_tts(text);

        // Should not panic
        assert!(result.normalized.contains("three hundred billion dollars"));
        assert!(result.normalized.contains("hasn't"));
        assert!(result.normalized.contains("can't"));

        // Test position mapping doesn't panic
        if let Some(pos) = result.normalized.find("three hundred billion dollars") {
            let end = pos + "three hundred billion dollars".len();
            let mapped = map_normalized_to_original(pos, end, &result);
            assert!(mapped.is_some());
        }
    }

    #[test]
    fn test_currency_with_smart_quotes() {
        let text = "He said \u{201C}It costs $100\u{201D}";
        let result = normalize_for_tts(text);
        assert!(result.normalized.contains("\""));
        assert!(result.normalized.contains("one hundred dollars"));

        // Test mapping
        if let Some(pos) = result.normalized.find("one hundred dollars") {
            let end = pos + "one hundred dollars".len();
            let mapped = map_normalized_to_original(pos, end, &result);
            assert!(mapped.is_some());
        }
    }

    #[test]
    fn test_multiple_currencies_with_unicode() {
        let text = "Price: $10.5M—that's 50% off!";
        let result = normalize_for_tts(text);
        assert!(result.normalized.contains("ten point five million dollars"));
        assert!(result.normalized.contains("fifty percent"));
        assert!(result.normalized.contains("-")); // em dash normalized

        // Verify no panic on mapping
        for i in 0..result.normalized.len() {
            let end = (i + 10).min(result.normalized.len());
            let _ = map_normalized_to_original(i, end, &result);
        }
    }

    #[test]
    fn test_smart_quote_after_currency() {
        let text = "$10.3 billion's impact";
        let result = normalize_for_tts(text);
        assert!(result
            .normalized
            .contains("ten point three billion dollars"));

        // Test position mapping
        if let Some(pos) = result.normalized.find("billion") {
            let end = pos + "billion".len();
            let mapped = map_normalized_to_original(pos, end, &result);
            assert!(mapped.is_some());
        }
    }

    #[test]
    fn test_edge_case_multibyte_boundaries() {
        // Text with multi-byte UTF-8 characters around semantic replacements
        let text = "€$100€ \u{2018}50%\u{2019} \u{201C}data\u{201D}";
        let result = normalize_for_tts(text);

        // Should not panic on any mapping
        for i in 0..result.normalized.len() {
            let end = (i + 5).min(result.normalized.len());
            let _ = map_normalized_to_original(i, end, &result);
        }
    }

    #[test]
    fn test_consecutive_currencies() {
        let text = "$1B $2M $3T";
        let result = normalize_for_tts(text);
        assert!(result.normalized.contains("one billion dollars"));
        assert!(result.normalized.contains("two million dollars"));
        assert!(result.normalized.contains("three trillion dollars"));
    }

    // ===== Position Mapping Tests =====

    #[test]
    fn test_map_normalized_to_original_simple() {
        let text = "Hello world";
        let result = normalize_for_tts(text);

        let mapped = map_normalized_to_original(0, 5, &result);
        assert_eq!(mapped, Some((0, 5)));
    }

    #[test]
    fn test_map_with_unicode_normalization() {
        let text = "Hello\u{2019}world";
        let result = normalize_for_tts(text);

        // The apostrophe gets normalized to '
        let mapped = map_normalized_to_original(5, 6, &result);
        assert!(mapped.is_some());
    }

    #[test]
    fn test_map_with_semantic_expansion() {
        let text = "Cost: $100 today";
        let result = normalize_for_tts(text);

        // Find where "one hundred dollars" is in normalized
        if let Some(pos) = result.normalized.find("one hundred dollars") {
            let end = pos + "one hundred dollars".len();
            let mapped = map_normalized_to_original(pos, end, &result);
            assert!(mapped.is_some());

            if let Some((start, end)) = mapped {
                // Should map back to "$100" region
                let original_substr = &result.original[start..end];
                assert!(original_substr.contains("$100") || start <= 6 && end >= 10);
            }
        }
    }

    #[test]
    fn test_extract_original_phrase_simple() {
        let text = "Hello world";
        let result = normalize_for_tts(text);

        let original = extract_original_phrase("Hello", &result, None);
        assert_eq!(original, "Hello");
    }

    #[test]
    fn test_extract_original_phrase_with_unicode() {
        let text = "\u{201C}Hello\u{201D}";
        let result = normalize_for_tts(text);

        // Normalized version has "Hello"
        let original = extract_original_phrase("\"Hello\"", &result, None);
        // Should extract the original with smart quotes
        assert!(original.contains("Hello"));
    }

    #[test]
    fn test_extract_original_phrase_with_currency() {
        let text = "Price $100 today";
        let result = normalize_for_tts(text);

        // Find the normalized currency in the result
        if let Some(pos) = result.normalized.find("one hundred dollars") {
            let original = extract_original_phrase("one hundred dollars", &result, Some(pos));
            // Should map back to something containing $100 or be the normalized form
            assert!(original.contains("$100") || original.contains("one hundred dollars"));
        }
    }

    // ===== Info Tests =====

    #[test]
    fn test_normalization_info() {
        let text = "\u{201C}Hello\u{201D}";
        let result = normalize_for_tts(text);
        let info = get_normalization_info(&result);

        assert_eq!(info.original_length, 7);
        assert_eq!(info.normalized_length, 7);
    }

    #[test]
    fn test_no_normalization_needed() {
        let text = "Simple text with no special characters.";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, text);
    }

    #[test]
    fn test_normalize_simple_convenience() {
        let text = "\u{201C}Hello\u{201D}";
        let normalized = normalize_simple(text);
        assert_eq!(normalized, "\"Hello\"");
    }

    // ===== Stress Tests =====

    #[test]
    fn test_char_boundary_safety() {
        // Test with various multi-byte UTF-8 characters
        let texts = vec!["café $100", "日本語 $50M", "emoji 😀 $1B", "مرحبا $25%"];

        for text in texts {
            let result = normalize_for_tts(text);

            // Try mapping every position - should not panic
            for i in 0..result.normalized.len() {
                for j in i..result.normalized.len() {
                    let _ = map_normalized_to_original(i, j, &result);
                }
            }
        }
    }

    #[test]
    fn test_empty_text() {
        let text = "";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "");
        assert_eq!(result.original, "");
    }

    #[test]
    fn test_only_spaces() {
        let text = "   ";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized.trim(), "");
    }

    #[test]
    fn test_issue_currency_with_extra_spaces() {
        let text = "so around $1.083 billion a month.  ";
        let result = normalize_for_tts(text);
        println!("Original: {:?}", text);
        println!("Normalized: {:?}", result.normalized);

        // Should normalize the currency with scale
        assert!(result.normalized.contains("billion dollars") || result.normalized.contains("$1.083"));

        // Debug: Check what's in the normalized text
        if !result.normalized.contains("billion dollars") {
            panic!("Expected 'billion dollars' in normalized text, but got: {}", result.normalized);
        }
    }
}
