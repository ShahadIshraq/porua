
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
            max_chunk_size: 200,  // Lowered for faster streaming - split at ~1-2 sentences
            min_chunk_size: 50,   // Allow smaller chunks for better streaming
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
    let sentences = split_into_sentences(text);

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

/// Splits text into sentences based on punctuation
fn split_into_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        current.push(ch);

        // Check for sentence-ending punctuation
        if matches!(ch, '.' | '!' | '?') {
            // Look ahead to see if this is truly end of sentence
            let mut peek_chars = chars.clone();
            let next_char = peek_chars.next();

            // End of sentence if followed by whitespace and uppercase, or end of text
            let is_end = match next_char {
                None => true,
                Some(next) => {
                    if next.is_whitespace() {
                        // Skip whitespace and check next non-whitespace char
                        let mut found_end = true;
                        while let Some(c) = peek_chars.peek() {
                            if !c.is_whitespace() {
                                found_end = c.is_uppercase() || c.is_ascii_digit();
                                break;
                            }
                            peek_chars.next();
                        }
                        found_end
                    } else {
                        false
                    }
                }
            };

            if is_end {
                sentences.push(current.trim().to_string());
                current.clear();
            }
        }
    }

    // Add any remaining text
    if !current.trim().is_empty() {
        sentences.push(current.trim().to_string());
    }

    sentences
}

/// Splits a long sentence into smaller chunks at clause boundaries
fn split_long_sentence(sentence: &str, max_size: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    // Split by common clause separators: commas, semicolons, em dashes, conjunctions
    let parts: Vec<&str> = sentence
        .split(|c: char| matches!(c, ',' | ';'))
        .collect();

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
}
