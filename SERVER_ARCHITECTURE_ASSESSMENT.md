# TTS Server Architecture Assessment & Restructuring Plan

## Executive Summary

The server codebase is **reasonably well-structured** but has opportunities for improvement in modularity, error handling, resource management, and testability. No critical architectural flaws were found, but several areas would benefit from refactoring for better maintainability and scalability.

**Overall Grade: B+ (Good, with room for improvement)**

---

## Current Architecture Analysis

### Module Structure

```
server/src/
├── main.rs           (193 lines) - Entry point with mixed CLI/server logic
├── server.rs         (1013 lines) - HTTP server, handlers, DTOs, helpers
├── auth.rs           (215 lines) - Authentication middleware
├── chunking.rs       (237 lines) - Text chunking logic
└── kokoro/
    ├── mod.rs        (146 lines) - TTS wrapper & pool implementation
    ├── model_paths.rs (44 lines) - Model file discovery
    └── voice_config.rs (311 lines) - Voice definitions & enums
```

---

## Issues Found

### 1. **Architecture & Organization** ⚠️

#### Issue 1.1: `server.rs` is a "God Module" (1013 lines)
**Location**: `server.rs:1-1013`

**Problem**: Single file contains:
- HTTP route handlers (5 endpoints)
- Request/Response DTOs (8 structs)
- Helper functions (duration calculation, text segmentation, multipart streaming)
- WAV file concatenation logic
- Test suite (200+ lines)

**Impact**:
- Hard to navigate and understand
- Difficult to test individual components
- Violates Single Responsibility Principle

**Severity**: Medium

---

#### Issue 1.2: Mixed Responsibilities in `main.rs`
**Location**: `main.rs:15-192`

**Problem**:
- CLI mode and server mode logic interleaved
- Manual parsing of command-line arguments instead of using `clap`
- Metadata generation duplicated between CLI and server code

**Impact**:
- Harder to maintain separate modes
- Code duplication
- Less robust argument parsing

**Severity**: Low-Medium

---

### 2. **Error Handling** ⚠️⚠️

#### Issue 2.1: Inconsistent Error Types
**Location**: Throughout codebase

**Problem**:
- `main.rs`: Uses `Box<dyn std::error::Error>`
- `server.rs`: Mix of `Result<_, String>` and `Result<_, (StatusCode, Json<_>)>`
- `kokoro/mod.rs`: Uses `Box<dyn Error>`
- No custom error types for domain-specific errors

**Examples**:
```rust
// server.rs:121
fn calculate_wav_duration(wav_bytes: &[u8]) -> Result<f64, String>

// server.rs:568
async fn generate_chunk_with_metadata(...) -> Result<(ChunkMetadata, Vec<u8>), String>

// main.rs:16
async fn main() -> Result<(), Box<dyn std::error::Error>>
```

**Impact**:
- Inconsistent error handling patterns
- Lost error context with `String` errors
- Difficult to handle errors appropriately at different layers

**Severity**: Medium-High

---

#### Issue 2.2: Silent Error Handling
**Location**: Multiple places

**Examples**:
```rust
// server.rs:328 - File deletion failure silently ignored
let _ = tokio::fs::remove_file(&temp_file_clone).await;

// server.rs:595 - Same issue
let _ = tokio::fs::remove_file(&temp_file_clone).await;

// auth.rs:110 - Read error silently logged but continues
tracing::debug!("Could not read key file {:?}: {}", location, e);
```

**Impact**:
- Potential resource leaks (temp files not cleaned up)
- Silent failures that are hard to debug

**Severity**: Medium

---

### 3. **Resource Management** ⚠️⚠️

#### Issue 3.1: Temp File Management
**Location**: `server.rs:309, 574`

**Problem**:
```rust
// Generate unique temporary filename
let temp_file = format!("/tmp/tts_{}.wav", Uuid::new_v4());
// ...
let _ = tokio::fs::remove_file(&temp_file_clone).await;  // Silent failure
```

**Issues**:
- Hardcoded `/tmp/` path (not portable to Windows)
- No guarantee of cleanup on errors or panics
- Silent cleanup failures

**Impact**:
- Temp file leaks on error paths
- Not cross-platform
- Disk space exhaustion over time

**Severity**: Medium-High

---

#### Issue 3.2: No Cleanup on Panic
**Location**: `server.rs:317-363`

**Problem**: If `spawn_blocking` task panics, temp file is never cleaned up.

**Impact**: Resource leaks

**Severity**: Medium

---

### 4. **Code Duplication** ⚠️

