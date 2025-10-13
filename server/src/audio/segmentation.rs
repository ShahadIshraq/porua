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

    /// Whether to treat em-dashes as sentence boundaries
    pub emdash_as_boundary: bool,
}

impl Default for SegmentationConfig {
    fn default() -> Self {
        Self::for_tts()
    }
}

impl SegmentationConfig {
    /// Preset for TTS applications (optimized defaults)
    pub fn for_tts() -> Self {
        Self {
            max_phrase_words: 8,
            normalize_unicode: true,
            respect_comma_boundaries: true,
            separate_punctuation: false,
            emdash_as_boundary: false,
        }
    }

    /// Preset for linguistic analysis
    pub fn for_linguistic_analysis() -> Self {
        Self {
            max_phrase_words: 10,
            normalize_unicode: true,
            respect_comma_boundaries: true,
            separate_punctuation: true,
            emdash_as_boundary: false,
        }
    }

    /// Preset for subtitle generation (shorter phrases)
    pub fn for_subtitles() -> Self {
        Self {
            max_phrase_words: 6,
            normalize_unicode: true,
            respect_comma_boundaries: true,
            separate_punctuation: false,
            emdash_as_boundary: true,
        }
    }

    /// Preset for natural reading (longer phrases)
    pub fn for_reading() -> Self {
        Self {
            max_phrase_words: 12,
            normalize_unicode: true,
            respect_comma_boundaries: false,
            separate_punctuation: false,
            emdash_as_boundary: false,
        }
    }
}

/// Preprocess text to handle em-dashes and en-dashes based on config
fn preprocess_dashes(text: &str, emdash_as_boundary: bool) -> String {
    if emdash_as_boundary {
        text
            // Em-dash with no spaces → treat as sentence separator
            .replace('\u{2014}', ". ")
            // En-dash with no spaces between words → keep as hyphen
            .replace('\u{2013}', "-")
    } else {
        text
            // Both em-dash and en-dash → ASCII hyphen
            .replace(&['\u{2013}', '\u{2014}'][..], "-")
    }
}

/// Normalize Unicode characters to ASCII equivalents
/// - Converts various quote marks to standard ASCII quotes
/// - Converts en-dashes and em-dashes to hyphens (unless configured otherwise)
/// - Handles various apostrophe forms
/// - Handles ellipsis
fn normalize_unicode(text: &str) -> String {
    text
        // Left and right single quotes → ASCII apostrophe
        .replace(&['\u{2018}', '\u{2019}', '\u{02BC}', '\u{02BB}',
                   '\u{02BD}', '\u{02C8}', '\u{02CA}', '\u{02CB}',
                   '\u{0060}', '\u{00B4}'][..], "'")
        // Left and right double quotes → ASCII double quote
        .replace(&['\u{201C}', '\u{201D}', '\u{201E}', '\u{201F}'][..], "\"")
        // Horizontal ellipsis → three periods
        .replace('\u{2026}', "...")
        // Handle multiple periods as ellipsis
        .replace("....", "...")
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

/// Common abbreviations that don't end sentences
const COMMON_ABBREVIATIONS: &[&str] = &[
    "Dr", "Mr", "Mrs", "Ms", "Prof", "Sr", "Jr",
    "Ph.D", "M.D", "B.A", "M.A", "B.S", "M.S",
    "etc", "i.e", "e.g", "vs", "Inc", "Corp", "Ltd",
    "Ave", "St", "Rd", "Blvd", "Mt",
];

/// Check if a period is likely part of an abbreviation
fn is_abbreviation(text: &str, period_pos: usize) -> bool {
    // Look backwards for word before period
    let before = &text[..period_pos];

    // Get the last word before the period
    let word = if let Some(last_word_start) = before.rfind(|c: char| c.is_whitespace()) {
        &before[last_word_start + 1..]
    } else {
        // No whitespace found, the entire text before period is the word
        before
    };

    // Check if it matches common abbreviations
    for abbrev in COMMON_ABBREVIATIONS {
        if word.eq_ignore_ascii_case(abbrev) {
            return true;
        }
    }

    // Check for single-letter abbreviations (initials)
    if word.len() == 1 && !word.is_empty() {
        if let Some(ch) = word.chars().next() {
            if ch.is_ascii_uppercase() {
                return true;
            }
        }
    }

    false
}

/// Split text into sentences with smart boundary detection
fn split_sentences_smart(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current_sentence = String::new();
    let chars: Vec<char> = text.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        current_sentence.push(ch);

        // Check for sentence-ending punctuation
        if ch == '.' || ch == '!' || ch == '?' {
            // Look ahead for space and capital letter
            let next_is_space = i + 1 < chars.len() && chars[i + 1].is_whitespace();
            let after_space_is_capital = i + 2 < chars.len()
                && chars[i + 2].is_ascii_uppercase();

            // Check if it's an abbreviation (only for periods)
            let is_abbrev = ch == '.' && is_abbreviation(&text[..i + 1], i);

            // Check if it's a decimal number
            let prev_is_digit = i > 0 && chars[i - 1].is_ascii_digit();
            let next_is_digit = i + 1 < chars.len() && chars[i + 1].is_ascii_digit();
            let is_decimal = ch == '.' && prev_is_digit && next_is_digit;

            // End sentence if conditions are met
            if !is_abbrev && !is_decimal && (next_is_space && after_space_is_capital || ch != '.') {
                let sentence = current_sentence.trim().to_string();
                if !sentence.is_empty() {
                    sentences.push(sentence);
                }
                current_sentence.clear();
            }
        }

        i += 1;
    }

    // Add last sentence
    let sentence = current_sentence.trim().to_string();
    if !sentence.is_empty() {
        sentences.push(sentence);
    }

    sentences
}

