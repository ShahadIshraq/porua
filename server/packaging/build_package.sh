#!/bin/bash

# Porua Server Packaging Script
# This script packages the server with scripts and creates a distributable archive
# Can be used for both local builds and CI/cross-compilation

set -e  # Exit on any error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Usage info
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --version VERSION      Version string (default: from Cargo.toml)"
    echo "  --platform PLATFORM    Target platform (macos/linux/windows, default: auto-detect)"
    echo "  --arch ARCH            Target architecture (arm64/x86_64/aarch64, default: auto-detect)"
    echo "  --binary-path PATH     Path to pre-built binary (default: target/release/porua_server)"
    echo "  --binary-name NAME     Binary filename (default: porua_server or porua_server.exe)"
    echo "  --output-dir DIR       Output directory (default: dist)"
    echo "  --skip-build           Skip cargo build (useful for CI with pre-built binaries)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Local build (auto-detect platform)"
    echo "  ./build_package.sh"
    echo ""
    echo "  # CI build with pre-compiled binary"
    echo "  ./build_package.sh --version 0.1.0 --platform macos --arch arm64 \\"
    echo "    --binary-path target/aarch64-apple-darwin/release/porua_server --skip-build"
    exit 1
}

# Parse command line arguments
VERSION=""
PLATFORM=""
ARCH=""
BINARY_PATH=""
BINARY_NAME=""
OUTPUT_DIR="dist"
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --arch)
            ARCH="$2"
            shift 2
            ;;
        --binary-path)
            BINARY_PATH="$2"
            shift 2
            ;;
        --binary-name)
            BINARY_NAME="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Porua Server Packaging Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Change to server root directory (in case script is run from packaging/)
cd "$(dirname "$0")/.."

# Get version from Cargo.toml if not provided
if [ -z "$VERSION" ]; then
    VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
fi
echo -e "${GREEN}Version:${NC} $VERSION"

# Auto-detect platform if not provided
if [ -z "$PLATFORM" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        PLATFORM="linux"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        PLATFORM="windows"
    else
        echo -e "${RED}Could not auto-detect platform. Please specify --platform${NC}"
        exit 1
    fi
fi

# Auto-detect architecture if not provided
if [ -z "$ARCH" ]; then
    ARCH=$(uname -m)
    # Normalize architecture names
    if [[ "$ARCH" == "aarch64" ]]; then
        ARCH="arm64"
    elif [[ "$ARCH" == "x86_64" ]] || [[ "$ARCH" == "AMD64" ]]; then
        ARCH="x64"
    fi
fi

echo -e "${GREEN}Platform:${NC} $PLATFORM-$ARCH"
echo ""

# Normalize OUTPUT_DIR path (remove trailing slashes and resolve relative paths)
OUTPUT_DIR=$(cd "$(dirname "$OUTPUT_DIR")" && pwd)/$(basename "$OUTPUT_DIR")
# Remove trailing slash if present
OUTPUT_DIR="${OUTPUT_DIR%/}"

# Package name
PACKAGE_NAME="porua-server-v${VERSION}-${PLATFORM}-${ARCH}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

# Determine binary name if not provided
if [ -z "$BINARY_NAME" ]; then
    if [ "$PLATFORM" = "windows" ]; then
        BINARY_NAME="porua_server.exe"
    else
        BINARY_NAME="porua_server"
    fi
fi

# Determine binary path if not provided
if [ -z "$BINARY_PATH" ]; then
    BINARY_PATH="target/release/${BINARY_NAME}"
fi

# Step 1: Build release binary (if not skipped)
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}Step 1/5:${NC} Building release binary..."
    cargo build --release
    echo -e "${GREEN}✓ Build complete${NC}"
    echo ""
else
    echo -e "${YELLOW}Step 1/5:${NC} Skipping build (using pre-built binary)..."
    echo ""
fi

# Step 2: Create package directory
echo -e "${YELLOW}Step 2/5:${NC} Creating package directory..."
# Only remove the specific package directory if it exists, not the entire output directory
if [ -d "$PACKAGE_DIR" ]; then
    rm -rf "$PACKAGE_DIR"
fi
# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"
mkdir -p "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/bin"
mkdir -p "$PACKAGE_DIR/docs"
echo -e "${GREEN}✓ Directory structure created${NC}"
echo ""

# Step 3: Copy binary
echo -e "${YELLOW}Step 3/5:${NC} Copying binary..."

# Verify binary exists
if [ ! -f "$BINARY_PATH" ]; then
    echo -e "${RED}✗ Binary not found at: $BINARY_PATH${NC}"
    exit 1
fi

cp "$BINARY_PATH" "$PACKAGE_DIR/bin/${BINARY_NAME}"
chmod +x "$PACKAGE_DIR/bin/${BINARY_NAME}"

# Get binary size
BINARY_SIZE=$(du -h "$PACKAGE_DIR/bin/${BINARY_NAME}" | cut -f1)
echo -e "${GREEN}✓ Binary copied${NC} (${BINARY_SIZE})"
echo ""