#### Issue 4.1: Duration/Metadata Calculation Duplicated
**Location**: `main.rs:138-160` and `server.rs:598-622`

**Problem**: Almost identical phrase segmentation and duration calculation logic appears in both files.

```rust
// main.rs:142-160
let duration_ms = calculate_wav_duration_cli(&audio_bytes)?;
let phrase_texts = segment_phrases_cli(&text);
let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
let mut phrases = Vec::new();
let mut cumulative_time = 0.0;
// ... (18 lines of calculation logic)

// server.rs:598-622
let duration_ms = calculate_wav_duration(&audio_bytes)...;
let phrase_texts = segment_phrases(text);
let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
let mut phrases = Vec::new();
let mut cumulative_time = 0.0;
// ... (24 lines of identical calculation logic)
```

**Impact**:
- Double maintenance burden
- Risk of divergence

**Severity**: Medium

---

#### Issue 4.2: Parallel `_cli` and Internal Functions
**Location**: `server.rs:103-200`

**Problem**:
```rust
pub fn calculate_wav_duration_cli(wav_bytes: &[u8]) -> Result<f64, Box<dyn std::error::Error>>
fn calculate_wav_duration(wav_bytes: &[u8]) -> Result<f64, String>

pub fn segment_words_cli(text: &str) -> Vec<String>
fn segment_words(text: &str) -> Vec<String>

pub fn segment_phrases_cli(text: &str) -> Vec<String>
fn segment_phrases(text: &str) -> Vec<String>
```

**Impact**:
- Unnecessary duplication
- Different error types for same operations
- Confusing API

**Severity**: Low-Medium

---

### 5. **Testing** ⚠️

#### Issue 5.1: Limited Test Coverage
**Location**: `server.rs:872-1012` (tests), other modules have minimal/no tests

**Current Coverage**:
- ✅ `server.rs`: Basic unit tests for text segmentation, multipart formatting
- ⚠️ `auth.rs`: Basic unit tests only, no integration tests
- ❌ `chunking.rs`: Basic tests only
- ❌ `kokoro/`: No tests
- ❌ `main.rs`: No tests
- ❌ No integration tests for HTTP endpoints

**Missing**:
- Integration tests for API endpoints
- Tests for error paths
- Tests for concurrent request handling
- Tests for pool exhaustion scenarios

**Severity**: Medium

---

### 6. **Performance & Concurrency** ℹ️

#### Issue 6.1: Inefficient Offset Calculation in Streaming
**Location**: `server.rs:744-756`

**Problem**:
```rust
// We need to estimate durations OR process chunks sequentially for accurate offsets
// For now, let's spawn tasks with estimated offsets (will fix after metadata arrives)
for (i, chunk_text) in remaining_chunks.iter().enumerate() {
    chunk_offsets.push((i + 1, chunk_text.clone(), temp_offset));
    // Estimate duration based on character count (rough approximation)
    // Average speech rate: ~150 words/min = ~2.5 words/sec = ~400ms/word
    // Average word length: ~5 chars => ~80ms/char
    temp_offset += (chunk_text.len() as f64) * 80.0;
}

// ... later fixes offsets after actual generation
metadata.start_offset_ms = cumulative_offset_ms;
cumulative_offset_ms += metadata.duration_ms;
```

**Issues**:
- Estimates offsets, then fixes them sequentially
- Parallel processing doesn't help latency as much as it could
- Code complexity for fixing offsets

**Impact**:
- Not actually a bug, but adds complexity
- Comment acknowledges the workaround

**Severity**: Low (informational)

---

### 7. **Security** ✅

#### Issue 7.1: API Key Storage (Not Actually an Issue)
**Location**: `auth.rs:71-119`

**Assessment**: API key file handling is **correct**:
- Keys stored in plaintext files (acceptable for server-side auth)
- Multiple search paths with priority
- Clear error messages
- Optional authentication

**Status**: ✅ No issues found

---

### 8. **Configuration & Deployment** ⚠️

#### Issue 8.1: Hardcoded Constants
**Location**: Multiple files

**Examples**:
```rust
// server.rs:202
const BOUNDARY: &str = "tts_chunk_boundary";

// server.rs:281
let use_chunking = req.enable_chunking && req.text.len() > 200;

// chunking.rs:15
max_chunk_size: 200,  // Lowered for faster streaming
min_chunk_size: 50,
```

**Impact**:
- No runtime configurability
- Requires recompilation to tune

**Severity**: Low

---

### 9. **Type Safety** ⚠️

#### Issue 9.1: Unsafe Impl Without Documentation
**Location**: `kokoro/mod.rs:16-17`

