/// Maximum allowed text length for TTS requests (in characters)
///
/// This limit helps prevent abuse and ensures reasonable response times.
/// Requests exceeding this limit will be rejected with an error.
pub const MAX_TEXT_LENGTH: usize = 10_000;

/// Boundary string used for multipart responses in streaming mode
///
/// This separator is used to delineate chunks in the streaming response.
pub const MULTIPART_BOUNDARY: &str = "tts_chunk_boundary";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_text_length_reasonable() {
        assert!(MAX_TEXT_LENGTH > 0);
        assert!(MAX_TEXT_LENGTH <= 100_000); // Sanity check
    }

    #[test]
    fn test_multipart_boundary_not_empty() {
        assert!(!MULTIPART_BOUNDARY.is_empty());
    }
}
