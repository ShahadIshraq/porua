/// Configuration for text segmentation behavior
#[derive(Debug, Clone)]
pub struct SegmentationConfig {
    /// Maximum words per phrase (default: 8, based on typical breath groups)
    pub max_phrase_words: usize,

    /// Whether to normalize Unicode characters (quotes, dashes, etc.)
    pub normalize_unicode: bool,

    /// Whether to split phrases at commas and semicolons
    pub respect_comma_boundaries: bool,

    /// Whether to separate punctuation from words
    pub separate_punctuation: bool,
}

impl Default for SegmentationConfig {
    fn default() -> Self {
        Self {
            max_phrase_words: 8,
            normalize_unicode: true,
            respect_comma_boundaries: true,
            separate_punctuation: false, // Keep current behavior by default
        }
    }
}

/// Normalize Unicode characters to ASCII equivalents
/// - Converts various quote marks to standard ASCII quotes
/// - Converts en-dashes and em-dashes to hyphens
/// - Handles various apostrophe forms
fn normalize_unicode(text: &str) -> String {
    text
        // Left and right single quotes → ASCII apostrophe
        .replace(&['\u{2018}', '\u{2019}', '\u{02BC}', '\u{02BB}',
                   '\u{02BD}', '\u{02C8}', '\u{02CA}', '\u{02CB}',
                   '\u{0060}', '\u{00B4}'][..], "'")
        // Left and right double quotes → ASCII double quote
        .replace(&['\u{201C}', '\u{201D}', '\u{201E}', '\u{201F}'][..], "\"")
        // En-dash and em-dash → ASCII hyphen
        .replace(&['\u{2013}', '\u{2014}'][..], "-")
        // Horizontal ellipsis → three periods
        .replace('\u{2026}', "...")
}

/// Internal: Segment words preserving punctuation (current behavior)
fn segment_words_preserve_punctuation(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current_word = String::new();

    for ch in text.chars() {
        if ch.is_whitespace() {
            if !current_word.is_empty() {
                words.push(current_word.clone());
                current_word.clear();
            }
        } else {
            current_word.push(ch);
        }
    }

    if !current_word.is_empty() {
        words.push(current_word);
    }

    words
}

/// Internal: Segment words separating punctuation
fn segment_words_separate_punctuation(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current_word = String::new();

    // Common sentence-ending punctuation
    let sentence_punct = ['.', '!', '?'];
    // Other punctuation to separate
    let other_punct = [',', ';', ':', '"', '\'', '(', ')', '[', ']', '{', '}'];

    for ch in text.chars() {
        if ch.is_whitespace() {
            if !current_word.is_empty() {
                words.push(current_word.clone());
                current_word.clear();
            }
        } else if sentence_punct.contains(&ch) || other_punct.contains(&ch) {
            // Push current word if exists
            if !current_word.is_empty() {
                words.push(current_word.clone());
                current_word.clear();
            }
            // Push punctuation as separate token
            words.push(ch.to_string());
        } else {
            current_word.push(ch);
        }
    }

    if !current_word.is_empty() {
        words.push(current_word);
    }

    words
}

/// Split text into words with configuration options
pub fn segment_words_with_config(text: &str, config: &SegmentationConfig) -> Vec<String> {
    let text = if config.normalize_unicode {
        normalize_unicode(text)
    } else {
        text.to_string()
    };

    if config.separate_punctuation {
        segment_words_separate_punctuation(&text)
    } else {
        segment_words_preserve_punctuation(&text)
    }
}

/// Split text into words, preserving punctuation with words (backward compatible)
pub fn segment_words(text: &str) -> Vec<String> {
    segment_words_with_config(text, &SegmentationConfig::default())
}

/// Internal: Simple phrase segmentation (improved version of current)
fn segment_phrases_simple(text: &str, max_words: usize) -> Vec<String> {
    let mut phrases = Vec::new();

    // Split by sentence-ending punctuation
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect();

    for sentence in sentences {
        let sentence = sentence.trim();
        let words = segment_words_preserve_punctuation(sentence);

        if words.len() <= max_words {
            phrases.push(sentence.to_string());
        } else {
            // Split into max_words chunks
            for chunk in words.chunks(max_words) {
                let phrase = chunk.join(" ");
                phrases.push(phrase);
            }
        }
    }

    phrases
}

/// Internal: Comma-aware phrase segmentation
fn segment_phrases_comma_aware(text: &str, max_words: usize) -> Vec<String> {
    let mut phrases = Vec::new();

    // First split by sentence-ending punctuation
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect();

    for sentence in sentences {
        let sentence = sentence.trim();

        // Split by commas and semicolons
        let clauses: Vec<&str> = sentence
            .split(|c| c == ',' || c == ';')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        for clause in clauses {
            let words = segment_words_preserve_punctuation(clause);

            if words.len() <= max_words {
                // Clause fits within limit, use as-is
                phrases.push(clause.to_string());
            } else {
                // Clause too long, split into chunks
                for chunk in words.chunks(max_words) {
                    let phrase = chunk.join(" ");
                    phrases.push(phrase);
                }
            }
        }
    }

    phrases
}

/// Split text into phrases with configuration
pub fn segment_phrases_with_config(text: &str, config: &SegmentationConfig) -> Vec<String> {
    let text = if config.normalize_unicode {
        normalize_unicode(text)
    } else {
        text.to_string()
    };

    if config.respect_comma_boundaries {
        segment_phrases_comma_aware(&text, config.max_phrase_words)
    } else {
        segment_phrases_simple(&text, config.max_phrase_words)
    }
}

