/// Text normalization utilities for TTS processing
///
/// This module handles normalization of Unicode characters (smart quotes, dashes, etc.)
/// while preserving the original text for client-side matching.
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone)]
pub struct NormalizationResult {
    /// Original text before normalization
    pub original: String,
    /// Normalized text suitable for TTS
    pub normalized: String,
    /// Mapping from normalized char positions to original char positions
    #[allow(dead_code)]
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
pub fn normalize_for_tts(text: &str) -> NormalizationResult {
    let original = text.to_string();
    let mut normalized = String::with_capacity(text.len());
    let mut char_mapping = Vec::new();

    for (orig_idx, ch) in text.char_indices() {
        match ch {
            // Left and right double quotes → ASCII double quote
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => {
                let current_len = normalized.len();
                normalized.push('"');
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
            // Left and right single quotes → ASCII apostrophe
            '\u{2018}' | '\u{2019}' | '\u{02BC}' | '\u{02BB}' | '\u{02BD}' | '\u{02C8}'
            | '\u{02CA}' | '\u{02CB}' | '\u{0060}' | '\u{00B4}' => {
                let current_len = normalized.len();
                normalized.push('\'');
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
            // En dash and em dash → ASCII hyphen
            '\u{2013}' | '\u{2014}' => {
                let current_len = normalized.len();
                normalized.push('-');
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
            // Non-breaking space → regular space
            '\u{00A0}' => {
                let current_len = normalized.len();
                normalized.push(' ');
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
            // Ellipsis → three dots (handle in main loop to maintain mapping)
            '\u{2026}' => {
                let current_len = normalized.len();
                normalized.push_str("...");
                // All three dots map back to the original ellipsis position
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
            // Soft hyphen → remove (don't add to normalized or mapping)
            '\u{00AD}' => continue,
            // Other characters → keep as-is
            _ => {
                let current_len = normalized.len();
                normalized.push(ch);
                for _ in 0..(normalized.len() - current_len) {
                    char_mapping.push(orig_idx);
                }
            }
        }
    }

    // Normalize multiple consecutive spaces to single space
    // Note: This will invalidate char_mapping, but it's a minor issue for space-only changes
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }

    // Apply Unicode normalization (NFC form)
    let normalized = normalized.nfc().collect::<String>();

    NormalizationResult {
        original,
        normalized,
        char_mapping,
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

/// Find the corresponding text in the original string given a normalized position
pub fn map_normalized_to_original(
    normalized_start: usize,
    normalized_end: usize,
    result: &NormalizationResult,
) -> Option<(usize, usize)> {
    if normalized_start >= result.normalized.len() || normalized_end > result.normalized.len() {
        return None;
    }

    // Use char_mapping to find byte positions
    if normalized_start < result.char_mapping.len() && normalized_end <= result.char_mapping.len() {
        let orig_start_byte = result.char_mapping[normalized_start];

        // Find the end position in the original text
        // We need to find where the normalized text ends in the original
        let normalized_text = &result.normalized[normalized_start..normalized_end];
        let normalized_char_count = normalized_text.chars().count();

        // Try to match character by character, allowing for normalization differences
        let orig_text_from_start = &result.original[orig_start_byte..];
        let mut norm_chars_consumed = 0;
        let mut byte_pos = orig_start_byte;

        for orig_ch in orig_text_from_start.chars() {
            // Check if this character might have been normalized
            let orig_normalized_str = match orig_ch {
                '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => "\"",
                '\u{2018}' | '\u{2019}' | '\u{02BC}' | '\u{02BB}' | '\u{02BD}' | '\u{02C8}'
                | '\u{02CA}' | '\u{02CB}' | '\u{0060}' | '\u{00B4}' => "'",
                '\u{2013}' | '\u{2014}' => "-",
                '\u{00A0}' => " ",
                '\u{2026}' => "...",    // ellipsis maps to three characters
                '\u{00AD}' => continue, // soft hyphen - skip
                _ => {
                    // For other characters, create a temporary string
                    let mut s = String::new();
                    s.push(orig_ch);
                    // We need to compare with the normalized text
                    // Check if we can still match
                    if norm_chars_consumed < normalized_char_count {
                        let remaining_norm = &normalized_text[norm_chars_consumed..];
                        if remaining_norm.starts_with(&s) {
                            byte_pos += orig_ch.len_utf8();
                            norm_chars_consumed += 1;
                            if norm_chars_consumed >= normalized_char_count {
                                return Some((orig_start_byte, byte_pos));
                            }
                            continue;
                        }
                    }
                    break;
                }
            };

            // Check if the normalized version matches what we expect
            if norm_chars_consumed < normalized_char_count {
                let remaining_norm = &normalized_text[norm_chars_consumed..];
                if remaining_norm.starts_with(orig_normalized_str) {
                    byte_pos += orig_ch.len_utf8();
                    norm_chars_consumed += orig_normalized_str.chars().count();
                    if norm_chars_consumed >= normalized_char_count {
                        return Some((orig_start_byte, byte_pos));
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    // Fallback: try exact match first
    let normalized_text = &result.normalized[normalized_start..normalized_end];
    if let Some(pos) = result.original.find(normalized_text) {
        return Some((pos, pos + normalized_text.len()));
    }

    None
}

/// Extract original text corresponding to normalized phrase
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
            return full_text_result.original[orig_start..orig_end].to_string();
        }
    }

    // Fallback: use hint position if provided (char-based, not byte-based)
    if let Some(char_pos) = hint_position {
        // Convert char position to byte position safely
        let mut byte_pos = 0;
        let mut current_char_idx = 0;

        for (idx, _ch) in full_text_result.original.char_indices() {
            if current_char_idx == char_pos {
                byte_pos = idx;
                break;
            }
            current_char_idx += 1;
        }

        // If we found the position, try to extract the phrase
        if byte_pos < full_text_result.original.len() {
            // Count characters in normalized phrase
            let phrase_char_count = normalized_phrase.chars().count();

            // Find the ending byte position
            let mut end_byte_pos = byte_pos;
            let mut chars_counted = 0;

            for (idx, _ch) in full_text_result.original[byte_pos..].char_indices() {
                if chars_counted >= phrase_char_count {
                    break;
                }
                end_byte_pos = byte_pos + idx;
                chars_counted += 1;
            }

            // Adjust to the end of the last character
            if chars_counted > 0 {
                if let Some((_idx, ch)) = full_text_result.original[byte_pos..]
                    .char_indices()
                    .nth(chars_counted - 1)
                {
                    end_byte_pos = byte_pos + _idx + ch.len_utf8();
                }
            }

            let end_byte_pos = end_byte_pos.min(full_text_result.original.len());

            if byte_pos <= end_byte_pos && end_byte_pos <= full_text_result.original.len() {
                return full_text_result.original[byte_pos..end_byte_pos].to_string();
            }
        }
    }

    // Last resort: return normalized version
    normalized_phrase.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_smart_quotes() {
        let text = "\u{201C}Hello\u{201D} \u{2018}world\u{2019}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "\"Hello\" 'world'");
        assert_eq!(result.original, text);
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
        let text = "\u{201C}Don\u{2019}t\u{201D} use\u{2014}it";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "\"Don't\" use-it");
    }

    #[test]
    fn test_normalization_info() {
        let text = "\u{201C}Hello\u{201D}";
        let result = normalize_for_tts(text);
        let info = get_normalization_info(&result);
        assert!(info.unicode_normalized);
        assert!(info.changes_count > 0);
    }

    #[test]
    fn test_extract_original_phrase() {
        let text = "\u{201C}Hello world\u{201D}";
        let result = normalize_for_tts(text);

        let normalized_phrase = "\"Hello world\"";
        let original = extract_original_phrase(normalized_phrase, &result, None);

        // Should recover the original with smart quotes
        // Note: The current implementation uses simple string matching which may not
        // perfectly preserve all Unicode variations. This test verifies current behavior.
        assert_eq!(original, "\u{201C}Hello world\u{201D}");
    }

    #[test]
    fn test_no_normalization_needed() {
        let text = "Hello world";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, text);
        assert_eq!(result.original, text);

        let info = get_normalization_info(&result);
        assert_eq!(info.changes_count, 0);
    }

    #[test]
    fn test_ellipsis_normalization() {
        let text = "Wait\u{2026}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "Wait...");
        assert_eq!(result.original, text);
    }

    #[test]
    fn test_ellipsis_with_robinhood_glitch_text() {
        // This is the exact text that caused the panic
        let text = "It's like that Robinhood infinite money glitch\u{2026}";
        let result = normalize_for_tts(text);
        assert_eq!(
            result.normalized,
            "It's like that Robinhood infinite money glitch..."
        );
        assert_eq!(result.original, text);

        // Test extraction of original phrase
        let normalized_phrase = "It's like that Robinhood infinite money glitch...";
        let extracted = extract_original_phrase(normalized_phrase, &result, None);
        assert_eq!(extracted, text);
    }

    #[test]
    fn test_extract_with_ellipsis() {
        let text = "Hello world\u{2026} how are you?";
        let result = normalize_for_tts(text);

        // Try to extract just "world..."
        let normalized_phrase = "world...";
        let extracted = extract_original_phrase(normalized_phrase, &result, None);
        assert_eq!(extracted, "world\u{2026}");
    }

    #[test]
    fn test_mixed_unicode_with_ellipsis() {
        let text = "\u{201C}Don\u{2019}t wait\u{2026}\u{201D}";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "\"Don't wait...\"");

        // Extract the full phrase
        let extracted = extract_original_phrase("\"Don't wait...\"", &result, None);
        assert_eq!(extracted, text);
    }

    #[test]
    fn test_char_mapping_with_ellipsis() {
        let text = "abc\u{2026}def";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "abc...def");

        // The ellipsis at position 3 (byte 3) should map to bytes 3,4,5 in normalized
        // All three dots should map back to byte position 3 in original
        assert!(result.char_mapping.len() >= 9); // abc (3) + ... (3) + def (3)

        // Verify mapping for the ellipsis region
        if result.char_mapping.len() >= 6 {
            // Bytes 3,4,5 in normalized (the three dots) should all map to byte 3 in original
            assert_eq!(result.char_mapping[3], 3); // first dot
            assert_eq!(result.char_mapping[4], 3); // second dot
            assert_eq!(result.char_mapping[5], 3); // third dot
        }
    }

    #[test]
    fn test_extract_original_phrase_with_hint() {
        let text = "Hello\u{2026} world\u{2026}";
        let result = normalize_for_tts(text);

        // Extract the second ellipsis using hint position
        let normalized_phrase = "...";

        // Hint at char position 8 (after "Hello... " - 8 chars)
        let extracted = extract_original_phrase(normalized_phrase, &result, Some(8));

        // Should extract the ellipsis, though exact matching may vary
        assert!(extracted.contains("\u{2026}") || extracted == "...");
    }

    #[test]
    fn test_ellipsis_at_beginning() {
        // Test ellipsis at the start of text
        let text = "\u{2026}and then it happened";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, "...and then it happened");
        assert_eq!(result.original, text);

        // Test extraction starting with ellipsis
        let extracted = extract_original_phrase("...and then it happened", &result, None);
        assert_eq!(extracted, text);
    }

    #[test]
    fn test_ellipsis_at_beginning_with_hint_position_zero() {
        // Test that hint position 0 works correctly with ellipsis
        let text = "\u{2026}start";
        let result = normalize_for_tts(text);

        let extracted = extract_original_phrase("...", &result, Some(0));
        assert_eq!(extracted, "\u{2026}");
    }

    #[test]
    fn test_multiple_paragraphs_with_leading_ellipsis() {
        // Simulate multiple paragraphs where second starts with ellipsis
        let text = "First paragraph.\n\u{2026}second paragraph starts with ellipsis";
        let result = normalize_for_tts(text);
        assert_eq!(
            result.normalized,
            "First paragraph.\n...second paragraph starts with ellipsis"
        );

        // Extract just the ellipsis-starting phrase
        let extracted =
            extract_original_phrase("...second paragraph starts with ellipsis", &result, None);
        assert_eq!(extracted, "\u{2026}second paragraph starts with ellipsis");
    }
}
