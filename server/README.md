# TTS Server

A high-performance, Rust-based Text-to-Speech HTTP server using the Kokoro TTS engine with 54 voice options across multiple languages.

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

## Project Structure

```
server/
├── src/
│   ├── main.rs                 # Entry point and server initialization
│   ├── server.rs               # HTTP server and API endpoints
│   ├── chunking.rs             # Text chunking for parallel processing
│   └── kokoro/
│       ├── mod.rs              # TTS engine wrapper and pooling
│       ├── voice_config.rs     # 54 voice configurations
│       └── model_paths.rs      # Model path resolution
├── models/                      # TTS model files (337 MB total)
│   ├── kokoro-v1.0.onnx
│   └── voices-v1.0.bin
├── Cargo.toml                   # Dependencies
└── README.md                    # This file
```

## Quick Start

### 1. Build the Server

```bash
cd server
cargo build --release
```

The compiled binary will be at `target/release/tts_server`.

### 2. Run the HTTP Server

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
  GET    /health       - Health check
  GET    /stats        - Pool statistics

Pool configuration:
  Pool size: 3 engines
  Set TTS_POOL_SIZE environment variable to change
```

**Note:** Voice listings are hidden by default. To see all 54 voices during startup, use `RUST_LOG=kokoros=info`.

### 3. Test the API

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

### 4. CLI Mode (Simple Testing)

For quick tests without starting the server:

```bash
./target/release/tts_server "Hello, this is Kokoro TTS speaking!"
```

**Output:**
- Generates speech and saves to `output.wav` in the current directory
- Uses British female voice "Lily" (`BritishFemaleLily`) by default

**Play the audio (macOS):**
```bash
afplay output.wav
```

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

#### `POST /tts/stream` - Streaming Speech Generation

Generate speech with streaming response for progressive audio delivery.

**Request:** Same as `/tts` endpoint

**Response:**
- **Success (200)**: Chunked WAV audio stream
- **Headers**:
  - `Content-Type: audio/wav`
  - `Transfer-Encoding: chunked`

**Use Case:** Better user experience for long texts - audio chunks are delivered as they're generated instead of waiting for complete processing.

**Example:**
```bash
curl -X POST http://localhost:3003/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text": "Streaming audio generation example", "voice": "bf_emma"}' \
  --output stream.wav
```

#### `GET /voices` - List Available Voices

Get all 54 available voices with metadata.

**Response:**
```json
{
  "voices": [
    {
      "id": "bf_lily",
      "name": "Lily",
      "gender": "Female",
      "language": "BritishEnglish",
      "description": "British female voice - Lily"
    },
    ...
  ]
}
```

**Example:**
```bash
curl http://localhost:3003/voices | jq '.voices[] | select(.gender == "Female")'
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

**Use Case:** Monitoring, capacity planning, and debugging.

### Performance Optimizations

#### 1. Engine Pooling

Pre-warmed TTS engines eliminate cold-start latency and enable concurrent processing.

**Configuration:**
```bash
# Set pool size (default: 2)
export TTS_POOL_SIZE=4
./target/release/tts_server --server --port 3003
```

**Benefits:**
- No model loading delay for requests
- True concurrent request handling (up to pool_size simultaneous requests)
- Round-robin engine allocation for load balancing

**Trade-offs:**
- Memory: Each engine uses ~500 MB
- Startup time: ~1-2 seconds per engine during initialization

**Recommended pool sizes:**
- Development/Testing: 1-2 engines
- Production (low traffic): 2-3 engines
- Production (high traffic): 4-6 engines

#### 2. Intelligent Text Chunking

Long texts are automatically split and processed in parallel for faster generation.

**How it works:**
1. Texts > 500 characters trigger automatic chunking
2. Text is split at sentence boundaries (periods, question marks, exclamation points)
3. Chunks are processed concurrently using available pool engines
4. Audio chunks are concatenated into seamless output

**Configuration:**
```rust
// In chunking.rs - ChunkingConfig
max_chunk_size: 250 characters  // Maximum chunk size
min_chunk_size: 50 characters   // Minimum chunk size
```

**Performance impact:**
- **Short text** (<500 chars): No overhead
- **Medium text** (500-1000 chars): 30-50% faster
- **Long text** (>1000 chars): 40-60% faster

**Example:**
```bash
# 611 character text split into 4 chunks, processed in parallel
curl -X POST http://localhost:3003/tts \
  -d '{"text": "Very long text here..."}' \
  --output output.wav

# Server logs show:
# INFO Split text into 4 chunks for parallel processing
# All 4 chunks process concurrently using pool engines
```

#### 3. Streaming Responses

Progressive audio delivery improves perceived latency for long texts.

**Benefits:**
- Reduced time-to-first-byte
- Better user experience (can start playback before completion)
- Lower memory footprint on client side

**Use Case:** Real-time applications, audiobook generation, podcast production

## Model Path Resolution

The server automatically searches for models in the following locations (in priority order):

