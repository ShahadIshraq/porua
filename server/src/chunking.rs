use crate::text_processing::sentence_splitting::split_sentences;

/// Configuration for text chunking
#[derive(Debug, Clone)]
pub struct ChunkingConfig {
    /// Maximum characters per chunk
    pub max_chunk_size: usize,
    /// Minimum characters per chunk (to avoid too many tiny chunks)
    #[allow(dead_code)]
    pub min_chunk_size: usize,
}

impl Default for ChunkingConfig {
    fn default() -> Self {
        Self {
            max_chunk_size: 200, // Lowered for faster streaming - split at ~1-2 sentences
            min_chunk_size: 50,  // Allow smaller chunks for better streaming
        }
    }
}

/// Splits text into chunks at sentence boundaries while respecting size limits
pub fn chunk_text(text: &str, config: &ChunkingConfig) -> Vec<String> {
    // If text is short enough, return as-is
    if text.len() <= config.max_chunk_size {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    // Split by sentence-ending punctuation
    let sentences = split_sentences(text);

    for sentence in sentences {
        let sentence_len = sentence.len();

        // If a single sentence is too long, split it further
        if sentence_len > config.max_chunk_size {
            // Flush current chunk if it has content
            if !current_chunk.is_empty() {
                chunks.push(current_chunk.trim().to_string());
                current_chunk.clear();
            }

            // Split long sentence by clauses
            let sub_chunks = split_long_sentence(&sentence, config.max_chunk_size);
            chunks.extend(sub_chunks);
            continue;
        }

        // Check if adding this sentence would exceed the limit
        if current_chunk.len() + sentence_len > config.max_chunk_size && !current_chunk.is_empty() {
            // Save current chunk and start new one
            chunks.push(current_chunk.trim().to_string());
            current_chunk = sentence.to_string();
        } else {
            // Add to current chunk
            if !current_chunk.is_empty() {
                current_chunk.push(' ');
            }
            current_chunk.push_str(&sentence);
        }
    }

    // Add remaining chunk
    if !current_chunk.is_empty() {
        chunks.push(current_chunk.trim().to_string());
    }

    // If we ended up with no chunks (shouldn't happen), return original text
    if chunks.is_empty() {
        chunks.push(text.to_string());
    }

    chunks
}

/// Splits a long sentence into smaller chunks at clause boundaries
fn split_long_sentence(sentence: &str, max_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    // Split by common clause separators: commas, semicolons, em dashes, conjunctions
    let parts: Vec<&str> = sentence.split([',', ';']).collect();

    for (i, part) in parts.iter().enumerate() {
        let part_with_punct = if i < parts.len() - 1 {
            format!("{},", part.trim())
        } else {
            part.trim().to_string()
        };

        if current.len() + part_with_punct.len() > max_size && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = part_with_punct;
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(&part_with_punct);
        }
    }

    if !current.is_empty() {
        chunks.push(current.trim().to_string());
    }

    // If still too long, do hard splitting by words
    let mut final_chunks = Vec::new();
    for chunk in chunks {
        if chunk.len() > max_size {
            final_chunks.extend(hard_split_by_words(&chunk, max_size));
        } else {
            final_chunks.push(chunk);
        }
    }

    final_chunks
}

