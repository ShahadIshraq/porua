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
├── download_models.sh            # Model download script
├── install.sh                    # Installation script
├── docs/README.md                # Full documentation
├── INSTALL.md                    # Installation guide
├── api_keys.txt.example          # API keys template
└── README.txt                    # Quick start
```

**Package size:** ~30 MB compressed
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

## Prerequisites

- Rust 1.75+
- At least 500 MB free disk space for models
- curl or wget (for downloading models)

## Manual Build

If you prefer manual control:

```bash
# 1. Build
cargo build --release

# 2. Create structure
mkdir -p dist/my-package/{bin,docs}

# 3. Copy files
cp target/release/porua_server dist/my-package/bin/
cp README.md dist/my-package/docs/
cp packaging/INSTALL.md dist/my-package/
cp packaging/install.sh dist/my-package/
cp packaging/download_models.sh dist/my-package/
chmod +x dist/my-package/install.sh dist/my-package/download_models.sh

# 4. Archive
cd dist
tar -czf my-package.tar.gz my-package/
```

**Note:** Models are NOT included in the package. Users download them via `download_models.sh`.

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
