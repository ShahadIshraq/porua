#!/bin/bash

# Porua Server Packaging Script
# This script builds the server, packages it with models, and creates a distributable archive

set -e  # Exit on any error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Porua Server Packaging Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get version from Cargo.toml
VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo -e "${GREEN}Version:${NC} $VERSION"

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
    if [[ $(uname -m) == "arm64" ]]; then
        ARCH="arm64"
    else
        ARCH="x86_64"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
    ARCH=$(uname -m)
else
    echo -e "${RED}Unsupported platform: $OSTYPE${NC}"
    exit 1
fi

echo -e "${GREEN}Platform:${NC} $PLATFORM-$ARCH"
echo ""

# Package name
PACKAGE_NAME="porua-server-v${VERSION}-${PLATFORM}-${ARCH}"
PACKAGE_DIR="dist/${PACKAGE_NAME}"

# Change to server root directory (in case script is run from packaging/)
cd "$(dirname "$0")/.."

# Step 1: Clean and build release binary
echo -e "${YELLOW}Step 1/6:${NC} Building release binary..."
cargo build --release
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Step 2: Create package directory
echo -e "${YELLOW}Step 2/6:${NC} Creating package directory..."
rm -rf dist
mkdir -p "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/bin"
mkdir -p "$PACKAGE_DIR/models"
mkdir -p "$PACKAGE_DIR/docs"
echo -e "${GREEN}✓ Directory structure created${NC}"
echo ""

# Step 3: Copy binary
echo -e "${YELLOW}Step 3/6:${NC} Copying binary..."
cp target/release/porua_server "$PACKAGE_DIR/bin/"
chmod +x "$PACKAGE_DIR/bin/porua_server"

# Get binary size
BINARY_SIZE=$(du -h "$PACKAGE_DIR/bin/porua_server" | cut -f1)
echo -e "${GREEN}✓ Binary copied${NC} (${BINARY_SIZE})"
echo ""

# Step 4: Copy model files
echo -e "${YELLOW}Step 4/6:${NC} Copying model files..."
if [ -f "models/kokoro-v1.0.onnx" ] && [ -f "models/voices-v1.0.bin" ]; then
    cp models/kokoro-v1.0.onnx "$PACKAGE_DIR/models/"
    cp models/voices-v1.0.bin "$PACKAGE_DIR/models/"

    # Get model sizes
    MODEL_SIZE=$(du -h models/kokoro-v1.0.onnx | cut -f1)
    VOICES_SIZE=$(du -h models/voices-v1.0.bin | cut -f1)
    echo -e "${GREEN}✓ Models copied${NC}"
    echo -e "  - kokoro-v1.0.onnx: ${MODEL_SIZE}"
    echo -e "  - voices-v1.0.bin: ${VOICES_SIZE}"
else
    echo -e "${RED}✗ Model files not found in models/ directory${NC}"
    echo -e "${YELLOW}Please run models/download_models.py first${NC}"
    exit 1
fi
echo ""

# Step 5: Copy documentation and scripts
echo -e "${YELLOW}Step 5/6:${NC} Copying documentation and installation scripts..."
cp README.md "$PACKAGE_DIR/docs/"
cp packaging/INSTALL.md "$PACKAGE_DIR/" 2>/dev/null || echo -e "${YELLOW}Warning: packaging/INSTALL.md not found${NC}"
cp packaging/install.sh "$PACKAGE_DIR/" 2>/dev/null || echo -e "${YELLOW}Warning: packaging/install.sh not found${NC}"
if [ -f "packaging/install.sh" ]; then
    chmod +x "$PACKAGE_DIR/install.sh"
fi

# Copy example API key file if it exists
if [ -f "api_keys.txt.example" ]; then
    cp api_keys.txt.example "$PACKAGE_DIR/"
fi

# Create a simple README in the root
cat > "$PACKAGE_DIR/README.txt" << 'EOF'
Porua Server - Text-to-Speech HTTP Server
========================================

QUICK START:
Run ./install.sh for automatic installation, then:

  porua_server --server --port 3000
  curl -X POST http://localhost:3000/tts \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello world!", "voice": "bf_lily"}' \
    --output test.wav

PACKAGE CONTENTS:
bin/porua_server       - Binary executable
models/              - TTS model files
docs/README.md       - Full documentation
INSTALL.md           - Installation guide
install.sh           - Installation script

For details, see INSTALL.md or docs/README.md
EOF

echo -e "${GREEN}✓ Documentation copied${NC}"
echo ""

# Step 6: Create archives
echo -e "${YELLOW}Step 6/6:${NC} Creating distribution archives..."

# Create tar.gz
cd dist
tar -czf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"
TAR_SIZE=$(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)
echo -e "${GREEN}✓ Created ${PACKAGE_NAME}.tar.gz${NC} (${TAR_SIZE})"

# Create zip
zip -r -q "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}"
ZIP_SIZE=$(du -h "${PACKAGE_NAME}.zip" | cut -f1)
echo -e "${GREEN}✓ Created ${PACKAGE_NAME}.zip${NC} (${ZIP_SIZE})"

cd ..
echo ""

# Generate checksums
echo -e "${YELLOW}Generating checksums...${NC}"
cd dist
shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
shasum -a 256 "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.zip.sha256"
cd ..
echo -e "${GREEN}✓ Checksums generated${NC}"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Package created successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Package details:${NC}"
echo -e "  Name:     ${PACKAGE_NAME}"
echo -e "  Version:  ${VERSION}"
echo -e "  Platform: ${PLATFORM}-${ARCH}"
echo ""
echo -e "${GREEN}Distribution files:${NC}"
echo -e "  📦 dist/${PACKAGE_NAME}.tar.gz (${TAR_SIZE})"
echo -e "  📦 dist/${PACKAGE_NAME}.zip (${ZIP_SIZE})"
echo ""
echo -e "${GREEN}Package contents:${NC}"
tree -L 2 "dist/${PACKAGE_NAME}" 2>/dev/null || ls -R "dist/${PACKAGE_NAME}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test the package: cd dist/${PACKAGE_NAME} && ./install.sh"
echo -e "  2. Distribute: Upload tar.gz or zip to your release platform"
echo -e "  3. Share checksums: Include .sha256 files for verification"
echo ""
