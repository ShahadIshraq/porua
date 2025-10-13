/// Split text into words, preserving punctuation with words
pub fn segment_words(text: &str) -> Vec<String> {
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

    // Add last word if any
    if !current_word.is_empty() {
        words.push(current_word);
    }

    words
}

/// Split text into phrases (sentences or 5-word groups, whichever is shorter)
pub fn segment_phrases(text: &str) -> Vec<String> {
    let mut phrases = Vec::new();

    // First, split by sentence-ending punctuation
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect();

    for sentence in sentences {
        let sentence = sentence.trim();
        let words = segment_words(sentence);

        if words.len() <= 5 {
            // Sentence has 5 or fewer words, use as-is
            phrases.push(sentence.to_string());
        } else {
            // Split into 5-word chunks
            for chunk in words.chunks(5) {
                let phrase = chunk.join(" ");
                phrases.push(phrase);
            }
        }
    }

    phrases
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segment_words_basic() {
        let text = "Hello world, this is great!";
        let words = segment_words(text);
        assert_eq!(words, vec!["Hello", "world,", "this", "is", "great!"]);
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
    fn test_segment_phrases_long_sentence() {
        let text = "This is a very long sentence with more than five words in it.";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 3);
        assert_eq!(phrases[0], "This is a very long");
        assert_eq!(phrases[1], "sentence with more than five");
        assert_eq!(phrases[2], "words in it");
    }

    #[test]
    fn test_segment_phrases_short_sentence() {
        let text = "Hello there!";
        let phrases = segment_phrases(text);
        assert_eq!(phrases.len(), 1);
        assert_eq!(phrases[0], "Hello there");
    }
}