1. **`TTS_MODEL_DIR` environment variable** ← Recommended for production
2. `/opt/models` (AWS Lambda standard location)
3. `/usr/local/share/tts-server/models`
4. `/opt/tts-server/models`
5. `~/.tts-server/models`
6. `models/` (current directory)
7. `../../models/` (relative to binary location)

**How it works:** The server checks each location in order and uses the **first path where the model files actually exist**. This allows the binary to work in different environments (development, production, Lambda) without code changes.

### Using Environment Variable

```bash
# Set custom model directory
export TTS_MODEL_DIR=/path/to/your/models

# Run server
./target/release/tts_server "Test message"
```

### Verify Model Loading

The server logs which paths it's loading from:

```
Loading model from: /Users/yourname/workspace/tts-plugin/server/models/kokoro-v1.0.onnx
Loading voices from: /Users/yourname/workspace/tts-plugin/server/models/voices-v1.0.bin
Initializing TTS engine for CLI mode...
Generating speech for: "Test message"
Using voice: Lily (British female voice - Lily)
Speech saved to output.wav
```

## Available Voices

The server includes 54 voices across multiple languages:

- **American English**: 20 voices (11 female, 9 male)
- **British English**: 8 voices (4 female, 4 male)
- **European**: 3 voices
- **French**: 1 voice
- **Hindi**: 4 voices
- **Italian**: 2 voices
- **Japanese**: 5 voices
- **Portuguese**: 3 voices
- **Chinese**: 8 voices