# Step 4: Copy documentation and scripts
echo -e "${YELLOW}Step 4/5:${NC} Copying documentation and installation scripts..."
cp README.md "$PACKAGE_DIR/docs/"
cp packaging/INSTALL.md "$PACKAGE_DIR/" 2>/dev/null || echo -e "${YELLOW}Warning: packaging/INSTALL.md not found${NC}"
cp packaging/install.sh "$PACKAGE_DIR/" 2>/dev/null || echo -e "${YELLOW}Warning: packaging/install.sh not found${NC}"
cp packaging/download_models.sh "$PACKAGE_DIR/" 2>/dev/null || echo -e "${YELLOW}Warning: packaging/download_models.sh not found${NC}"

# Make scripts executable
if [ -f "$PACKAGE_DIR/install.sh" ]; then
    chmod +x "$PACKAGE_DIR/install.sh"
fi
if [ -f "$PACKAGE_DIR/download_models.sh" ]; then
    chmod +x "$PACKAGE_DIR/download_models.sh"
fi

# Copy example configuration files
if [ -f "api_keys.txt.example" ]; then
    cp api_keys.txt.example "$PACKAGE_DIR/"
    echo -e "${GREEN}✓ api_keys.txt.example copied${NC}"
fi

if [ -f ".env.example" ]; then
    cp .env.example "$PACKAGE_DIR/"
    echo -e "${GREEN}✓ .env.example copied${NC}"
else
    echo -e "${YELLOW}Warning: .env.example not found${NC}"
fi

# Copy espeak-ng-data for phonemization (should always be in repository)
if [ -d "packaging/espeak-ng-data" ]; then
    echo -e "${YELLOW}Copying eSpeak-ng phoneme data...${NC}"
    cp -r packaging/espeak-ng-data "$PACKAGE_DIR/"
    ESPEAK_SIZE=$(du -sh "$PACKAGE_DIR/espeak-ng-data" | cut -f1)
    echo -e "${GREEN}✓ eSpeak-ng data copied${NC} (${ESPEAK_SIZE})"
else
    echo -e "${RED}✗ ERROR: packaging/espeak-ng-data not found!${NC}"
    echo -e "${RED}This is a critical error - eSpeak-ng data is required for TTS.${NC}"
    echo -e "${YELLOW}The data should be in the repository. Did you clone properly?${NC}"
    echo -e "${YELLOW}See server/packaging/README-ESPEAK.md for details.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Documentation copied${NC}"
echo ""

# Step 5: Create archives
echo -e "${YELLOW}Step 5/5:${NC} Creating distribution archives..."

cd "$OUTPUT_DIR"

# Create tar.gz
if command -v tar &> /dev/null; then
    tar -czf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"
    TAR_SIZE=$(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)
    echo -e "${GREEN}✓ Created ${PACKAGE_NAME}.tar.gz${NC} (${TAR_SIZE})"
fi

# Create zip
if command -v zip &> /dev/null; then
    zip -r -q "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}"
    ZIP_SIZE=$(du -h "${PACKAGE_NAME}.zip" | cut -f1)
    echo -e "${GREEN}✓ Created ${PACKAGE_NAME}.zip${NC} (${ZIP_SIZE})"
elif command -v 7z &> /dev/null; then
    7z a -r "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}" > /dev/null
    ZIP_SIZE=$(du -h "${PACKAGE_NAME}.zip" | cut -f1)
    echo -e "${GREEN}✓ Created ${PACKAGE_NAME}.zip${NC} (${ZIP_SIZE})"
fi

cd ..
echo ""

# Generate checksums
echo -e "${YELLOW}Generating checksums...${NC}"
cd "$OUTPUT_DIR"

# Use sha256sum on Linux, shasum on macOS, certutil on Windows
if command -v sha256sum &> /dev/null; then
    sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256" 2>/dev/null || true
    sha256sum "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.zip.sha256" 2>/dev/null || true
elif command -v shasum &> /dev/null; then
    shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256" 2>/dev/null || true
    shasum -a 256 "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.zip.sha256" 2>/dev/null || true
elif command -v certutil &> /dev/null; then
    certutil -hashfile "${PACKAGE_NAME}.tar.gz" SHA256 | findstr /v ":" | findstr /v "CertUtil" > "${PACKAGE_NAME}.tar.gz.sha256" 2>/dev/null || true
    certutil -hashfile "${PACKAGE_NAME}.zip" SHA256 | findstr /v ":" | findstr /v "CertUtil" > "${PACKAGE_NAME}.zip.sha256" 2>/dev/null || true
fi

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
if [ -f "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" ]; then
    TAR_SIZE=$(du -h "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" | cut -f1)
    echo -e "  📦 ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz (${TAR_SIZE})"
fi
if [ -f "${OUTPUT_DIR}/${PACKAGE_NAME}.zip" ]; then
    ZIP_SIZE=$(du -h "${OUTPUT_DIR}/${PACKAGE_NAME}.zip" | cut -f1)
    echo -e "  📦 ${OUTPUT_DIR}/${PACKAGE_NAME}.zip (${ZIP_SIZE})"
fi
echo ""
echo -e "${GREEN}Package contents:${NC}"
tree -L 2 "${OUTPUT_DIR}/${PACKAGE_NAME}" 2>/dev/null || ls -R "${OUTPUT_DIR}/${PACKAGE_NAME}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test the package: cd ${OUTPUT_DIR}/${PACKAGE_NAME} && ./download_models.sh && ./install.sh"
echo -e "  2. Distribute: Upload tar.gz or zip to your release platform"
echo -e "  3. Share checksums: Include .sha256 files for verification"
echo ""