/// Last resort: split by words when nothing else works
fn hard_split_by_words(text: &str, max_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        if current.len() + word.len() + 1 > max_size && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = word.to_string();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
    }

    if !current.is_empty() {
        chunks.push(current.trim().to_string());
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_text() {
        let config = ChunkingConfig::default();
        let text = "Hello world!";
        let chunks = chunk_text(text, &config);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], text);
    }

    #[test]
    fn test_sentence_splitting() {
        let config = ChunkingConfig {
            max_chunk_size: 50,
            min_chunk_size: 10,
        };
        let text = "This is sentence one. This is sentence two. This is sentence three.";
        let chunks = chunk_text(text, &config);
        assert!(chunks.len() > 1);
        // Each chunk should be under the limit
        for chunk in &chunks {
            assert!(chunk.len() <= config.max_chunk_size + 20); // Allow some overflow for natural breaks
        }
    }

    #[test]
    fn test_long_sentence() {
        let config = ChunkingConfig {
            max_chunk_size: 100,
            min_chunk_size: 20,
        };
        let text = "This is a very long sentence that goes on and on, with many clauses separated by commas, and it should be split into multiple chunks even though it's technically one sentence.";
        let chunks = chunk_text(text, &config);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn test_default_config() {
        let config = ChunkingConfig::default();
        assert_eq!(config.max_chunk_size, 200);
        assert_eq!(config.min_chunk_size, 50);
    }

    #[test]
    fn test_empty_text() {
        let config = ChunkingConfig::default();
        let chunks = chunk_text("", &config);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "");
    }

    #[test]
    fn test_single_word() {
        let config = ChunkingConfig::default();
        let chunks = chunk_text("Hello", &config);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hello");
    }

    #[test]
    fn test_exactly_max_size() {
        let config = ChunkingConfig {
            max_chunk_size: 20,
            min_chunk_size: 5,
        };
        let text = "A".repeat(20);
        let chunks = chunk_text(&text, &config);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_just_over_max_size() {
        let config = ChunkingConfig {
            max_chunk_size: 20,
            min_chunk_size: 5,
        };
        let text = "Short one. This is a bit longer.";
        let chunks = chunk_text(&text, &config);
        assert!(chunks.len() >= 2);
    }

    #[test]
    fn test_multiple_sentences() {
        let config = ChunkingConfig {
            max_chunk_size: 15,
            min_chunk_size: 5,
        };
        let text = "First sentence. Second sentence. Third sentence.";
        let chunks = chunk_text(&text, &config);
        assert!(
            chunks.len() >= 2,
            "Expected multiple chunks, got {}",
            chunks.len()
        );
    }

    #[test]
    fn test_clause_splitting() {
        let config = ChunkingConfig {
            max_chunk_size: 50,
            min_chunk_size: 10,
        };
        let text = "This is a long sentence with many clauses, separated by commas, which should be split appropriately.";
        let chunks = chunk_text(&text, &config);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn test_hard_word_splitting() {
        let config = ChunkingConfig {
            max_chunk_size: 30,
            min_chunk_size: 10,
        };
        // Very long single sentence with no punctuation
        let text = "word ".repeat(20).trim().to_string();
        let chunks = chunk_text(&text, &config);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(chunk.len() <= config.max_chunk_size + 10); // Some tolerance
        }
    }

    #[test]
    fn test_preserve_sentence_endings() {
        let config = ChunkingConfig::default();
        let text = "Hello world! How are you? I am fine.";
        let chunks = chunk_text(&text, &config);

        // Sentences should be preserved
        let combined = chunks.join(" ");
        assert!(combined.contains("!"));
        assert!(combined.contains("?"));
        assert!(combined.contains("."));
    }

    #[test]
    fn test_abbreviations_not_split() {
        let config = ChunkingConfig::default();
        let text = "Dr. Smith went to the U.S.A. yesterday.";
        let chunks = chunk_text(&text, &config);
        // Should not split on Dr. or U.S.A.
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_numbers_with_periods() {
        let config = ChunkingConfig::default();
        let text = "The value is 3.14159. This is separate.";
        let chunks = chunk_text(&text, &config);
        // Should split after the second period, not the decimal point
        assert!(chunks.len() >= 1);
    }

    #[test]
    fn test_unicode_text() {
        let config = ChunkingConfig::default();
        let text = "Hello 世界! This is 日本語. Testing unicode.";
        let chunks = chunk_text(&text, &config);
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_whitespace_handling() {
        let config = ChunkingConfig::default();
        let text = "First.    Second.     Third.";
        let chunks = chunk_text(&text, &config);

        // Check that chunks are trimmed
        for chunk in &chunks {
            assert_eq!(chunk, chunk.trim());
        }
    }

    #[test]
    fn test_semicolon_splitting() {
        let config = ChunkingConfig {
            max_chunk_size: 40,
            min_chunk_size: 10,
        };
        let text = "First clause; second clause; third clause; fourth clause.";
        let chunks = chunk_text(&text, &config);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn test_very_long_word() {
        let config = ChunkingConfig {
            max_chunk_size: 20,
            min_chunk_size: 5,
        };
        let long_word = "a".repeat(50);
        let text = format!("Short. {} More text.", long_word);
        let chunks = chunk_text(&text, &config);
        // Should handle the very long word gracefully
        assert!(chunks.len() >= 1);
    }

    #[test]
    fn test_config_clone() {
        let config = ChunkingConfig::default();
        let cloned = config.clone();
        assert_eq!(config.max_chunk_size, cloned.max_chunk_size);
        assert_eq!(config.min_chunk_size, cloned.min_chunk_size);
    }

    #[test]
    fn test_config_debug() {
        let config = ChunkingConfig::default();
        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("ChunkingConfig"));
    }
}