/// Split text into phrases (backward compatible with new default)
/// Now uses 8-word chunks instead of 5 for better breath groups
pub fn segment_phrases(text: &str) -> Vec<String> {
    segment_phrases_with_config(text, &SegmentationConfig::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segmentation_config_default() {
        let config = SegmentationConfig::default();
        assert_eq!(config.max_phrase_words, 8);
        assert_eq!(config.normalize_unicode, true);
        assert_eq!(config.respect_comma_boundaries, true);
        assert_eq!(config.separate_punctuation, false);
    }

    #[test]
    fn test_normalize_unicode_quotes() {
        let text = "\u{201C}Hello\u{201D} \u{2018}world\u{2019}";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "\"Hello\" 'world'");
    }

    #[test]
    fn test_normalize_unicode_dashes() {
        let text = "Em\u{2014}dash and en\u{2013}dash";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "Em-dash and en-dash");
    }

    #[test]
    fn test_normalize_unicode_ellipsis() {
        let text = "Wait\u{2026}";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "Wait...");
    }

    #[test]
    fn test_normalize_unicode_apostrophes() {
        let text = "don\u{2019}t can\u{2019}t won\u{2019}t";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "don't can't won't");
    }

    #[test]
    fn test_segment_words_basic() {
        let text = "Hello world, this is great!";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world,", "this", "is", "great!"]);
    }

    #[test]
    fn test_segment_words_backward_compatible() {
        let text = "Hello world, this is great!";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world,", "this", "is", "great!"]);
    }

    #[test]
    fn test_segment_words_with_unicode_normalization() {
        let config = SegmentationConfig::default();
        let text = "\u{201C}Hello\u{201D} \u{2018}world\u{2019}";
        let words = segment_words_with_config(text, &config);
        assert_eq!(words, vec!["\"Hello\"", "'world'"]);
    }

    #[test]
    fn test_segment_words_separate_punctuation() {
        let config = SegmentationConfig {
            separate_punctuation: true,
            ..Default::default()
        };
        let text = "Hello, world!";
        let words = segment_words_with_config(text, &config);
        assert_eq!(words, vec!["Hello", ",", "world", "!"]);
    }

    #[test]
    fn test_segment_words_preserve_punctuation() {
        let config = SegmentationConfig {
            separate_punctuation: false,
            ..Default::default()
        };
        let text = "Hello, world!";
        let words = segment_words_with_config(text, &config);
        assert_eq!(words, vec!["Hello,", "world!"]);
    }

    #[test]
    fn test_segment_words_multiple_spaces() {
        let text = "Hello    world";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world"]);
    }

    #[test]
    fn test_segment_words_empty() {
        let text = "";
        let words = segment_words(text);
        assert_eq!(words, Vec::<String>::new());
    }

    #[test]
    fn test_segment_words_whitespace_only() {
        let text = "   \t\n  ";
        let words = segment_words(text);
        assert_eq!(words, Vec::<String>::new());
    }

    #[test]
    fn test_segment_words_punctuation() {
        let text = "Hello, world! How are you?";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello,", "world!", "How", "are", "you?"]);
    }

    #[test]
    fn test_segment_phrases_basic() {
        let text = "Hello world. This is great!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 2);
        assert_eq!(phrases[0], "Hello world");
        assert_eq!(phrases[1], "This is great");
    }

    #[test]
    fn test_segment_phrases_configurable_length() {
        let config = SegmentationConfig {
            max_phrase_words: 3,
            respect_comma_boundaries: false,
            ..Default::default()
        };
        let text = "This is a very long sentence.";
        let phrases = segment_phrases_with_config(text, &config);
        // Should split into 3-word chunks
        assert!(phrases.len() >= 2);
        for phrase in &phrases[..phrases.len()-1] {
            let words = segment_words(phrase);
            assert!(words.len() <= 3);
        }
    }

    #[test]
    fn test_segment_phrases_comma_aware() {
        let config = SegmentationConfig {
            max_phrase_words: 8,
            respect_comma_boundaries: true,
            ..Default::default()
        };
        let text = "Hello there, how are you, doing today?";
        let phrases = segment_phrases_with_config(text, &config);
        assert_eq!(phrases.len(), 3);
        assert_eq!(phrases[0], "Hello there");
        assert_eq!(phrases[1], "how are you");
        assert_eq!(phrases[2], "doing today");
    }

    #[test]
    fn test_segment_phrases_long_clause_splits() {
        let config = SegmentationConfig {
            max_phrase_words: 5,
            respect_comma_boundaries: true,
            ..Default::default()
        };
        let text = "This is a very long clause with many words, and another part.";
        let phrases = segment_phrases_with_config(text, &config);
        // First clause should split, second should remain
        assert!(phrases.len() >= 2);
    }

    #[test]
    fn test_segment_phrases_backward_compatible() {
        // Default config should work for existing callers
        let text = "Hello world. This is great!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 2);
    }

    #[test]
    fn test_segment_phrases_long_sentence() {
        let text = "This is a very long sentence with more than eight words in it.";
        let phrases = segment_phrases(text);
        // Should split with new 8-word default
        assert!(phrases.len() >= 2);
    }

    #[test]
    fn test_segment_phrases_short_sentence() {
        let text = "Hello there!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 1);
        assert_eq!(phrases[0], "Hello there");
    }
}