Currently using: `BritishFemaleLily` (configurable in [main.rs:94](src/main.rs#L94))

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

**What each level shows:**

- **Default (no RUST_LOG set)**: Clean, essential logs
  ```
  Loading model from: models/kokoro-v1.0.onnx
  Loading voices from: models/voices-v1.0.bin
  Starting TTS HTTP server on port 3000...
  Initializing TTS pool with 3 engines...
  INFO Initializing TTS pool with 3 engines...
  INFO TTS pool initialized successfully

  Server listening on http://0.0.0.0:3000
  ```

- **warn**: Minimal output, only startup and errors
  ```
  Loading model from: models/kokoro-v1.0.onnx
  Loading voices from: models/voices-v1.0.bin
  Starting TTS HTTP server on port 3000...

  Server listening on http://0.0.0.0:3000
  ```

- **debug**: Detailed request/response information
  ```
  [All default logs plus:]
  DEBUG Loading TTS engine 1/3...
  DEBUG Loading TTS engine 2/3...
  DEBUG TTS request - text_len=1205, voice='bf_lily', speed=1, chunking=true
  DEBUG Split text into 3 chunks for parallel processing
  DEBUG Concatenating 3 audio chunks
  ```

- **trace**: Everything including internal library details (very verbose, not recommended)

**Production recommendations:**
- Use default (no RUST_LOG) for production - clean and professional
- Use `RUST_LOG=warn` to reduce log volume in high-traffic scenarios
- Use `RUST_LOG=debug` for troubleshooting issues
- Never use `trace` in production (performance impact)

**Default log filtering:**

By default (when RUST_LOG is not set), the server uses:
```
tts_server=info,ort=warn,kokoros=warn
```

This configuration:
- Shows important events from tts_server
- Hides noisy ONNX Runtime initialization logs
- Hides the 54-voice listing from kokoros (use `RUST_LOG=kokoros=info` to see it)
- Uses compact formatting without module paths for readability

**Note:** The "Audio saved to /tmp/tts_*.wav" messages come from the kokoros library. They appear at INFO level, so they're hidden by default. To see them, use `RUST_LOG=kokoros=info`.

### Change Voice

Edit [src/main.rs](src/main.rs#L94):

```rust
// Change from:
let voice = Voice::BritishFemaleLily;

// To any other voice, e.g.:
let voice = Voice::AmericanFemaleNova;
let voice = Voice::AmericanMaleAdam;
let voice = Voice::JapaneseFemaleAlpha;
```

See all available voices in [src/kokoro/voice_config.rs](src/kokoro/voice_config.rs#L55).

### Change Output File

Edit [src/main.rs](src/main.rs#L100):

```rust
// Change output path
tts.speak(&text, "custom_output.wav", voice.id(), 1.0)?;
```

### Adjust Speed

Change the last parameter (default 1.0) in [src/main.rs](src/main.rs#L100):

```rust
// Slower (0.5x)
tts.speak(&text, "output.wav", voice.id(), 0.5)?;

// Faster (1.5x)
tts.speak(&text, "output.wav", voice.id(), 1.5)?;
```

## Troubleshooting

### Models Not Found

**Error:**
```
Error: Failed to load model from: models/kokoro-v1.0.onnx
```

**Solution:**
Set the `TTS_MODEL_DIR` environment variable to the absolute path:

```bash
export TTS_MODEL_DIR=/Users/yourname/workspace/tts-plugin/server/models
./target/release/tts_server "Test"
```

### Compilation Warnings

The project has some dead code warnings for unused voices and fields. These are safe to ignore:
- Unused voice variants (we only use one by default)
- Unused `gender` and `language` fields (reserved for future filtering)

### Slow First Run

The first compilation takes several minutes because:
- Rust compiles the entire dependency tree
- The `kokoros` library includes ONNX runtime

Subsequent builds are much faster (incremental compilation).

### macOS Library Path Issues

If you see dynamic library errors on macOS:

```bash
# Set library path
export DYLD_LIBRARY_PATH=/opt/homebrew/lib
./target/release/tts_server "Test"
```

## Dependencies

Key dependencies from [Cargo.toml](Cargo.toml):

**Core:**
- **kokoros**: TTS engine (from GitHub)
- **tokio**: Async runtime with full features
- **onnxruntime**: ML model inference (transitive dependency)

**HTTP Server:**
- **axum**: High-performance web framework
- **tower-http**: HTTP middleware (CORS, etc.)
- **serde** / **serde_json**: JSON serialization

**Performance:**
- **tokio-stream**: Streaming response support
- **hound**: WAV file manipulation and concatenation
- **deadpool**: Connection pooling infrastructure
- **async-trait**: Async trait support

**Utilities:**
- **uuid**: Unique file name generation
- **bytes**: Efficient byte buffer handling
- **tracing** / **tracing-subscriber**: Structured logging
- **futures**: Future combinators

## Performance

### Benchmarks

**Server Startup:**
- Single engine: ~1 second
- Pool of 3 engines: ~2.5 seconds
- Pool of 5 engines: ~4 seconds

**Request Processing:**
- **Short text** (50 chars): ~0.5-1 second
- **Medium text** (200 chars): ~1-2 seconds
- **Long text** (600 chars, chunked): ~2-3 seconds (parallel)
- **Long text** (600 chars, no chunk): ~4-6 seconds (sequential)

**Resource Usage:**
- Binary size: ~5 MB (without models)
- Model files: 337 MB
- Memory per engine: ~500 MB
- Pool of 3 engines: ~1.5 GB total memory

**Concurrent Processing:**
- Pool of 2: Up to 2 simultaneous requests
- Pool of 3: Up to 3 simultaneous requests
- Pool of 4: Up to 4 simultaneous requests
- Additional requests queue automatically

### Performance Tips

1. **Optimize pool size:**
   - Match pool size to expected concurrent load
   - Monitor `/stats` endpoint to track utilization
   - Increase pool size if `available_engines` is often 0

2. **Enable chunking for long texts:**
   - Default threshold: 500 characters
   - Automatic for most use cases
   - Disable only if you need precise control over audio generation

3. **Use streaming for real-time applications:**
   - Lower perceived latency
   - Better user experience for long content
   - Progressive playback support

4. **Production deployment:**
   - Use release build (`cargo build --release`)
   - Set appropriate `TTS_POOL_SIZE` based on traffic
   - Monitor memory usage and adjust pool size accordingly
   - Consider load balancing multiple instances for high traffic

## Future Plans

### AWS Lambda Deployment

This server can be deployed to AWS Lambda using container images:

```dockerfile
FROM public.ecr.aws/lambda/provided:al2023
COPY target/release/tts_server /var/runtime/bootstrap
COPY models /opt/models
ENV TTS_MODEL_DIR=/opt/models
ENV TTS_POOL_SIZE=2
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed Lambda deployment instructions.

### Planned Features

- **WebSocket support**: Real-time bidirectional audio streaming
- **Voice cloning**: Custom voice training and deployment
- **Audio effects**: Pitch control, echo, reverb, etc.
- **Batch processing**: Process multiple texts in one request
- **Caching layer**: Cache frequently requested phrases
- **Metrics**: Prometheus/Grafana integration
- **Docker**: Pre-built container images

## Contributing

### Code Structure

- [src/main.rs](src/main.rs) - Entry point, CLI and server mode initialization
- [src/server.rs](src/server.rs) - HTTP server, API endpoints, request handlers
- [src/chunking.rs](src/chunking.rs) - Text chunking algorithm for parallel processing
- [src/kokoro/mod.rs](src/kokoro/mod.rs) - TTS engine wrapper, pooling implementation
- [src/kokoro/voice_config.rs](src/kokoro/voice_config.rs) - Voice metadata and enums (54 voices)
- [src/kokoro/model_paths.rs](src/kokoro/model_paths.rs) - Model path resolution logic

### Adding New Features

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Add your license here]

## Support

For issues or questions:
1. Check this README first
2. Review [DEPLOYMENT.md](DEPLOYMENT.md) for deployment-specific questions
3. Open an issue in the repository

## Version History

- **v0.2.0** (Current) - Production-Ready HTTP Server
  - HTTP REST API with 5 endpoints (`/tts`, `/tts/stream`, `/voices`, `/health`, `/stats`)
  - Engine pooling for concurrent request handling
  - Intelligent text chunking with parallel processing (40-60% faster for long texts)
  - Streaming audio responses for progressive delivery
  - Real-time pool statistics and monitoring
  - Configurable pool size via `TTS_POOL_SIZE` environment variable
  - Full CORS support for web applications
  - Comprehensive error handling and logging

- **v0.1.0** - Initial CLI Implementation
  - Basic CLI interface
  - 54 voice support across 9 languages
  - Flexible model path resolution
  - AWS Lambda preparation
