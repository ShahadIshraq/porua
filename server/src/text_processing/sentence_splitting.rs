/// Sentence splitting with smart boundary detection
/// Handles abbreviations, decimal numbers, and proper sentence endings

/// Common abbreviations that don't end sentences
const COMMON_ABBREVIATIONS: &[&str] = &[
    "Dr", "Mr", "Mrs", "Ms", "Prof", "Sr", "Jr", "Ph.D", "M.D", "B.A", "M.A", "B.S", "M.S", "etc",
    "i.e", "e.g", "vs", "Inc", "Corp", "Ltd", "Ave", "St", "Rd", "Blvd", "Mt",
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
///
/// This function correctly handles:
/// - Decimal numbers (e.g., "3.14" is not split)
/// - Abbreviations (e.g., "Dr.", "etc.")
/// - Multiple sentence-ending punctuation (., !, ?)
/// - Initials (e.g., "J. K. Rowling")
pub fn split_sentences(text: &str) -> Vec<String> {
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
            let after_space_is_capital = i + 2 < chars.len() && chars[i + 2].is_ascii_uppercase();

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decimal_numbers_not_split() {
        let text = "The value is 3.14 and the price is 99.5 today.";
        let result = split_sentences(text);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], "The value is 3.14 and the price is 99.5 today.");
    }

    #[test]
    fn test_sentence_after_decimal() {
        let text = "Temperature is 98.6. It's warm.";
        let result = split_sentences(text);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "Temperature is 98.6.");
        assert_eq!(result[1], "It's warm.");
    }

    #[test]
    fn test_multiple_decimals() {
        let text = "Values: 3.14, 2.71, 1.41 are important.";
        let result = split_sentences(text);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], "Values: 3.14, 2.71, 1.41 are important.");
    }

    #[test]
    fn test_abbreviations() {
        let text = "Dr. Smith went to Mt. Everest.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "Dr. Smith went to Mt. Everest.");
    }

    #[test]
    fn test_decimal_and_next_sentence() {
        let text = "The value is 3.14. Next sentence.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 2);
        assert_eq!(sentences[0], "The value is 3.14.");
        assert_eq!(sentences[1], "Next sentence.");
    }

    #[test]
    fn test_initials() {
        let text = "J. K. Rowling wrote books.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_multiple_sentences() {
        let text = "First sentence. Second sentence! Third question?";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 3);
        assert_eq!(sentences[0], "First sentence.");
        assert_eq!(sentences[1], "Second sentence!");
        assert_eq!(sentences[2], "Third question?");
    }

    #[test]
    fn test_etc() {
        let text = "We need apples, oranges, etc. for the party.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_empty_text() {
        let text = "";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 0);
    }

    #[test]
    fn test_single_sentence() {
        let text = "Hello world!";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "Hello world!");
    }

    #[test]
    fn test_no_ending_punctuation() {
        let text = "This has no ending punctuation";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "This has no ending punctuation");
    }

    #[test]
    fn test_urls_not_split() {
        let text = "Visit www.example.com for info.";
        let sentences = split_sentences(text);
        // Should not split at .com
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_mixed_punctuation() {
        let text = "First. Second! Third? Fourth.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 4);
    }

    #[test]
    fn test_decimal_at_end() {
        let text = "The value is 3.14";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "The value is 3.14");
    }

    #[test]
    fn test_decimal_followed_by_lowercase() {
        let text = "The value is 3.14 meters.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
    }

    #[test]
    fn test_trailing_period_after_decimal() {
        let text = "Pi is approximately 3.14159.";
        let sentences = split_sentences(text);
        assert_eq!(sentences.len(), 1);
        assert_eq!(sentences[0], "Pi is approximately 3.14159.");
    }
}
