# Porua

<img src="plugin/icons/icon-128.png" alt="Porua Icon" width="128" height="128">

**High-quality text-to-speech for the web using Kokoro TTS.**

Porua is a browser extension and server stack that converts text to natural-sounding speech with 28 English voices. Built with Rust and modern web technologies.

## Components

### [Browser Extension](plugin/README.md)
Modular Chrome/Firefox extension with:
- Paragraph-level playback with floating controls
- Real-time text highlighting synchronized with audio
- Streaming audio with phrase-level timing metadata
- Encrypted API key storage

### [TTS Server](server/README.md)
High-performance Rust HTTP server featuring:
- Kokoro v1.0 TTS engine with 28 voices (American & British)
- Engine pooling for concurrent requests
- Intelligent text chunking for long texts
- Streaming multipart responses with timing data
- REST API with health monitoring

## Quick Start

**1. Start the server:**
```bash
cd server
cargo build --release
./target/release/tts_server --server --port 3003
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
- Enter server URL: `http://localhost:3003`
- Select a voice and save

## Architecture

```
tts-plugin/
├── plugin/          # Browser extension (ES modules + esbuild)
│   ├── src/         # Modular source code
│   ├── dist/        # Bundled output
│   └── README.md    # Extension documentation
├── server/          # Rust TTS server (Actix Web + Kokoro)
│   ├── src/         # Server source
│   ├── models/      # TTS model files (310 MB + 27 MB)
│   └── README.md    # Server documentation
└── README.md        # This file
```

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

### Git Hooks Setup

This project includes pre-commit hooks to run tests before each commit:

```bash
# Install the hooks
./scripts/install-hooks.sh
```

The pre-commit hook will automatically run server tests before allowing commits. To skip the hook (not recommended):
```bash
git commit --no-verify
```

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
