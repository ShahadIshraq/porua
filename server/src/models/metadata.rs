use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct PhraseMetadata {
    /// Normalized text (what the TTS engine spoke)
    pub text: String,
    /// Original text from input (before normalization)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub words: Vec<String>,
    pub start_ms: f64,
    pub duration_ms: f64,
    /// Character offset start in the full text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub char_offset_start: Option<usize>,
    /// Character offset end in the full text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub char_offset_end: Option<usize>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<ValidationError>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<ValidationWarning>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationError {
    pub phrase_index: usize,
    pub error_type: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationWarning {
    pub phrase_index: usize,
    pub warning_type: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugInfo {
    pub tts_engine: String,
    pub text_length_original: usize,
    pub text_length_normalized: usize,
    pub normalization_changes: usize,
    pub phrase_count: usize,
    pub total_duration_ms: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChunkMetadata {
    /// API version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub chunk_index: usize,
    /// Normalized text (what the TTS processed)
    pub text: String,
    /// Original text before normalization
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
    pub phrases: Vec<PhraseMetadata>,
    pub duration_ms: f64,
    pub start_offset_ms: f64,
    /// Validation results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<ValidationResult>,
    /// Debug information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debug_info: Option<DebugInfo>,
}
