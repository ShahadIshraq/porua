# Porua - পড়ুয়া

<img src="plugin/icons/icon-128.png" alt="Porua Icon" width="128" height="128">

**High-quality text-to-speech for the web using Kokoro TTS.**

Porua is a browser extension and server stack that converts text to natural-sounding speech with 28 English voices. Built with Rust and modern web technologies.

## Demo

https://github.com/user-attachments/assets/9b16c19b-1334-4e83-b6ef-d4c4ddf920b4


## Components

### [Desktop Application](wrapper/README.md)
Menu bar/system tray app for managing the TTS server:
- One-click installation with automatic model downloads
- Start/Stop server control
- Real-time status updates
- Built with Tauri (~60MB installer)

### [Browser Extension](plugin/README.md)
Modular Chrome/Firefox extension with:
- Paragraph-level playback with floating controls
- Real-time text highlighting synchronized with audio
- Streaming audio with phrase-level timing metadata
- Encrypted API key storage

**Install:**
- [Chrome Web Store](https://chromewebstore.google.com/detail/porua/ggdmgcopgoceppjdnkhmnfgefbbaahia)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/porua/)

### [TTS Server](server/README.md)
High-performance Rust HTTP server featuring:
- Kokoro v1.0 TTS engine with 28 voices (American & British)
- Engine pooling for concurrent requests
- Intelligent text chunking for long texts
- Streaming multipart responses with timing data
- REST API with health monitoring

## Model Attribution

Porua uses the **Kokoro-82M** TTS model, an open-source, high-quality text-to-speech model:

- **Model:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad
- **ONNX Version:** [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)
- **License:** Apache 2.0
- **Parameters:** 82M
- **Quality:** Comparable to much larger models, optimized for real-time generation

The server automatically downloads model files from the official source during installation:
- `kokoro-v1.0.onnx` (310 MB) - TTS model weights
- `voices-v1.0.bin` (27 MB) - Voice style vectors for 28 English voices

**Source:** https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

## Quick Start

### Option A: Using the Wrapper Application (Easiest)

**Coming Soon:** Pre-built installers for macOS and Windows.

For now, build from source:

```bash
# 1. Build the server first
cd server
cargo build --release

# 2. Build and run the wrapper
cd ../wrapper
npm install
npm run dev
```

The wrapper will:
- Automatically install the server and download models (~337 MB, first run only)
- Start the server on port 3000
- Show a menu bar icon for server control

Then install the browser extension (see Option B, step 2-3).

### Option B: Manual Setup

**Prerequisites:** Building from source requires system dependencies. See [Server Prerequisites](server/README.md#prerequisites) for details.

**1. Start the server:**
```bash
cd server
cargo build --release
./target/release/porua_server --server --port 3000
```

**2. Build the extension:**
```bash
cd plugin
npm install
npm run build
```

**3. Load in browser:**
- Chrome: `chrome://extensions` → Load unpacked → select `plugin/` directory
- Firefox: `about:debugging` → Load Temporary Add-on → select `plugin/manifest.json`

**4. Configure:**
- Click the extension icon
- Enter server URL: `http://localhost:3000`
- Select a voice and save

## Architecture

```
porua/
├── wrapper/         # Desktop wrapper app (Tauri + Rust)
│   ├── src/         # Minimal frontend (HTML)
│   ├── src-tauri/   # Rust backend
│   │   ├── src/     # System tray, installer, server manager
│   │   └── build.rs # Bundles server binary + resources
│   └── README.md    # Wrapper documentation
├── plugin/          # Browser extension (ES modules + esbuild)
│   ├── src/         # Modular source code
│   ├── dist/        # Bundled output
│   └── README.md    # Extension documentation
├── server/          # Rust TTS server (Actix Web + Kokoro)
│   ├── src/         # Server source
│   ├── packaging/   # Build and installation scripts
│   │   ├── download_models.sh  # Download TTS models
│   │   └── install.sh          # Installation script
│   └── README.md    # Server documentation
└── README.md        # This file
```

**Note:** The `server/models/` directory is NOT included in the repository or releases. Models are downloaded during installation.

## Features

- **Natural Speech**: Kokoro v1.0 model with 28 high-quality voices
- **Performance**: Engine pooling, parallel chunking, streaming delivery
- **Synchronization**: Phrase-level text highlighting with audio playback
- **Security**: Web Crypto API encryption for API keys
- **Modern**: ES modules, Rust, clean architecture

## Development

See component READMEs for detailed instructions:
- [Plugin Development](plugin/README.md)
- [Server Development](server/README.md)

### Git Hooks

Pre-commit hooks run automatically via `.githooks/`:
- Validate plugin version consistency
- Check server code formatting
- Run server tests

Skip with `git commit --no-verify` (not recommended).

### Version Management

To create a new release:

1. Update version in `server/Cargo.toml`
2. Validate the version:
   ```bash
   ./scripts/validate-version.sh 1.0.0
   ```
3. Create and push the tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

GitHub Actions will automatically build binaries for all platforms and create a release.

## License

MIT
