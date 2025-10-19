use serde::Serialize;

#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct TTSResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub gender: String,
    pub language: String,
    pub description: String,
    pub sample_url: String,
}

#[derive(Debug, Serialize)]
pub struct VoicesResponse {
    pub voices: Vec<VoiceInfo>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
pub struct PoolStatsResponse {
    pub pool_size: usize,
    pub active_requests: usize,
    pub available_engines: usize,
    pub total_requests: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tts_response_success_serialization() {
        let response = TTSResponse {
            status: "success".to_string(),
            error: None,
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"status\":\"success\""));
        assert!(!json.contains("error")); // Should be omitted when None
    }

    #[test]
    fn test_tts_response_error_serialization() {
        let response = TTSResponse {
            status: "error".to_string(),
            error: Some("Something went wrong".to_string()),
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"status\":\"error\""));
        assert!(json.contains("\"error\":\"Something went wrong\""));
    }

    #[test]
    fn test_voice_info_serialization() {
        let voice = VoiceInfo {
            id: "bf_lily".to_string(),
            name: "Lily".to_string(),
            gender: "Female".to_string(),
            language: "English".to_string(),
            description: "British female voice".to_string(),
            sample_url: "/samples/bf_lily.wav".to_string(),
        };

        let json = serde_json::to_string(&voice).unwrap();

        assert!(json.contains("\"id\":\"bf_lily\""));
        assert!(json.contains("\"name\":\"Lily\""));
        assert!(json.contains("\"gender\":\"Female\""));
        assert!(json.contains("\"language\":\"English\""));
        assert!(json.contains("\"description\":\"British female voice\""));
        assert!(json.contains("\"sample_url\":\"/samples/bf_lily.wav\""));
    }

    #[test]
    fn test_voices_response_empty() {
        let response = VoicesResponse { voices: vec![] };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"voices\":[]"));
    }

    #[test]
    fn test_voices_response_multiple_voices() {
        let response = VoicesResponse {
            voices: vec![
                VoiceInfo {
                    id: "bf_lily".to_string(),
                    name: "Lily".to_string(),
                    gender: "Female".to_string(),
                    language: "English".to_string(),
                    description: "British female".to_string(),
                    sample_url: "/samples/bf_lily.wav".to_string(),
                },
                VoiceInfo {
                    id: "am_adam".to_string(),
                    name: "Adam".to_string(),
                    gender: "Male".to_string(),
                    language: "English".to_string(),
                    description: "American male".to_string(),
                    sample_url: "/samples/am_adam.wav".to_string(),
                },
            ],
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("bf_lily"));
        assert!(json.contains("am_adam"));
        assert!(json.contains("Lily"));
        assert!(json.contains("Adam"));
    }

    #[test]
    fn test_health_response_ok() {
        let response = HealthResponse {
            status: "ok".to_string(),
            version: "0.1.0".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"status\":\"ok\""));
        assert!(json.contains("\"version\":\"0.1.0\""));
    }

    #[test]
    fn test_health_response_degraded() {
        let response = HealthResponse {
            status: "degraded".to_string(),
            version: "0.1.0".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"status\":\"degraded\""));
        assert!(json.contains("\"version\":\"0.1.0\""));
    }

    #[test]
    fn test_pool_stats_response_serialization() {
        let response = PoolStatsResponse {
            pool_size: 4,
            active_requests: 2,
            available_engines: 2,
            total_requests: 150,
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"pool_size\":4"));
        assert!(json.contains("\"active_requests\":2"));
        assert!(json.contains("\"available_engines\":2"));
        assert!(json.contains("\"total_requests\":150"));
    }

    #[test]
    fn test_pool_stats_response_zero_values() {
        let response = PoolStatsResponse {
            pool_size: 0,
            active_requests: 0,
            available_engines: 0,
            total_requests: 0,
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"pool_size\":0"));
        assert!(json.contains("\"active_requests\":0"));
    }

    #[test]
    fn test_pool_stats_response_high_values() {
        let response = PoolStatsResponse {
            pool_size: 100,
            active_requests: 50,
            available_engines: 50,
            total_requests: 1000000,
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"total_requests\":1000000"));
    }

    #[test]
    fn test_voice_info_with_special_characters() {
        let voice = VoiceInfo {
            id: "test_voice".to_string(),
            name: "Test \"Voice\"".to_string(),
            gender: "Other".to_string(),
            language: "English (US)".to_string(),
            description: "A voice with special chars: & < >".to_string(),
            sample_url: "/samples/test_voice.wav".to_string(),
        };

        let json = serde_json::to_string(&voice).unwrap();

        // Ensure proper JSON escaping
        assert!(json.contains("Test \\\"Voice\\\""));
    }

    #[test]
    fn test_responses_implement_debug() {
        let health = HealthResponse {
            status: "ok".to_string(),
            version: "0.1.0".to_string(),
        };
        let debug_str = format!("{:?}", health);
        assert!(debug_str.contains("HealthResponse"));
        assert!(debug_str.contains("ok"));
        assert!(debug_str.contains("0.1.0"));
    }

    #[test]
    fn test_voice_info_roundtrip() {
        let original = VoiceInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            gender: "Female".to_string(),
            language: "English".to_string(),
            description: "Test voice".to_string(),
            sample_url: "/samples/test.wav".to_string(),
        };

        let json = serde_json::to_string(&original).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["id"], "test");
        assert_eq!(parsed["name"], "Test");
        assert_eq!(parsed["gender"], "Female");
    }

    #[test]
    fn test_tts_response_skip_none_error() {
        let response = TTSResponse {
            status: "success".to_string(),
            error: None,
        };

        let json = serde_json::to_value(&response).unwrap();

        // Error field should not be present when None
        assert!(!json.as_object().unwrap().contains_key("error"));
    }
}
