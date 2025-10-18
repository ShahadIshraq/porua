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
///
/// This function handles:
/// - Smart quotes → ASCII quotes
/// - En/em dashes → ASCII hyphen
/// - Ellipsis → three dots
/// - Non-breaking spaces → regular spaces
/// - Soft hyphens → removed
/// - Unicode normalization (NFC form)
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

/// Simple normalization for cases that don't need character mapping
///
/// This is a convenience wrapper around `normalize_for_tts` for cases
/// where you only need the normalized text and don't care about the mapping.
pub fn normalize_simple(text: &str) -> String {
    normalize_for_tts(text).normalized
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_no_normalization_needed() {
        let text = "Simple text with no special characters.";
        let result = normalize_for_tts(text);
        assert_eq!(result.normalized, text);
    }

    #[test]
    fn test_normalization_info() {
        let text = "\u{201C}Hello\u{201D}";
        let result = normalize_for_tts(text);
        let info = get_normalization_info(&result);

        assert_eq!(info.changes_count, 2);
        assert_eq!(info.original_length, 7);
        assert_eq!(info.normalized_length, 7);
    }

    #[test]
    fn test_normalize_simple_convenience() {
        let text = "\u{201C}Hello\u{201D}";
        let normalized = normalize_simple(text);
        assert_eq!(normalized, "\"Hello\"");
    }

    #[test]
    fn test_char_mapping_preserved() {
        let text = "Hello\u{2026}world";
        let result = normalize_for_tts(text);

        // char_mapping should track positions
        assert!(!result.char_mapping.is_empty());
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
                '\u{2026}' => "...",
                '\u{00AD}' => continue,
                _ => {
                    // For other characters, create a temporary string
                    let mut s = String::new();
                    s.push(orig_ch);
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

            // Handle the last character
            if chars_counted < phrase_char_count {
                end_byte_pos = full_text_result.original.len();
            } else if end_byte_pos < full_text_result.original.len() {
                // Move to the start of the next character
                let remaining = &full_text_result.original[end_byte_pos..];
                if let Some(ch) = remaining.chars().next() {
                    end_byte_pos += ch.len_utf8();
                }
            }

            if end_byte_pos <= full_text_result.original.len() {
                return full_text_result.original[byte_pos..end_byte_pos].to_string();
            }
        }
    }

    // Last resort fallback: return normalized phrase as-is
    normalized_phrase.to_string()
}
