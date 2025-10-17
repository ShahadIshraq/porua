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
├── bin/porua_server            # Binary (~29 MB)
├── models/
│   ├── kokoro-v1.0.onnx        # Model (310 MB)
│   └── voices-v1.0.bin         # Voices (27 MB)
├── docs/README.md              # Full documentation
├── INSTALL.md                  # Installation guide
├── install.sh                  # Installation script
├── api_keys.txt.example        # API keys template
└── README.txt                  # Quick start
```

**Total size:** ~337 MB compressed, ~370 MB uncompressed

## Platform Detection

The script automatically detects your platform:
- macOS Apple Silicon: `porua-server-v0.1.0-macos-arm64`
- macOS Intel: `porua-server-v0.1.0-macos-x86_64`
- Linux: `porua-server-v0.1.0-linux-x86_64`

## Prerequisites

- Rust 1.75+
- Model files in `models/` directory
- At least 1 GB free disk space

If models are missing:
```bash
cd models/
python3 download_models.py
cd ..
```

## Manual Build

If you prefer manual control:

```bash
# 1. Build
cargo build --release

# 2. Create structure
mkdir -p dist/my-package/{bin,models,docs}

# 3. Copy files
cp target/release/porua_server dist/my-package/bin/
cp models/*.{onnx,bin} dist/my-package/models/
cp README.md dist/my-package/docs/
cp INSTALL.md install.sh dist/my-package/

# 4. Archive
cd dist
tar -czf my-package.tar.gz my-package/
```

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

**Models not found:**
```bash
cd models/ && python3 download_models.py
```

**Build fails:**
```bash
cargo clean
cargo build --release
```

**Package too large:**
- Binary: ~29 MB (use `strip target/release/porua_server` to reduce)
- Models: ~337 MB (cannot compress, required by ONNX)

**Permission denied:**
```bash
chmod +x build_package.sh
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
