# TTS Server

A high-performance, Rust-based Text-to-Speech HTTP server using the Kokoro TTS engine with 28 English voices.

## Overview

This server provides high-quality text-to-speech synthesis using the Kokoro v1.0 model with advanced performance optimizations including:
- **Engine Pooling** - Pre-warmed TTS engines for concurrent request handling
- **Intelligent Text Chunking** - Parallel processing of long texts for faster generation
- **Streaming Responses** - Progressive audio delivery for better user experience
- **REST API** - Full HTTP/JSON API with health monitoring and statistics

The server runs in two modes:
1. **HTTP Server Mode** - Production-ready REST API (recommended)
2. **CLI Mode** - Simple command-line interface for testing

## Prerequisites

- **Rust** (1.75 or later): [Install Rust](https://rustup.rs/)
- **macOS/Linux**: Tested on macOS (Apple Silicon and Intel)
- **Model files**: Already included in `models/` directory
  - `kokoro-v1.0.onnx` (310 MB)
  - `voices-v1.0.bin` (27 MB)

## Installation Options

### Option 1: Pre-built Package (Recommended for Production)

Download and install the pre-built package for your platform:

```bash
# Download the package (replace URL with your release URL)
wget https://[your-url]/tts-server-v0.1.0-macos-arm64.tar.gz

# Extract
tar -xzf tts-server-v0.1.0-macos-arm64.tar.gz
cd tts-server-v0.1.0-macos-arm64

# Run automated installer
./install.sh

# Verify installation
tts_server --version
```

For detailed installation instructions, see [INSTALL.md](packaging/INSTALL.md).

### Option 2: Build from Source (For Development)

Build the server from source using Cargo:

```bash
cd server
cargo build --release
```

The compiled binary will be at `target/release/tts_server`.

## Quick Start

### 1. Run the HTTP Server

**Start the server with default settings (pool size: 2, port: 3000):**
```bash
./target/release/tts_server --server
```

**Start with custom configuration:**
```bash
# Pool of 3 TTS engines on port 3003
TTS_POOL_SIZE=3 ./target/release/tts_server --server --port 3003

# With debug logging
RUST_LOG=debug TTS_POOL_SIZE=3 ./target/release/tts_server --server --port 3003

# Quiet mode (warnings and errors only)
RUST_LOG=warn ./target/release/tts_server --server --port 3003
```

**Expected output:**
```
Loading model from: models/kokoro-v1.0.onnx
Loading voices from: models/voices-v1.0.bin
Starting TTS HTTP server on port 3003...
Initializing TTS pool with 3 engines...
INFO Initializing TTS pool with 3 engines...
INFO TTS pool initialized successfully

Server listening on http://0.0.0.0:3003

Available endpoints:
  POST   /tts          - Generate speech from text
  POST   /tts/stream   - Generate speech with streaming response
  GET    /voices       - List available voices
  GET    /samples/*    - Voice sample audio files
  GET    /health       - Health check
  GET    /stats        - Pool statistics

Pool configuration:
  Pool size: 3 engines
  Set TTS_POOL_SIZE environment variable to change
```

**Note:** Voice listings are hidden by default. To see all voices during startup, use `RUST_LOG=kokoros=info`.

### 2. Test the API

**Generate speech:**
```bash
curl -X POST http://localhost:3003/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, this is Kokoro TTS!", "voice": "bf_lily", "speed": 1.0}' \
  --output speech.wav
```

**Check server health:**
```bash
curl http://localhost:3003/health
# {"status":"ok"}
```

**View pool statistics:**
```bash
curl http://localhost:3003/stats
# {"pool_size":3,"active_requests":0,"available_engines":3,"total_requests":5}
```

**List available voices:**
```bash
curl http://localhost:3003/voices | jq .
```

### 3. CLI Mode

```bash
./target/release/tts_server "Hello, this is Kokoro TTS speaking!"
```

Generates `output.wav` and `output.json` with timing metadata.

## API Documentation

### Endpoints

#### `POST /tts` - Generate Speech

Generate speech from text with automatic chunking for long texts.

**Request:**
```json
{
  "text": "Text to convert to speech",
  "voice": "bf_lily",                    // Optional, default: "bf_lily"
  "speed": 1.0,                           // Optional, default: 1.0 (range: 0.1-3.0)
  "enable_chunking": true                 // Optional, default: true
}
```

**Response:**
- **Success (200)**: WAV audio file (binary)
- **Error (400/500)**: JSON error message

**Features:**
- **Automatic chunking**: Texts > 500 characters are split into chunks and processed in parallel
- **Smart splitting**: Respects sentence boundaries for natural speech
- **WAV concatenation**: Chunks are seamlessly combined into single audio file

**Examples:**
```bash
# Short text (no chunking)
curl -X POST http://localhost:3003/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world!", "voice": "bf_lily"}' \
  --output hello.wav

# Long text (automatic chunking)
curl -X POST http://localhost:3003/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your very long text here... (600+ characters)",
    "voice": "am_adam",
    "speed": 1.2,
    "enable_chunking": true
  }' \
  --output long_speech.wav

# Disable chunking for specific control
curl -X POST http://localhost:3003/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "...", "enable_chunking": false}' \
  --output speech.wav
```

#### `POST /tts/stream` - Multipart Streaming with Metadata

Generate speech with streaming response that includes both audio chunks and timing metadata in multipart format.

**Request:** Same as `/tts` endpoint

**Response:**
- **Success (200)**: Multipart/mixed stream with alternating metadata (JSON) and audio (WAV) parts
- **Headers**:
  - `Content-Type: multipart/mixed; boundary=tts_chunk_boundary`
  - `Transfer-Encoding: chunked`

**Response Format:**
The response contains alternating parts:
1. **Metadata part** (JSON): Timing information for the chunk
2. **Audio part** (WAV): Audio data for the chunk

**Metadata Structure:**
```json
{
  "chunk_index": 0,
  "text": "Full chunk text",
  "phrases": [
    {
      "text": "Phrase text",
      "start_ms": 0.0,
      "duration_ms": 1900.0
    }
  ],
  "duration_ms": 7600.0,
  "start_offset_ms": 0.0
}
```

**Phrase Segmentation:**
- Intelligent segmentation: sentences ≤8 words or comma-aware splitting
- Smart sentence detection: handles abbreviations (Dr., Mrs., etc.), decimals, URLs
- Unicode normalization: smart quotes, em-dashes, ellipsis
- Timing: character-weighted proportional distribution (~70-75% accuracy)
- Each phrase includes `text`, `start_ms`, and `duration_ms`

**Use Cases:**
- Real-time text highlighting synchronized with audio playback
- Progressive audio delivery with timing information
- Building karaoke-style reading applications
- Accessible reading tools with synchronized highlighting

**Example:**
```bash
curl -X POST http://localhost:3003/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world. This is a test.", "voice": "bf_emma"}' \
  --output stream_multipart.txt
```

#### `GET /voices` - List Available Voices

Get 28 English voices (American and British) with metadata and sample URLs.

**Response:**
```json
{
  "voices": [
    {
      "id": "bf_lily",
      "name": "Lily",
      "gender": "Female",
      "language": "BritishEnglish",
      "description": "British female voice - Lily",
      "sample_url": "/samples/bf_lily.wav"
    },
    ...
  ]
}
```

**Example:**
```bash
curl http://localhost:3003/voices | jq '.voices[] | select(.gender == "Female")'
```

#### `GET /samples/{voice_id}.wav` - Voice Sample Audio

Download voice sample audio files (~10 seconds each).

**Response:**
- **Success (200)**: WAV audio file
- **Error (404)**: File not found

**Example:**
```bash
curl http://localhost:3003/samples/bf_lily.wav --output lily_sample.wav
```

#### `GET /health` - Health Check

Simple health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

#### `GET /stats` - Pool Statistics

Get real-time statistics about the TTS engine pool.

**Response:**
```json
{
  "pool_size": 3,
  "active_requests": 1,
  "available_engines": 2,
  "total_requests": 42
}
```

**Fields:**
- `pool_size`: Total number of TTS engines in the pool
- `active_requests`: Currently processing requests
- `available_engines`: Number of idle engines ready for work
- `total_requests`: Lifetime request count since server start

## Model Path Resolution

The server automatically searches for models in the following locations (in priority order):

1. **`TTS_MODEL_DIR` environment variable** ← Recommended for production
2. `/opt/models` (AWS Lambda standard location)
3. `/usr/local/share/porua/models`
4. `/opt/porua/models`
5. `~/.porua/models`
6. `models/` (current directory)
7. `../../models/` (relative to binary location)

**How it works:** The server checks each location in order and uses the **first path where the model files actually exist**. This allows the binary to work in different environments (development, production, Lambda) without code changes.

```bash
# Set custom model directory
export TTS_MODEL_DIR=/path/to/your/models
./target/release/tts_server "Test message"
```


## Development

### Clean Build

```bash
cargo clean
cargo build --release
```

### Development Build (faster compilation, larger binary)

```bash
cargo build
./target/debug/tts_server "Development test"
```

### Check for Errors

```bash
cargo check
```

### Format Code

```bash
cargo fmt
```

### Run Tests

```bash
cargo test
```

### Generate Voice Samples

Regenerate all 28 English voice sample files in the `samples/` directory:

```bash
cargo run --release --bin generate_samples
```

This utility binary generates ~10-second sample audio files for all English voices. The binary is located in `src/bin/generate_samples.rs` following Rust's convention of placing additional executable targets in the `src/bin/` directory (separate from the main binary in `src/main.rs`).


## Configuration

### Log Level Control

The server uses the `RUST_LOG` environment variable to control logging verbosity. This allows you to see more or less detail based on your needs.

**Default behavior:** The server shows clean, essential logs only:
- Your application logs (INFO level)
- Dependencies are filtered (WARN level)
- Voice listings are hidden for cleaner output

**Available log levels:**
- `error` - Only show errors
- `warn` - Show warnings and errors
- `info` - Show informational messages
- `debug` - Show detailed debug information
- `trace` - Show all possible logging (very verbose)

**Common usage examples:**

```bash
# Default - clean output, hides voice listings
./target/release/tts_server --server

# Show voice listings during startup
RUST_LOG=kokoros=info ./target/release/tts_server --server

# Debug mode - shows detailed operation logs
RUST_LOG=debug ./target/release/tts_server --server

# Very quiet mode - only warnings and errors
RUST_LOG=warn ./target/release/tts_server --server

# Module-specific logging
RUST_LOG=tts_server=debug,ort=warn,kokoros=warn ./target/release/tts_server --server
```

## Packaging & Distribution

### Creating Distribution Packages

To create distributable packages for deployment:

```bash
# Run the packaging script
./packaging/build_package.sh
```