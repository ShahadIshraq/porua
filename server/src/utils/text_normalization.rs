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
        let normalized_ch = match ch {
            // Left and right double quotes → ASCII double quote
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
            // Left and right single quotes → ASCII apostrophe
            '\u{2018}' | '\u{2019}' | '\u{02BC}' | '\u{02BB}' |
            '\u{02BD}' | '\u{02C8}' | '\u{02CA}' | '\u{02CB}' |
            '\u{0060}' | '\u{00B4}' => '\'',
            // En dash and em dash → ASCII hyphen
            '\u{2013}' | '\u{2014}' => '-',
            // Non-breaking space → regular space
            '\u{00A0}' => ' ',
            // Soft hyphen → remove
            '\u{00AD}' => continue,
            // Other characters → keep as-is
            _ => ch,
        };

        // Track character position mapping
        let current_normalized_len = normalized.len();
        normalized.push(normalized_ch);

        // Map each byte in the normalized char back to the original position
        for _ in 0..(normalized.len() - current_normalized_len) {
            char_mapping.push(orig_idx);
        }
    }

    // Handle ellipsis separately (multi-char replacement)
    normalized = normalized.replace('\u{2026}', "...");

    // Normalize multiple consecutive spaces to single space
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
    let changes_count = result.original.chars().zip(result.normalized.chars())
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

    // Simple approach: try to find the text in both versions
    let normalized_text = &result.normalized[normalized_start..normalized_end];

    // Try exact match first
    if let Some(pos) = result.original.find(normalized_text) {
        return Some((pos, pos + normalized_text.len()));
    }

    // Try fuzzy matching - look for similar text
    // This is a simple approach; more sophisticated algorithms could be used
    let original_lower = result.original.to_lowercase();
    let normalized_lower = normalized_text.to_lowercase();

    if let Some(pos) = original_lower.find(&normalized_lower) {
        let end_pos = pos + normalized_text.len();
        // Verify this is a reasonable match
        if end_pos <= result.original.len() {
            return Some((pos, end_pos));
        }
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
        if let Some((orig_start, orig_end)) = map_normalized_to_original(
            norm_pos,
            norm_end,
            full_text_result,
        ) {
            return full_text_result.original[orig_start..orig_end].to_string();
        }
    }

    // Fallback: use hint position if provided
    if let Some(pos) = hint_position {
        if pos < full_text_result.original.len() {
            let end = (pos + normalized_phrase.len()).min(full_text_result.original.len());
            return full_text_result.original[pos..end].to_string();
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
        assert_eq!(original, text);
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
}