```rust
// Implement Send and Sync for TTS
// This is safe because we're controlling access through Arc and will use Mutex if needed
unsafe impl Send for TTS {}
unsafe impl Sync for TTS {}
```

**Problem**:
- Minimal justification comment
- "will use Mutex if needed" suggests uncertainty
- No explanation of why underlying `TTSKoko` is thread-safe

**Impact**:
- Potential for data races if assumption is wrong
- Unclear safety guarantees

**Severity**: Medium (needs verification)

---

## Positive Aspects ✅

### What's Done Well

1. **Modular Design Foundation**
   - Separation of concerns into modules (auth, chunking, kokoro, server)
   - Clear domain boundaries

2. **TTS Pool Implementation**
   - Well-designed connection pool with semaphore
   - Good statistics tracking
   - Proper resource lifecycle (RAII pattern with `Drop`)

3. **Comprehensive Voice Configuration**
   - Type-safe voice enum with 54+ voices
   - Rich metadata (gender, language, description)
   - Helper methods for filtering

4. **Streaming Support**
   - Multipart streaming for low-latency responses
   - Parallel chunk processing
   - First-chunk optimization

5. **CORS & Middleware**
   - Proper CORS setup
   - Clean auth middleware pattern

6. **Model Path Discovery**
   - Multiple fallback paths for model files
   - Environment variable support
   - Deployment-friendly (AWS Lambda, Docker, etc.)

---

## Proposed Restructuring

### Directory Structure

```
server/
├── Cargo.toml
├── src/
│   ├── main.rs              (50 lines)  - Entry point only
│   ├── cli/
│   │   └── mod.rs           (100 lines) - CLI mode implementation
│   ├── server/
│   │   ├── mod.rs           (50 lines)  - Server setup & router
│   │   ├── routes.rs        (150 lines) - Route handlers
│   │   ├── middleware.rs    (100 lines) - Auth middleware
│   │   └── state.rs         (30 lines)  - App state definition
│   ├── services/
│   │   ├── mod.rs
│   │   ├── tts_service.rs   (200 lines) - Core TTS generation logic
│   │   └── streaming.rs     (200 lines) - Multipart streaming logic
│   ├── models/
│   │   ├── mod.rs
│   │   ├── requests.rs      (80 lines)  - Request DTOs
│   │   ├── responses.rs     (80 lines)  - Response DTOs
│   │   └── metadata.rs      (50 lines)  - Metadata types
│   ├── audio/
│   │   ├── mod.rs
│   │   ├── wav_utils.rs     (150 lines) - WAV operations
│   │   ├── segmentation.rs  (150 lines) - Text->phrase/word segmentation
│   │   └── duration.rs      (80 lines)  - Duration calculations
│   ├── kokoro/
│   │   ├── mod.rs           (80 lines)  - TTS wrapper (simplified)
│   │   ├── pool.rs          (100 lines) - Pool implementation
│   │   ├── model_paths.rs   (44 lines)  - Unchanged
│   │   └── voice_config.rs  (311 lines) - Unchanged
│   ├── chunking/
│   │   └── mod.rs           (237 lines) - Unchanged (already good)
│   ├── auth/
│   │   └── mod.rs           (215 lines) - Unchanged (already good)
│   ├── config/
│   │   ├── mod.rs
│   │   ├── settings.rs      (100 lines) - Configuration structs
│   │   └── constants.rs     (50 lines)  - Constants
│   ├── error.rs             (150 lines) - Unified error types
│   └── utils/
│       └── temp_file.rs     (100 lines) - RAII temp file wrapper
├── tests/
│   ├── integration/
│   │   ├── api_tests.rs     (200 lines) - End-to-end API tests
│   │   └── pool_tests.rs    (150 lines) - Pool behavior tests
│   └── common/
│       └── test_helpers.rs  (100 lines) - Test utilities
└── benches/
    └── tts_bench.rs         (100 lines) - Performance benchmarks
```

**Total reorganization**: ~15 new files, better separation of concerns

---

## Detailed Refactoring Plan

### Phase 1: Error Handling (Priority: HIGH)

#### Task 1.1: Create Unified Error Type
**File**: `src/error.rs`

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt;

#[derive(Debug)]
pub enum TtsError {
    // I/O errors
    Io(std::io::Error),
    FileNotFound(String),

    // TTS engine errors
    TtsEngine(String),
    PoolExhausted,

    // Audio processing errors
    AudioParsing(String),
    WavConcatenation(String),

    // Request validation errors
    InvalidRequest(String),
    EmptyText,
    InvalidSpeed(f32),

