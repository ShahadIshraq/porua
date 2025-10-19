use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    #[serde(default = "default_voice")]
    pub voice: String,
    #[serde(default = "default_speed")]
    pub speed: f32,
    #[serde(default = "default_enable_chunking")]
    pub enable_chunking: bool,
}

fn default_enable_chunking() -> bool {
    true
}

fn default_voice() -> String {
    "bf_lily".to_string()
}

fn default_speed() -> f32 {
    1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tts_request_full_deserialization() {
        let json = r#"{
            "text": "Hello world",
            "voice": "af_bella",
            "speed": 1.5,
            "enable_chunking": false
        }"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.text, "Hello world");
        assert_eq!(req.voice, "af_bella");
        assert_eq!(req.speed, 1.5);
        assert!(!req.enable_chunking);
    }

    #[test]
    fn test_tts_request_minimal_deserialization() {
        let json = r#"{"text": "Hello"}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.text, "Hello");
        assert_eq!(req.voice, "bf_lily"); // default
        assert_eq!(req.speed, 1.0); // default
        assert!(req.enable_chunking); // default
    }

    #[test]
    fn test_tts_request_default_voice() {
        let json = r#"{
            "text": "Test",
            "speed": 1.2
        }"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.voice, "bf_lily");
    }

    #[test]
    fn test_tts_request_default_speed() {
        let json = r#"{
            "text": "Test",
            "voice": "am_adam"
        }"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.speed, 1.0);
    }

    #[test]
    fn test_tts_request_default_enable_chunking() {
        let json = r#"{"text": "Test"}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert!(req.enable_chunking);
    }

    #[test]
    fn test_tts_request_empty_text() {
        let json = r#"{"text": ""}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.text, "");
    }

    #[test]
    fn test_tts_request_long_text() {
        let long_text = "a".repeat(10000);
        let json = format!(r#"{{"text": "{}"}}"#, long_text);

        let req: TTSRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(req.text.len(), 10000);
    }

    #[test]
    fn test_tts_request_special_characters() {
        let json = r#"{"text": "Hello \"world\" with\nnewlines\tand\ttabs"}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert!(req.text.contains("Hello"));
        assert!(req.text.contains("world"));
    }

    #[test]
    fn test_tts_request_unicode_text() {
        let json = r#"{"text": "Hello 世界 🌍"}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert!(req.text.contains("世界"));
        assert!(req.text.contains("🌍"));
    }

    #[test]
    fn test_tts_request_various_speeds() {
        let test_cases = vec![0.1, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

        for speed in test_cases {
            let json = format!(r#"{{"text": "Test", "speed": {}}}"#, speed);
            let req: TTSRequest = serde_json::from_str(&json).unwrap();
            assert_eq!(req.speed, speed);
        }
    }

    #[test]
    fn test_tts_request_chunking_enabled() {
        let json = r#"{"text": "Test", "enable_chunking": true}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert!(req.enable_chunking);
    }

    #[test]
    fn test_tts_request_chunking_disabled() {
        let json = r#"{"text": "Test", "enable_chunking": false}"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert!(!req.enable_chunking);
    }

    #[test]
    fn test_tts_request_missing_text_fails() {
        let json = r#"{"voice": "bf_lily"}"#;

        let result: Result<TTSRequest, _> = serde_json::from_str(json);

        assert!(result.is_err());
    }

    #[test]
    fn test_tts_request_invalid_json_fails() {
        let json = r#"{"text": "Test", invalid}"#;

        let result: Result<TTSRequest, _> = serde_json::from_str(json);

        assert!(result.is_err());
    }

    #[test]
    fn test_tts_request_extra_fields_ignored() {
        let json = r#"{
            "text": "Test",
            "unknown_field": "ignored",
            "another_field": 123
        }"#;

        let req: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(req.text, "Test");
    }

    #[test]
    fn test_default_functions() {
        assert_eq!(default_voice(), "bf_lily");
        assert_eq!(default_speed(), 1.0);
        assert!(default_enable_chunking());
    }
}