/// Internal: Simple phrase segmentation (improved version of current)
fn segment_phrases_simple(text: &str, max_words: usize) -> Vec<String> {
    let mut phrases = Vec::new();

    // Use smart sentence splitting
    let sentences = split_sentences_smart(text);

    for sentence in sentences {
        let words = segment_words_preserve_punctuation(&sentence);

        if words.len() <= max_words {
            phrases.push(sentence);
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

    // Use smart sentence splitting
    let sentences = split_sentences_smart(text);

    for sentence in sentences {
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
    let mut text = text.to_string();

    // Preprocess dashes first (before normalization)
    text = preprocess_dashes(&text, config.emdash_as_boundary);

    // Then normalize unicode
    if config.normalize_unicode {
        text = normalize_unicode(&text);
    }

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
        assert_eq!(config.emdash_as_boundary, false);
    }

    #[test]
    fn test_normalize_unicode_quotes() {
        let text = "\u{201C}Hello\u{201D} \u{2018}world\u{2019}";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "\"Hello\" 'world'");
    }

    #[test]
    fn test_preprocess_dashes_as_hyphen() {
        let text = "Em\u{2014}dash and en\u{2013}dash";
        let processed = preprocess_dashes(text, false);
        assert_eq!(processed, "Em-dash and en-dash");
    }

    #[test]
    fn test_preprocess_dashes_as_boundary() {
        let text = "First\u{2014}second";
        let processed = preprocess_dashes(text, true);
        assert_eq!(processed, "First. second");
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
        assert_eq!(phrases[0], "Hello world.");
        assert_eq!(phrases[1], "This is great!");
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
        assert_eq!(phrases[2], "doing today?");
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
        assert_eq!(phrases[0], "Hello there!");
    }

    #[test]
    fn test_split_sentences_abbreviations() {
        let text = "Dr. Smith went to Mt. Everest.";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "Dr. Smith went to Mt. Everest.");
    }

    #[test]
    fn test_split_sentences_decimals() {
        let text = "The value is 3.14. Next sentence.";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 2);
        assert_eq!(sentences[0], "The value is 3.14.");
    }

    #[test]
    fn test_split_sentences_initials() {
        let text = "J. K. Rowling wrote books.";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_split_sentences_multiple() {
        let text = "First sentence. Second sentence! Third question?";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 3);
    }

    #[test]
    fn test_split_sentences_etc() {
        let text = "We need apples, oranges, etc. for the party.";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_emdash_as_boundary() {
        let config = SegmentationConfig {
            emdash_as_boundary: true,
            ..Default::default()
        };
        let text = "First part\u{2014}Second part.";
        let phrases = segment_phrases_with_config(text, &config);
        assert_eq!(phrases.len(), 2);
        assert_eq!(phrases[0], "First part.");
        assert_eq!(phrases[1], "Second part.");
    }

    #[test]
    fn test_emdash_as_hyphen() {
        let config = SegmentationConfig {
            emdash_as_boundary: false,
            ..Default::default()
        };
        let text = "First part\u{2014}second part.";
        let phrases = segment_phrases_with_config(text, &config);
        assert_eq!(phrases.len(), 1);
    }

    #[test]
    fn test_ellipsis_handling() {
        let text = "Wait\u{2026} for it.";
        let sentences = split_sentences_smart(text);
        // Should treat "..." as continuation, not sentence end
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_multiple_periods_normalized() {
        let text = "Wait....";
        let normalized = normalize_unicode(text);
        assert_eq!(normalized, "Wait...");
    }

    // Edge case tests
    #[test]
    fn test_hyphenated_compound_words() {
        let text = "state-of-the-art technology";
        let words = segment_words(text);
        assert_eq!(words, vec!["state-of-the-art", "technology"]);
    }

    #[test]
    fn test_contractions() {
        let text = "I don\u{2019}t can\u{2019}t won\u{2019}t";
        let words = segment_words(text);
        assert_eq!(words, vec!["I", "don't", "can't", "won't"]);
    }

    #[test]
    fn test_possessives() {
        let text = "John\u{2019}s book";
        let words = segment_words(text);
        assert_eq!(words, vec!["John's", "book"]);
    }

    #[test]
    fn test_multiple_punctuation() {
        let text = "Really?!";
        let words = segment_words(text);
        assert_eq!(words, vec!["Really?!"]);
    }

    #[test]
    fn test_urls_not_split() {
        let text = "Visit www.example.com for info.";
        let sentences = split_sentences_smart(text);
        // Should not split at .com
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_mixed_unicode() {
        let text = "\u{201C}Don\u{2019}t\u{201D} use em\u{2014}dashes carelessly\u{2026}";
        let config = SegmentationConfig::default();
        let phrases = segment_phrases_with_config(text, &config);
        assert!(phrases.len() > 0);
    }

    #[test]
    fn test_very_long_sentence() {
        let text = "This is a very long sentence with many words that should be split into multiple phrases based on the maximum phrase length configuration parameter.";
        let config = SegmentationConfig {
            max_phrase_words: 5,
            ..Default::default()
        };
        let phrases = segment_phrases_with_config(text, &config);
        // Should split into multiple phrases
        assert!(phrases.len() >= 3);
    }

    #[test]
    fn test_empty_and_whitespace() {
        assert_eq!(segment_words(""), Vec::<String>::new());
        assert_eq!(segment_words("   \t\n  "), Vec::<String>::new());
        assert_eq!(segment_phrases(""), Vec::<String>::new());
    }

    #[test]
    fn test_multiple_sentences_mixed_punctuation() {
        let text = "First. Second! Third? Fourth.";
        let sentences = split_sentences_smart(text);
        assert_eq!(sentences.len(), 4);
    }

    #[test]
    fn test_nested_quotes() {
        let text = "He said \u{201C}she said \u{2018}hello\u{2019}\u{201D}";
        let words = segment_words(text);
        // Should handle nested quotes
        assert!(words.len() > 0);
    }

    // Preset configuration tests
    #[test]
    fn test_preset_configs() {
        let text = "This is a test sentence, with multiple clauses, for testing.";

        let tts_phrases = segment_phrases_with_config(text, &SegmentationConfig::for_tts());
        let subtitle_phrases = segment_phrases_with_config(text, &SegmentationConfig::for_subtitles());
        let reading_phrases = segment_phrases_with_config(text, &SegmentationConfig::for_reading());

        // Subtitles should have more (shorter) phrases than reading
        assert!(subtitle_phrases.len() >= reading_phrases.len());
        // TTS should be in the middle
        assert!(tts_phrases.len() >= reading_phrases.len());
    }

    #[test]
    fn test_for_tts_preset() {
        let config = SegmentationConfig::for_tts();
        assert_eq!(config.max_phrase_words, 8);
        assert_eq!(config.respect_comma_boundaries, true);
        assert_eq!(config.separate_punctuation, false);
    }

    #[test]
    fn test_for_linguistic_analysis_preset() {
        let config = SegmentationConfig::for_linguistic_analysis();
        assert_eq!(config.max_phrase_words, 10);
        assert_eq!(config.separate_punctuation, true);
    }

    #[test]
    fn test_for_subtitles_preset() {
        let config = SegmentationConfig::for_subtitles();
        assert_eq!(config.max_phrase_words, 6);
        assert_eq!(config.emdash_as_boundary, true);
    }

    #[test]
    fn test_for_reading_preset() {
        let config = SegmentationConfig::for_reading();
        assert_eq!(config.max_phrase_words, 12);
        assert_eq!(config.respect_comma_boundaries, false);
    }
}