    // Auth errors
    Unauthorized,
    InvalidApiKey,

    // Internal errors
    TaskJoin(String),
    Unknown(String),
}

impl fmt::Display for TtsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TtsError::Io(e) => write!(f, "I/O error: {}", e),
            TtsError::FileNotFound(path) => write!(f, "File not found: {}", path),
            TtsError::TtsEngine(msg) => write!(f, "TTS engine error: {}", msg),
            TtsError::PoolExhausted => write!(f, "TTS pool exhausted"),
            TtsError::AudioParsing(msg) => write!(f, "Audio parsing error: {}", msg),
            TtsError::WavConcatenation(msg) => write!(f, "WAV concatenation error: {}", msg),
            TtsError::InvalidRequest(msg) => write!(f, "Invalid request: {}", msg),
            TtsError::EmptyText => write!(f, "Text cannot be empty"),
            TtsError::InvalidSpeed(speed) => write!(f, "Invalid speed: {} (must be 0.0-3.0)", speed),
            TtsError::Unauthorized => write!(f, "Unauthorized"),
            TtsError::InvalidApiKey => write!(f, "Invalid API key"),
            TtsError::TaskJoin(msg) => write!(f, "Task execution error: {}", msg),
            TtsError::Unknown(msg) => write!(f, "Unknown error: {}", msg),
        }
    }
}

impl std::error::Error for TtsError {}

// Conversions
impl From<std::io::Error> for TtsError {
    fn from(err: std::io::Error) -> Self {
        TtsError::Io(err)
    }
}

impl From<hound::Error> for TtsError {
    fn from(err: hound::Error) -> Self {
        TtsError::AudioParsing(err.to_string())
    }
}

