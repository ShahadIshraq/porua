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

## Model Attribution

This server uses the **Kokoro-82M** TTS model:

- **Model:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad
- **ONNX Implementation:** [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)
- **License:** Apache 2.0
- **Parameters:** 82 million
- **Voices:** 28 English voices (American & British)
- **Quality:** Frontier TTS model delivering high-quality speech synthesis comparable to much larger models

### Model Files

The server requires two model files (automatically downloaded during installation):

- `kokoro-v1.0.onnx` (310 MB) - ONNX format TTS model weights (fp32 precision)
- `voices-v1.0.bin` (27 MB) - Voice style vectors for 28 English voices

**Download source:** https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

Models are **NOT included** in the repository or release packages to keep download sizes small. They are downloaded automatically via the installation script.

## Prerequisites

- **Rust** (1.75 or later): [Install Rust](https://rustup.rs/)
- **macOS/Linux**: Tested on macOS (Apple Silicon and Intel) and Linux
- **Model files**: Downloaded automatically during installation
  - `kokoro-v1.0.onnx` (310 MB) - from [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx/releases)
  - `voices-v1.0.bin` (27 MB)
  - Source: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

## Installation Options

### Option 1: Pre-built Package (Recommended for Production)

Download and install the pre-built package for your platform:

```bash
# Download the package (replace URL with your release URL)
wget https://[your-url]/porua_server-v0.1.0-macos-arm64.tar.gz

# Extract
tar -xzf porua_server-v0.1.0-macos-arm64.tar.gz
cd porua_server-v0.1.0-macos-arm64

# Download TTS models (~337 MB from official source)
./download_models.sh

# Run automated installer
./install.sh

# Verify installation
porua_server --version
```

**Models are downloaded from the official Kokoro ONNX repository:** https://github.com/thewh1teagle/kokoro-onnx

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

The server uses intelligent path resolution to automatically find models:

### Priority 1: Environment Variable (Strict)
If `TTS_MODEL_DIR` is set, it takes absolute priority:
```bash
# Set custom model directory (highest priority)
export TTS_MODEL_DIR=/path/to/your/models
./target/release/porua_server "Test message"
```

Or configure in `.env` file (auto-loaded via dotenvy):
```bash
echo "TTS_MODEL_DIR=/path/to/models" >> ~/.local/porua/.env
```

### Priority 2: Fallback Search Paths
If `TTS_MODEL_DIR` is not set, the server searches in order:

1. `/opt/models` - AWS Lambda standard location
2. `/usr/local/porua/models` - System installation
3. `~/.local/porua/models` - User installation
4. `~/.tts-server/models` - Alternative user location
5. Symlink resolution - Resolves binary symlinks to find `../models`
6. `./models` - Current directory (development only)

**How it works:**
- Packaged installations use symlink resolution: `~/.local/bin/porua_server` → `~/.local/porua/bin/porua_server` → finds `../models`
- `.env` file is automatically loaded from installation directory
- No shell profile configuration needed!

### Downloading Models

Models are sourced from the official Kokoro ONNX repository:

**Automatic download (recommended):**
```bash
# If using pre-built package
./download_models.sh

# If building from source
cd server/packaging
./download_models.sh
```

**Manual download:**
```bash
mkdir -p models
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
```

**Model source:** https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

## Development

### Initial Setup

**Configure Git Hooks (Required for Contributors):**

The repository includes pre-commit hooks that automatically check code formatting and run tests before each commit. To enable them:

```bash
# From the repository root
git config core.hooksPath .githooks
```

**What the pre-commit hook does:**
- ✅ Runs `cargo fmt --check` to ensure code is properly formatted
- ✅ Runs `cargo test` to ensure all tests pass
- ✅ Prevents commits with formatting issues or failing tests
- ⚠️ Can be bypassed with `git commit --no-verify` (not recommended)

**To fix formatting issues:**
```bash
cargo fmt --manifest-path server/Cargo.toml
```

**Why this matters:** The pre-commit hook catches compilation errors and formatting issues locally before they reach CI, saving time and preventing failed builds.

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

### Authentication & Rate Limiting

The server supports optional API key authentication and intelligent rate limiting to protect against abuse.

#### Authentication

**Setup:**
1. Create an `api_keys.txt` file with one API key per line
2. Lines starting with `#` are treated as comments
3. Empty lines are ignored

**Example `api_keys.txt`:**
```
# Production API Keys
production-key-abc123
staging-key-xyz789

# Development keys
dev-key-test456
```

**API Key File Locations** (checked in order):
1. `TTS_API_KEY_FILE` environment variable (highest priority)
2. `./api_keys.txt` (current directory)
3. `~/.tts-server/api_keys.txt` (user home directory)
4. `/etc/tts-server/api_keys.txt` (system-wide)

**Using API Keys:**

Clients can authenticate using either header format:

```bash
# Method 1: X-API-Key header (preferred)
curl -X POST http://localhost:3003/tts \
  -H "X-API-Key: your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice": "bf_lily"}' \
  --output speech.wav

# Method 2: Authorization Bearer token
curl -X POST http://localhost:3003/tts \
  -H "Authorization: Bearer your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice": "bf_lily"}' \
  --output speech.wav
```

#### Rate Limiting

The server features **dual-mode rate limiting** that automatically adapts based on authentication status:

**Automatic Mode Selection:**
- **With API keys enabled**: Per-API-key rate limiting (each key has independent limits)
- **Without API keys**: Per-IP address rate limiting (each IP has independent limits)

**Default Rate Limits:**
- **Authenticated** (with API keys): 10 requests/second, burst size 20
- **Unauthenticated** (without API keys): 5 requests/second, burst size 10 (more restrictive)

**Rate Limiting Modes:**

Set via `RATE_LIMIT_MODE` environment variable:
- `auto` - Automatic mode selection (recommended)
- `per-key` - Rate limit by API key only (requires authentication)
- `per-ip` - Rate limit by IP address only
- `disabled` - No rate limiting (NOT recommended for production)

**Configuration Examples:**

```bash
# Default behavior - auto mode
./target/release/tts_server --server

# Explicitly set auto mode
RATE_LIMIT_MODE=auto ./target/release/tts_server --server

# Force per-IP mode even with API keys
RATE_LIMIT_MODE=per-ip ./target/release/tts_server --server

# Disable rate limiting (development only!)
RATE_LIMIT_MODE=disabled ./target/release/tts_server --server

# Custom authenticated rate limits
RATE_LIMIT_AUTHENTICATED_PER_SECOND=20 \
RATE_LIMIT_AUTHENTICATED_BURST_SIZE=40 \
./target/release/tts_server --server

# Custom unauthenticated rate limits
RATE_LIMIT_UNAUTHENTICATED_PER_SECOND=3 \
RATE_LIMIT_UNAUTHENTICATED_BURST_SIZE=5 \
./target/release/tts_server --server
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MODE` | `auto` | Rate limiting mode: `auto`, `per-key`, `per-ip`, `disabled` |
| `RATE_LIMIT_AUTHENTICATED_PER_SECOND` | `10` | Requests/second for authenticated users |
| `RATE_LIMIT_AUTHENTICATED_BURST_SIZE` | `20` | Burst size for authenticated users |
| `RATE_LIMIT_UNAUTHENTICATED_PER_SECOND` | `5` | Requests/second for unauthenticated users |
| `RATE_LIMIT_UNAUTHENTICATED_BURST_SIZE` | `10` | Burst size for unauthenticated users |
| `TTS_API_KEY_FILE` | (none) | Path to API keys file |

**Legacy Variables** (for backward compatibility):
- `RATE_LIMIT_PER_SECOND` - Sets both authenticated and unauthenticated limits
- `RATE_LIMIT_BURST_SIZE` - Sets both authenticated and unauthenticated burst sizes

**Rate Limit Responses:**

When rate limited, the server returns HTTP 429 with a `Retry-After` header:

```bash
HTTP/1.1 429 Too Many Requests
Retry-After: 2
Content-Type: application/json

{
  "status": "error",
  "error": "Rate limit exceeded. Please retry after 2 seconds."
}
```

**Behind Reverse Proxy:**

The server automatically detects client IP addresses from:
1. `X-Forwarded-For` header (load balancers)
2. `X-Real-IP` header (nginx)
3. Direct connection IP (fallback)

**Production Recommendations:**
- ✅ Enable API key authentication for production deployments
- ✅ Use `auto` mode for intelligent rate limiting
- ✅ Set appropriate limits based on your infrastructure capacity
- ✅ Monitor rate limit violations in logs
- ⚠️ Never disable rate limiting in production environments

## Packaging & Distribution

### Creating Distribution Packages

The `build_package.sh` script supports both local builds and CI/cross-compilation scenarios.

**Local build (auto-detect platform):**
```bash
cd server
./packaging/build_package.sh
```

**CI build with pre-compiled binary:**
```bash
# Example: macOS ARM64 cross-compiled build
./packaging/build_package.sh \
  --version 0.1.0 \
  --platform macos \
  --arch arm64 \
  --binary-path target/aarch64-apple-darwin/release/porua_server \
  --skip-build
```

**Available options:**
```bash
--version VERSION      Version string (default: from Cargo.toml)
--platform PLATFORM    macos/linux/windows (default: auto-detect)
--arch ARCH            arm64/x64 (default: auto-detect)
--binary-path PATH     Path to pre-built binary
--binary-name NAME     Binary filename (porua_server or porua_server.exe)
--output-dir DIR       Output directory (default: dist)
--skip-build           Skip cargo build (useful for CI)
--help                 Show help message
```

**Note:** Models are NOT included in packages. Users download them separately via `download_models.sh` script.

This approach:
- Keeps package sizes small (~30 MB vs ~370 MB)
- Faster downloads and CI builds
- Bandwidth savings: Users download models once, can use with multiple binary versions
- Separation of concerns: Binary updates don't require re-downloading models
- Single source of truth: Same script for local and CI builds
- Downloads from official source: https://github.com/thewh1teagle/kokoro-onnx