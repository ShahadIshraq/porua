# Porua Server - Packaging Guide

## Quick Start

```bash
# Build and package in one command
./build_package.sh
```

Output: `dist/porua-server-v0.1.0-[platform]-[arch].tar.gz` and `.zip`

## What the Script Does

1. Builds release binary: `cargo build --release`
2. Creates package directory structure
3. Copies binary, models, docs, and scripts
4. Creates `.tar.gz` and `.zip` archives
5. Generates SHA256 checksums

## Package Contents

```
porua-server-v0.1.0-[platform]-[arch]/
├── bin/porua_server              # Binary (~29 MB)
├── espeak-ng-data/               # Phoneme data (~25 MB)
├── .env.example                  # Environment configuration template
├── api_keys.txt.example          # API keys template (optional)
├── download_models.sh            # Model download script
├── install.sh                    # Installation script
├── docs/README.md                # Full documentation
└── INSTALL.md                    # Installation guide and quick start
```

**Package size:** ~55 MB compressed (includes eSpeak-ng phoneme data)
**Models (downloaded separately):** ~337 MB
  - kokoro-v1.0.onnx (310 MB)
  - voices-v1.0.bin (27 MB)

## Model Download

Models are **NOT included** in release packages. They are downloaded separately during installation.

**Source:** https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

**Files:**
- `kokoro-v1.0.onnx` - 310 MB (TTS model)
- `voices-v1.0.bin` - 27 MB (voice style vectors)

**Download methods:**

1. **Automatic** (recommended):
   ```bash
   ./download_models.sh
   ```

2. **Manual**:
   ```bash
   mkdir -p models
   curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
   curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
   ```

## Platform Detection

The script automatically detects your platform:
- macOS Apple Silicon: `porua-server-v0.1.0-macos-arm64`
- macOS Intel: `porua-server-v0.1.0-macos-x86_64`
- Linux: `porua-server-v0.1.0-linux-x86_64`

## Script Options

The `build_package.sh` script accepts the following options:

```bash
--version VERSION      Version string (default: from Cargo.toml)
--platform PLATFORM    Target platform (macos/linux/windows, default: auto-detect)
--arch ARCH            Target architecture (arm64/x64, default: auto-detect)
--binary-path PATH     Path to pre-built binary (default: target/release/porua_server)
--binary-name NAME     Binary filename (default: porua_server or porua_server.exe)
--output-dir DIR       Output directory (default: dist)
--skip-build           Skip cargo build (useful for CI with pre-built binaries)
--help                 Show help message
```

## Prerequisites

**For local builds:**
- Rust 1.75+
- eSpeak-ng (for development/testing only: `brew install espeak-ng` on macOS)
- At least 80 MB free disk space (includes espeak-ng-data in package)

**For CI builds:**
- Pre-compiled binary for target platform
- curl or wget (for model downloads during installation)

**Note:** The eSpeak-ng phoneme data (~25 MB) is **included in the repository** at `packaging/espeak-ng-data/` and will be automatically bundled with distribution packages. No setup required.

## Usage Examples

### Local Development Build

```bash
# Build for current platform
cd server
./packaging/build_package.sh
```

### CI/GitHub Actions Build

```bash
# After cross-compiling with cargo
./packaging/build_package.sh \
  --version 0.1.0 \
  --platform linux \
  --arch x64 \
  --binary-path target/x86_64-unknown-linux-gnu/release/porua_server \
  --skip-build
```

### Windows Build

```bash
# Cross-compiled Windows binary
./packaging/build_package.sh \
  --version 0.1.0 \
  --platform windows \
  --arch x64 \
  --binary-path target/x86_64-pc-windows-msvc/release/porua_server.exe \
  --binary-name porua_server.exe \
  --skip-build
```

### Custom Output Directory

```bash
# Output to specific directory
./packaging/build_package.sh \
  --output-dir /tmp/releases
```

**Note:** Models are NOT included in packages. Users download them via `download_models.sh`.

## Configuration

The package includes `.env.example` with configuration templates for:

- **Server settings:** Port, host binding
- **TTS pool size:** Number of concurrent TTS engines
- **Authentication:** API key file path
- **Rate limiting:** Per-key and per-IP limits
- **Logging:** Log levels for different modules
- **Model paths:** Custom model locations (advanced)

**Setup:**

The `install.sh` script automatically creates a `.env` file with configured installation paths during installation. Users can then customize it:

```bash
# Edit configuration in installation directory
nano /usr/local/porua/.env  # or ~/.local/porua/.env

# Or override with environment variables
TTS_POOL_SIZE=4 PORT=8080 porua_server --server
```

**Key improvements:**
- `.env` file is auto-created with correct paths during installation
- Binary automatically loads `.env` via dotenvy library
- Intelligent path resolution finds models via symlink resolution
- No shell profile configuration needed

## Distribution

### GitHub Releases

```bash
# Tag version
git tag v0.1.0
git push origin v0.1.0

# Upload via gh CLI
gh release create v0.1.0 \
  dist/*.tar.gz \
  dist/*.zip \
  dist/*.sha256 \
  --title "Porua Server v0.1.0"
```

### Checksum Verification

Users verify package integrity:
```bash
shasum -a 256 -c porua-server-v0.1.0-macos-arm64.tar.gz.sha256
```

## Release Checklist

- [ ] Update version in `Cargo.toml`
- [ ] Test build: `cargo build --release`
- [ ] Run packaging script: `./build_package.sh`
- [ ] Test package installation
- [ ] Create git tag
- [ ] Upload to release platform
- [ ] Publish release notes

## Troubleshooting

**Missing eSpeak-ng Data Files**
  - **Problem:** Binary couldn't find eSpeak-ng phoneme data required for TTS processing
  - **Error:** `Failed to initialize eSpeak-ng. Try setting PIPER_ESPEAKNG_DATA_DIRECTORY`
  - **Solution:** The eSpeak-ng data is **always bundled** in distribution packages (located in `espeak-ng-data/` directory). The installer automatically:
    - Copies data to `$INSTALL_DIR/share/espeak-ng-data`
    - Configures `PIPER_ESPEAKNG_DATA_DIRECTORY` in `.env` file
    - The binary automatically loads this via dotenvy
  - **Manual override:** If needed, set in `.env`:
    ```bash
    echo "PIPER_ESPEAKNG_DATA_DIRECTORY=/custom/path" >> /usr/local/porua/.env
    ```
  - **Note:** During development, the binary can use either the system's eSpeak-ng installation (e.g., Homebrew on macOS) or the bundled data in `packaging/espeak-ng-data/`.

**Models not downloading:**
```bash
# Check internet connection
# Try manual download
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
```

**Build fails:**
```bash
cargo clean
cargo build --release
```

**Permission denied:**
```bash
chmod +x build_package.sh download_models.sh install.sh
```

## Cross-Platform Builds

Use GitHub Actions for multi-platform:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-13, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rust-lang/setup-rust-toolchain@v1
      - run: ./build_package.sh
      - uses: actions/upload-artifact@v3
        with:
          path: dist/*.tar.gz
```

## Version Management

Version is read from `Cargo.toml`:
```toml
[package]
version = "0.1.0"  # Update for new releases
```

Package name updates automatically: `porua-server-v{VERSION}-{PLATFORM}-{ARCH}`