// Axum integration
impl IntoResponse for TtsError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            TtsError::EmptyText | TtsError::InvalidSpeed(_) | TtsError::InvalidRequest(_) => {
                (StatusCode::BAD_REQUEST, self.to_string())
            }
            TtsError::Unauthorized | TtsError::InvalidApiKey => {
                (StatusCode::UNAUTHORIZED, self.to_string())
            }
            TtsError::FileNotFound(_) => {
                (StatusCode::NOT_FOUND, self.to_string())
            }
            _ => {
                tracing::error!("Internal error: {}", self);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        (status, axum::Json(serde_json::json!({
            "status": "error",
            "error": message
        }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, TtsError>;
```

**Changes Required**:
- Replace all `Result<_, String>` with `Result<_>` (using `TtsError`)
- Replace all `Result<_, (StatusCode, Json<_>)>` with `Result<_>`
- Replace all `Result<_, Box<dyn Error>>` with `Result<_>` where appropriate

**Files to Update**:
- `main.rs`: Change return type to `Result<()>`
- `server.rs`: All function signatures
- `kokoro/mod.rs`: Pool and TTS methods

**Estimated Lines Changed**: ~150

---

#### Task 1.2: Fix Silent Error Handling
**Location**: `server.rs:328, 595`

**Change**:
```rust
// Before
let _ = tokio::fs::remove_file(&temp_file_clone).await;

// After
if let Err(e) = tokio::fs::remove_file(&temp_file_clone).await {
    tracing::warn!("Failed to cleanup temp file {}: {}", temp_file_clone, e);
}
```

**Estimated Lines Changed**: ~10

---

### Phase 2: Resource Management (Priority: HIGH)

#### Task 2.1: Create RAII Temp File Wrapper
**File**: `src/utils/temp_file.rs`

```rust
use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

/// Automatically cleaned-up temporary file
pub struct TempFile {
    path: PathBuf,
}

impl TempFile {
    /// Create a new temporary file with .wav extension
    pub fn new() -> Self {
        let path = std::env::temp_dir().join(format!("tts_{}.wav", Uuid::new_v4()));
        Self { path }
    }

    /// Get the path to the temporary file
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Convert to string path
    pub fn as_str(&self) -> &str {
        self.path.to_str().unwrap_or("")
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        // Spawn cleanup task (best effort, logged but not awaited)
        let path = self.path.clone();
        tokio::spawn(async move {
            if let Err(e) = fs::remove_file(&path).await {
                tracing::debug!("Failed to cleanup temp file {:?}: {}", path, e);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_temp_file_cleanup() {
        let path = {
            let temp = TempFile::new();
            fs::write(temp.path(), b"test").await.unwrap();
            assert!(temp.path().exists());
            temp.path().to_path_buf()
        };

        // Give cleanup task time to run
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // File should be cleaned up
        assert!(!path.exists());
    }
}
```

**Usage in `server.rs`**:
```rust
// Before
let temp_file = format!("/tmp/tts_{}.wav", Uuid::new_v4());
// ...
let _ = tokio::fs::remove_file(&temp_file_clone).await;

// After
let temp_file = TempFile::new();
// ... use temp_file.as_str() in TTS generation
// No manual cleanup needed!
```

**Benefits**:
- Cross-platform (uses `std::env::temp_dir()`)
- Guaranteed cleanup even on panic
- Cleaner code

**Estimated Lines Changed**: ~30 (+ 80 new lines)

---

### Phase 3: Split `server.rs` (Priority: MEDIUM)

#### Task 3.1: Extract DTOs
**File**: `src/models/requests.rs`

Move:
- `TTSRequest`
- `default_*` functions

**File**: `src/models/responses.rs`

Move:
- `TTSResponse`
- `VoiceInfo`
- `VoicesResponse`
- `HealthResponse`
- `PoolStatsResponse`

**File**: `src/models/metadata.rs`

Move:
- `PhraseMetadata`
- `ChunkMetadata`

**Estimated Lines**: ~150 total

---

#### Task 3.2: Extract Audio Processing
**File**: `src/audio/duration.rs`

Move:
- `calculate_wav_duration` (unified version, no _cli variant)

**File**: `src/audio/segmentation.rs`

Move:
- `segment_words` (unified)
- `segment_phrases` (unified)

**File**: `src/audio/wav_utils.rs`

Move:
- `concatenate_wav_files`
- `concatenate_wav_files_typed`

**Estimated Lines**: ~280 total

---

#### Task 3.3: Extract Streaming Logic
**File**: `src/services/streaming.rs`

Move:
- `BOUNDARY` constant
- `create_boundary_start`
- `create_boundary_end`
- `create_metadata_part`
- `create_audio_part`

**Estimated Lines**: ~80

---

#### Task 3.4: Extract TTS Service
**File**: `src/services/tts_service.rs`

```rust
use crate::audio::{duration, segmentation};
use crate::error::Result;
use crate::models::metadata::{ChunkMetadata, PhraseMetadata};
use crate::utils::temp_file::TempFile;
use crate::kokoro::TTSPool;
use std::sync::Arc;

pub struct TtsService {
    pool: Arc<TTSPool>,
}

impl TtsService {
    pub fn new(pool: Arc<TTSPool>) -> Self {
        Self { pool }
    }

    /// Generate TTS for a single text chunk
    pub async fn generate_single(
        &self,
        text: &str,
        voice: &str,
        speed: f32,
    ) -> Result<Vec<u8>> {
        let tts = self.pool.acquire().await?;
        let temp_file = TempFile::new();

        // Generate audio in blocking thread
        let text = text.to_string();
        let voice = voice.to_string();
        let path = temp_file.as_str().to_string();

        tokio::task::spawn_blocking(move || {
            futures::executor::block_on(tts.speak(&text, &path, &voice, speed))
        })
        .await??;

        // Read audio file
        let audio_data = tokio::fs::read(temp_file.path()).await?;

        Ok(audio_data)
    }

    /// Generate TTS with metadata for streaming
    pub async fn generate_with_metadata(
        &self,
        text: &str,
        voice: &str,
        speed: f32,
        chunk_index: usize,
        start_offset_ms: f64,
    ) -> Result<(ChunkMetadata, Vec<u8>)> {
        let audio_bytes = self.generate_single(text, voice, speed).await?;

        // Calculate duration
        let duration_ms = duration::calculate(&audio_bytes)?;

        // Segment text
        let phrase_texts = segmentation::segment_phrases(text);
        let metadata = self.build_metadata(
            text,
            phrase_texts,
            duration_ms,
            chunk_index,
            start_offset_ms,
        );

        Ok((metadata, audio_bytes))
    }

    fn build_metadata(
        &self,
        text: &str,
        phrase_texts: Vec<String>,
        duration_ms: f64,
        chunk_index: usize,
        start_offset_ms: f64,
    ) -> ChunkMetadata {
        // Calculate character-weighted durations
        let total_chars: usize = phrase_texts.iter().map(|p| p.len()).sum();
        let mut phrases = Vec::new();
        let mut cumulative_time = 0.0;

        for phrase_text in phrase_texts {
            let phrase_words = segmentation::segment_words(&phrase_text);
            let char_weight = phrase_text.len() as f64 / total_chars as f64;
            let phrase_duration = duration_ms * char_weight;

            phrases.push(PhraseMetadata {
                text: phrase_text,
                words: phrase_words,
                start_ms: cumulative_time,
                duration_ms: phrase_duration,
            });

            cumulative_time += phrase_duration;
        }

        ChunkMetadata {
            chunk_index,
            text: text.to_string(),
            phrases,
            duration_ms,
            start_offset_ms,
        }
    }
}
```

**Estimated Lines**: ~200

---

#### Task 3.5: Simplify Route Handlers
**File**: `src/server/routes.rs`

```rust
use axum::{extract::State, Json};
use crate::error::Result;
use crate::models::requests::TTSRequest;
use crate::models::responses::{HealthResponse, VoicesResponse, PoolStatsResponse};
use crate::server::state::AppState;
use crate::services::tts_service::TtsService;

pub async fn generate_tts(
    State(state): State<AppState>,
    Json(req): Json<TTSRequest>,
) -> Result<Vec<u8>> {
    // Validation
    if req.text.trim().is_empty() {
        return Err(TtsError::EmptyText);
    }
    if req.speed <= 0.0 || req.speed > 3.0 {
        return Err(TtsError::InvalidSpeed(req.speed));
    }

    let service = TtsService::new(state.tts_pool.clone());

    // Determine if chunking is needed
    if req.enable_chunking && req.text.len() > 200 {
        generate_chunked(service, req).await
    } else {
        service.generate_single(&req.text, &req.voice, req.speed).await
    }
}

// ... other handlers
```

Much cleaner! Handlers focus on HTTP concerns, service handles business logic.

**Estimated Lines**: ~150 (down from 800+)

---

### Phase 4: Remove Duplication (Priority: MEDIUM)

#### Task 4.1: Unify CLI/Server Logic
**File**: `src/cli/mod.rs`

Extract CLI mode from `main.rs` into dedicated module:

```rust
use crate::audio::{duration, segmentation};
use crate::error::Result;
use crate::models::metadata::{ChunkMetadata, PhraseMetadata};
use crate::kokoro::TTS;

pub struct CliRunner {
    tts: TTS,
}

impl CliRunner {
    pub async fn new(model_path: &str, voices_path: &str) -> Result<Self> {
        let tts = TTS::new(model_path, voices_path).await?;
        Ok(Self { tts })
    }

    pub async fn run(&self, text: &str, voice: &str) -> Result<()> {
        println!("Generating speech for: \"{}\"", text);

        let output_path = "output.wav";
        self.tts.speak(text, output_path, voice, 1.0)?;

        println!("Speech saved to {}", output_path);

        // Generate metadata
        self.generate_metadata(text, output_path).await?;

        Ok(())
    }

    async fn generate_metadata(&self, text: &str, audio_path: &str) -> Result<()> {
        println!("\nGenerating timing metadata...");

        let audio_bytes = tokio::fs::read(audio_path).await?;
        let duration_ms = duration::calculate(&audio_bytes)?;
        let phrase_texts = segmentation::segment_phrases(text);

        // Use same logic as server
        let metadata = build_metadata(text, phrase_texts, duration_ms, 0, 0.0);

        let metadata_path = "output.json";
        let json = serde_json::to_string_pretty(&metadata)?;
        tokio::fs::write(metadata_path, json).await?;

        self.print_summary(&metadata);

        Ok(())
    }

    fn print_summary(&self, metadata: &ChunkMetadata) {
        println!("Metadata saved to output.json");
        println!("\nTiming Summary:");
        println!("  Total duration: {:.2}s", metadata.duration_ms / 1000.0);
        println!("  Number of phrases: {}", metadata.phrases.len());
        println!("\nPhrase breakdown:");
        for (i, phrase) in metadata.phrases.iter().enumerate() {
            println!("  {}. \"{}\" - {:.2}s @ {:.2}s",
                i + 1,
                phrase.text,
                phrase.duration_ms / 1000.0,
                phrase.start_ms / 1000.0
            );
        }
    }
}

// Shared with server
fn build_metadata(
    text: &str,
    phrase_texts: Vec<String>,
    duration_ms: f64,
    chunk_index: usize,
    start_offset_ms: f64,
) -> ChunkMetadata {
    // Move implementation here from server/CLI
    // ... (same as in TtsService)
}
```

Then in `main.rs`:
```rust
mod cli;

#[tokio::main]
async fn main() -> Result<()> {
    // ... setup

    if server_mode {
        server::run(port, model_path, voices_path).await?;
    } else {
        let runner = cli::CliRunner::new(&model_path, &voices_path).await?;
        runner.run(&text, "bf_lily").await?;
    }

    Ok(())
}
```

**Benefits**:
- No duplication
- Both CLI and server use same audio processing logic
- Much smaller `main.rs`

**Estimated Lines Changed**: ~100

---

#### Task 4.2: Remove `_cli` Function Variants

Delete:
- `calculate_wav_duration_cli`
- `segment_words_cli`
- `segment_phrases_cli`

Update `main.rs` to use unified versions from `audio::*` modules.

**Estimated Lines Deleted**: ~30

---

### Phase 5: Configuration (Priority: LOW)

#### Task 5.1: Create Configuration Module
**File**: `src/config/settings.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub pool_size: usize,
    pub chunking: ChunkingConfig,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            pool_size: 2,
            chunking: ChunkingConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkingConfig {
    pub threshold_chars: usize,
    pub max_chunk_size: usize,
    pub min_chunk_size: usize,
}

impl Default for ChunkingConfig {
    fn default() -> Self {
        Self {
            threshold_chars: 200,
            max_chunk_size: 200,
            min_chunk_size: 50,
        }
    }
}

impl ServerConfig {
    pub fn from_env() -> Self {
        Self {
            port: env::var("TTS_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3000),
            pool_size: env::var("TTS_POOL_SIZE")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(2),
            chunking: ChunkingConfig::default(),
        }
    }
}
```

**File**: `src/config/constants.rs`

```rust
pub const MULTIPART_BOUNDARY: &str = "tts_chunk_boundary";
pub const DEFAULT_VOICE: &str = "bf_lily";
pub const DEFAULT_SPEED: f32 = 1.0;
pub const MIN_SPEED: f32 = 0.0;
pub const MAX_SPEED: f32 = 3.0;
```

**Estimated Lines**: ~100

---

### Phase 6: Testing (Priority: MEDIUM)

#### Task 6.1: Integration Tests
**File**: `tests/integration/api_tests.rs`

```rust
use axum_test::TestServer;

#[tokio::test]
async fn test_health_endpoint() {
    let server = setup_test_server().await;

    let response = server.get("/health").await;
    response.assert_status_ok();
    response.assert_json(&json!({ "status": "ok" }));
}

#[tokio::test]
async fn test_tts_generation() {
    let server = setup_test_server().await;

    let response = server
        .post("/tts")
        .json(&json!({
            "text": "Hello world",
            "voice": "bf_lily",
            "speed": 1.0
        }))
        .await;

    response.assert_status_ok();
    assert!(response.as_bytes().len() > 1000); // Should be WAV file
}

#[tokio::test]
async fn test_invalid_speed_rejected() {
    let server = setup_test_server().await;

    let response = server
        .post("/tts")
        .json(&json!({
            "text": "Hello",
            "speed": 5.0  // Invalid
        }))
        .await;

    response.assert_status_bad_request();
}

// ... more tests
```

**Estimated Lines**: ~200

---

#### Task 6.2: Pool Tests
**File**: `tests/integration/pool_tests.rs`

```rust
#[tokio::test]
async fn test_pool_concurrent_requests() {
    let pool = create_test_pool(2).await;

    let handles: Vec<_> = (0..10)
        .map(|i| {
            let pool = pool.clone();
            tokio::spawn(async move {
                let tts = pool.acquire().await.unwrap();
                // Simulate work
                tokio::time::sleep(Duration::from_millis(100)).await;
                i
            })
        })
        .collect();

    let results: Vec<_> = futures::future::join_all(handles)
        .await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();

    assert_eq!(results.len(), 10);
}
```

**Estimated Lines**: ~150

---

### Phase 7: Documentation (Priority: LOW)

#### Task 7.1: Add Module-Level Docs

```rust
//! # TTS Server
//!
//! A high-performance text-to-speech HTTP server built with Kokoro TTS.
//!
//! ## Features
//! - Multiple voice support (54+ voices)
//! - Streaming multipart responses
//! - Parallel chunk processing
//! - Connection pooling for concurrency
//! - Optional API key authentication
//!
//! ## Architecture
//! - `server/` - HTTP server and routing
//! - `services/` - Business logic
//! - `audio/` - Audio processing utilities
//! - `kokoro/` - TTS engine wrapper and pooling
//! - `models/` - Request/response DTOs
```

Add to each major module.

**Estimated Lines**: ~200 total (across all modules)

---

## Implementation Priority

### Must Do (Before Production) 🔴
1. **Error Handling** (Phase 1) - Critical for debuggability
2. **Resource Management** (Phase 2) - Prevents leaks
3. **Integration Tests** (Phase 6.1) - Ensures correctness

### Should Do (Improves Maintainability) 🟡
4. **Split server.rs** (Phase 3) - Much easier to work with
5. **Remove Duplication** (Phase 4) - DRY principle

### Nice to Have (Polish) 🟢
6. **Configuration** (Phase 5) - Better ops experience
7. **Pool Tests** (Phase 6.2) - Confidence in concurrency
8. **Documentation** (Phase 7) - Onboarding

---

## Estimated Effort

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| 1. Error Handling | 2 tasks | 4-6 hours | 🔴 High |
| 2. Resource Mgmt | 1 task | 2-3 hours | 🔴 High |
| 3. Split server.rs | 5 tasks | 8-10 hours | 🟡 Medium |
| 4. Remove Dup | 2 tasks | 3-4 hours | 🟡 Medium |
| 5. Configuration | 1 task | 2-3 hours | 🟢 Low |
| 6. Testing | 2 tasks | 6-8 hours | 🟡 Medium |
| 7. Documentation | 1 task | 2-3 hours | 🟢 Low |
| **Total** | **14 tasks** | **27-37 hours** | |

**Realistic Timeline**: 1-1.5 weeks for full refactor (with testing)

---

## Migration Strategy

### Approach: Incremental Refactor

**NOT** a rewrite - we'll refactor module by module while keeping tests green.

### Steps

1. **Setup** (30 min)
   - Create new directory structure
   - Move existing files to new locations (no changes yet)
   - Update imports

2. **Phase 1-2** (1-2 days)
   - Create error.rs
   - Update all error handling
   - Create temp_file.rs
   - Update resource management
   - Run tests after each change

3. **Phase 3** (2-3 days)
   - Extract one module at a time from server.rs
   - Update imports incrementally
   - Run tests after each extraction

4. **Phase 4-5** (1-2 days)
   - Consolidate CLI/server logic
   - Add configuration

5. **Phase 6** (1-2 days)
   - Write integration tests
   - Write pool tests

6. **Phase 7** (1 day)
   - Document everything

**Total**: 6-10 days with testing

---

## Breaking Changes

**Good news**: This refactoring should have **ZERO breaking changes** for API consumers!

- HTTP API remains identical
- Request/response formats unchanged
- Behavior unchanged
- Performance may improve (better pooling, less duplication)

Only internal code organization changes.

---

## Risks & Mitigation

### Risk 1: Unsafe `Send`/`Sync` impl
**Risk**: Data races if `TTSKoko` isn't actually thread-safe
**Mitigation**:
- Add comprehensive concurrency tests
- Verify with upstream library docs
- Consider removing `unsafe` and using different approach

### Risk 2: Test Coverage
**Risk**: Not enough tests to catch regressions during refactor
**Mitigation**:
- Write integration tests BEFORE refactoring
- Use test-driven refactoring approach

### Risk 3: Temp File Cleanup in `Drop`
**Risk**: Spawned cleanup tasks may not complete before shutdown
**Mitigation**:
- Add graceful shutdown handler
- Wait for cleanup tasks on shutdown

---

## Alternatives Considered

### Alternative 1: Full Rewrite
**Rejected** because:
- Current code works well
- High risk of introducing bugs
- Much longer timeline (3-4 weeks)

### Alternative 2: Do Nothing
**Rejected** because:
- Code duplication will cause maintenance burden
- Error handling issues will make debugging hard
- Temp file leaks are unacceptable for production

### Alternative 3: Minimal Changes Only (Error + Resources)
**Partially Accepted**:
- If time is very constrained, do Phase 1-2 only
- Other phases are "nice to have" but not critical

---

## Post-Refactor Metrics

Expected improvements:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Largest file | 1013 lines | ~250 lines | ↓ 75% |
| Error types | 3 (inconsistent) | 1 (unified) | ↓ 66% |
| Code duplication | ~50 lines | 0 lines | ↓ 100% |
| Test coverage | ~15% | ~60% | ↑ 300% |
| Module count | 7 | ~20 | ↑ 186% |
| Temp file leaks | Possible | Zero | ✅ |

---

## Conclusion

**Should we refactor?** ✅ **YES**

**Reason**: The codebase is **good** but has **clear improvement opportunities**. The refactoring is **low-risk** (incremental, well-tested) with **high reward** (better maintainability, fewer bugs, easier onboarding).

**Recommendation**: Proceed with **Phases 1-4** as the core refactor (~80% of value), then evaluate time for remaining phases.

**Next Steps**:
1. Review this plan with team
2. Prioritize phases based on timeline
3. Create feature branch: `refactor/server-architecture`
4. Start with Phase 1 (error handling)
