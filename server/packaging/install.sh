#!/bin/bash

# Porua Server Installation Script
# Automated installation of Porua Server binary and models

set -e  # Exit on any error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Porua Server Installation Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root (for system-wide installation)
if [ "$EUID" -eq 0 ]; then
    INSTALL_MODE="system"
    INSTALL_DIR="/usr/local/porua"
    BIN_LINK="/usr/local/bin/porua_server"
else
    echo -e "${YELLOW}Not running as root. Choose installation mode:${NC}"
    echo "  1) System-wide installation (requires sudo)"
    echo "  2) User-specific installation (no sudo required)"
    read -p "Enter choice [1-2]: " choice

    case $choice in
        1)
            INSTALL_MODE="system"
            INSTALL_DIR="/usr/local/porua"
            BIN_LINK="/usr/local/bin/porua_server"
            NEEDS_SUDO=true
            ;;
        2)
            INSTALL_MODE="user"
            INSTALL_DIR="$HOME/.local/porua"
            BIN_LINK="$HOME/.local/bin/porua_server"
            NEEDS_SUDO=false
            ;;
        *)
            echo -e "${RED}Invalid choice. Exiting.${NC}"
            exit 1
            ;;
    esac
fi

echo ""
echo -e "${GREEN}Installation mode:${NC} $INSTALL_MODE"
echo -e "${GREEN}Install directory:${NC} $INSTALL_DIR"
echo ""

# Function to run command with or without sudo
run_cmd() {
    if [ "$NEEDS_SUDO" = true ]; then
        sudo "$@"
    else
        "$@"
    fi
}

# Step 1: System check
echo -e "${YELLOW}Step 1/7:${NC} Checking system compatibility..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
    ARCH=$(uname -m)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
    ARCH=$(uname -m)
else
    echo -e "${RED}✗ Unsupported operating system: $OSTYPE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ System: $OS ($ARCH)${NC}"

# Check available disk space
AVAILABLE_SPACE=$(df -k . | awk 'NR==2 {print $4}')
REQUIRED_SPACE=409600  # 400 MB in KB
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
    echo -e "${RED}✗ Insufficient disk space. Required: 400 MB, Available: $((AVAILABLE_SPACE / 1024)) MB${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Sufficient disk space available${NC}"

# Check if binary exists in package
if [ ! -f "bin/porua_server" ]; then
    echo -e "${RED}✗ Binary not found. Are you in the correct directory?${NC}"
    echo -e "${YELLOW}Please run this script from the extracted package directory.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Package structure verified${NC}"

echo ""

# Step 2: Create directories
echo -e "${YELLOW}Step 2/7:${NC} Creating installation directories..."
run_cmd mkdir -p "$INSTALL_DIR/bin"
run_cmd mkdir -p "$INSTALL_DIR/models"
run_cmd mkdir -p "$INSTALL_DIR/share"

if [ "$INSTALL_MODE" = "user" ]; then
    mkdir -p "$HOME/.local/bin"
fi

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Step 3: Copy binary and dependencies
echo -e "${YELLOW}Step 3/7:${NC} Installing binary and dependencies..."
run_cmd cp bin/porua_server "$INSTALL_DIR/bin/"
run_cmd chmod +x "$INSTALL_DIR/bin/porua_server"

# Remove macOS quarantine attribute (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Removing macOS quarantine attribute...${NC}"
    if run_cmd xattr -d com.apple.quarantine "$INSTALL_DIR/bin/porua_server" 2>/dev/null; then
        echo -e "${GREEN}✓ macOS quarantine attribute removed${NC}"
    else
        # Attribute may not exist if downloaded via curl/wget
        echo -e "${BLUE}  (no quarantine attribute found - this is normal)${NC}"
    fi
fi

BINARY_SIZE=$(du -h "$INSTALL_DIR/bin/porua_server" | cut -f1)
echo -e "${GREEN}✓ Binary installed${NC} (${BINARY_SIZE})"

# Copy espeak-ng-data (should always be present in packages)
if [ -d "espeak-ng-data" ]; then
    echo -e "${YELLOW}Installing eSpeak-ng phoneme data...${NC}"
    run_cmd cp -r espeak-ng-data "$INSTALL_DIR/share/"
    ESPEAK_SIZE=$(du -sh "$INSTALL_DIR/share/espeak-ng-data" | cut -f1)
    echo -e "${GREEN}✓ eSpeak-ng data installed${NC} (${ESPEAK_SIZE})"
else
    echo -e "${RED}✗ Error: espeak-ng-data directory not found in package${NC}"
    echo -e "${RED}This is a packaging error - eSpeak-ng data should always be bundled.${NC}"
    echo -e "${YELLOW}Please re-download the package or report this issue.${NC}"
    exit 1
fi

# Copy voice samples (should always be present in packages)
if [ -d "samples" ]; then
    echo -e "${YELLOW}Installing voice samples...${NC}"
    run_cmd cp -r samples "$INSTALL_DIR/"
    SAMPLES_SIZE=$(du -sh "$INSTALL_DIR/samples" | cut -f1)
    echo -e "${GREEN}✓ Voice samples installed${NC} (${SAMPLES_SIZE})"
    echo -e "${BLUE}  Samples will be available at /samples/{voice_id}.wav endpoint${NC}"
else
    echo -e "${YELLOW}Warning: samples directory not found in package${NC}"
    echo -e "${YELLOW}Voice preview functionality will not be available.${NC}"
    echo -e "${YELLOW}This may be expected for older package versions.${NC}"
fi

echo ""

# Step 4: Download models
echo -e "${YELLOW}Step 4/7:${NC} Downloading TTS model files..."
echo -e "${BLUE}Source: github.com/thewh1teagle/kokoro-onnx${NC}"
echo -e "${BLUE}Total size: ~337 MB (kokoro-v1.0.onnx + voices-v1.0.bin)${NC}"
echo ""

# Check if download script exists
if [ ! -f "./download_models.sh" ]; then
    echo -e "${RED}✗ download_models.sh not found${NC}"
    echo -e "${YELLOW}Manual download required:${NC}"
    echo -e "  mkdir -p \"$INSTALL_DIR/models\""
    echo -e "  curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o \"$INSTALL_DIR/models/kokoro-v1.0.onnx\""
    echo -e "  curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o \"$INSTALL_DIR/models/voices-v1.0.bin\""
    echo ""

    read -p "Continue without models? [y/N] " continue_without
    if [[ ! "$continue_without" =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    # Run download script
    MODEL_DIR="$INSTALL_DIR/models" ./download_models.sh

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Model download failed${NC}"
        echo -e "${YELLOW}You can download models later by running:${NC}"
        echo -e "  MODEL_DIR=\"$INSTALL_DIR/models\" ./download_models.sh"
        echo ""

        read -p "Continue without models? [y/N] " continue_without
        if [[ ! "$continue_without" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Models downloaded successfully${NC}"

        # Verify and show sizes
        if [ -f "$INSTALL_DIR/models/kokoro-v1.0.onnx" ] && [ -f "$INSTALL_DIR/models/voices-v1.0.bin" ]; then
            MODEL_SIZE=$(du -h "$INSTALL_DIR/models/kokoro-v1.0.onnx" | cut -f1)
            VOICES_SIZE=$(du -h "$INSTALL_DIR/models/voices-v1.0.bin" | cut -f1)
            echo -e "  - kokoro-v1.0.onnx: ${MODEL_SIZE}"
            echo -e "  - voices-v1.0.bin: ${VOICES_SIZE}"
        fi
    fi
fi
echo ""

# Step 5: Copy optional files
echo -e "${YELLOW}Step 5/7:${NC} Installing documentation and configuration templates..."

# Copy .env.example
if [ -f ".env.example" ]; then
    run_cmd cp .env.example "$INSTALL_DIR/"
    echo -e "${GREEN}✓ .env.example copied${NC}"

    # Create .env from template with configured paths
    if [ ! -f "$INSTALL_DIR/.env" ]; then
        echo ""
        echo -e "${BLUE}Creating .env with installation-specific paths...${NC}"

        # Create .env with properly configured paths
        cat > /tmp/porua_env_tmp << EOF
# Porua Server Environment Configuration
# Generated by install.sh on $(date)

# TTS Model Directory
TTS_MODEL_DIR=$INSTALL_DIR/models

# TTS Pool Size (number of concurrent TTS engines)
TTS_POOL_SIZE=2

# eSpeak-ng Data Directory (required for text processing)
# Note: Must point to directory that CONTAINS espeak-ng-data subdirectory
PIPER_ESPEAKNG_DATA_DIRECTORY=$INSTALL_DIR/share/

# Log Level (error, warn, info, debug, trace)
RUST_LOG=info

# Additional configuration options
# See .env.example for all available options
EOF

        run_cmd cp /tmp/porua_env_tmp "$INSTALL_DIR/.env"
        rm /tmp/porua_env_tmp

        echo -e "${GREEN}✓ .env created with configured paths${NC}"
        echo -e "${YELLOW}  Location: $INSTALL_DIR/.env${NC}"
        echo -e "${YELLOW}  See .env.example for additional configuration options${NC}"
    fi
fi

# Copy api_keys.txt.example
if [ -f "api_keys.txt.example" ]; then
    run_cmd cp api_keys.txt.example "$INSTALL_DIR/"
    echo -e "${GREEN}✓ api_keys.txt.example copied${NC}"
fi

echo ""

# Step 6: Create symlink
echo -e "${YELLOW}Step 6/7:${NC} Creating binary symlink..."

# Create symlink to binary
run_cmd ln -sf "$INSTALL_DIR/bin/porua_server" "$BIN_LINK"
echo -e "${GREEN}✓ Binary symlink created: $BIN_LINK${NC}"
echo -e "${YELLOW}  The binary automatically finds models via symlink resolution${NC}"
echo -e "${YELLOW}  and loads settings from $INSTALL_DIR/.env${NC}"
echo ""

# Step 7: Configure environment
echo -e "${YELLOW}Step 7/7:${NC} Configuring environment..."

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.profile"
fi

echo -e "${BLUE}Environment configuration:${NC}"
echo -e "  All settings are stored in: $INSTALL_DIR/.env"
echo -e "  The binary automatically loads this file via dotenvy"
echo -e "  Symlink resolution allows running from any directory: $BIN_LINK"
echo ""
echo -e "${GREEN}✓ No shell profile configuration needed!${NC}"
echo -e "  The binary uses smart path resolution to find:"
echo -e "  - Models: $INSTALL_DIR/models"
echo -e "  - eSpeak-ng data: $INSTALL_DIR/share/espeak-ng-data"
echo ""

# Add to PATH if user mode and not already there
if [ "$INSTALL_MODE" = "user" ]; then
    if ! grep -q "$HOME/.local/bin" "$SHELL_RC" 2>/dev/null; then
        echo ""
        echo -e "${BLUE}Would you like to add ~/.local/bin to your PATH? [y/N]${NC}"
        read -p "> " add_path

        if [[ "$add_path" =~ ^[Yy]$ ]]; then
            echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
            echo -e "${GREEN}✓ PATH updated in $SHELL_RC${NC}"
        fi
    fi
fi

echo ""

# Installation complete
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Installation completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Summary
echo -e "${GREEN}Installation summary:${NC}"
echo -e "  Binary:      $INSTALL_DIR/bin/porua_server"
echo -e "  Models:      $INSTALL_DIR/models/"
echo -e "  Symlink:     $BIN_LINK"
echo -e "  Total size:  $(du -sh "$INSTALL_DIR" | cut -f1)"
echo ""

# Verification
echo -e "${YELLOW}Verifying installation...${NC}"

# Set temporary environment for verification
export TTS_MODEL_DIR="$INSTALL_DIR/models"
export PIPER_ESPEAKNG_DATA_DIRECTORY="$INSTALL_DIR/share/"

# Test if binary is accessible
if command -v porua_server &> /dev/null; then
    echo -e "${GREEN}✓ Binary is in PATH${NC}"

    # Quick version check
    VERSION_OUTPUT=$("$BIN_LINK" --version 2>&1 || echo "unknown")
    echo -e "${GREEN}✓ Version: $VERSION_OUTPUT${NC}"
else
    echo -e "${YELLOW}! Binary not yet in PATH${NC}"
    echo -e "${YELLOW}  Run: export PATH=\"$INSTALL_DIR/bin:\$PATH\"${NC}"
    echo -e "${YELLOW}  Or source your shell profile: source $SHELL_RC${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Quick Start Guide${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}The binary automatically loads settings from:${NC}"
echo -e "  $INSTALL_DIR/.env"
echo ""
echo -e "${YELLOW}Configuration (optional):${NC}"
echo -e "   # Customize settings (see .env.example for all options)"
echo -e "   nano $INSTALL_DIR/.env"
echo ""
echo -e "${YELLOW}1. Test CLI mode:${NC}"
echo -e "   porua_server \"Hello world!\""
echo ""
echo -e "${YELLOW}2. Start HTTP server:${NC}"
echo -e "   porua_server --server --port 3000"
echo ""
echo -e "${YELLOW}3. Test API:${NC}"
echo -e "   curl -X POST http://localhost:3000/tts \\"
echo -e "     -H \"Content-Type: application/json\" \\"
echo -e "     -d '{\"text\": \"Hello!\", \"voice\": \"bf_lily\"}' \\"
echo -e "     --output test.wav"
echo ""
echo -e "${YELLOW}4. Test voice samples:${NC}"
echo -e "   # Voice sample previews are available at /samples/{voice_id}.wav"
echo -e "   curl http://localhost:3000/samples/bf_lily.wav --output bf_lily.wav"
echo ""
echo -e "${YELLOW}5. Advanced usage (override .env):${NC}"
echo -e "   # Override environment settings:"
echo -e "   TTS_MODEL_DIR=/custom/path porua_server \"Hello!\""
echo -e "   TTS_SAMPLES_DIR=/custom/samples porua_server --server"
echo ""
echo -e "${YELLOW}6. Full documentation:${NC}"
echo -e "   See INSTALL.md and docs/README.md"
echo ""

# Optional: test now
echo -e "${BLUE}Would you like to run a quick test now? [y/N]${NC}"
read -p "> " run_test

if [[ "$run_test" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Running test...${NC}"

    # Create temp directory for test
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"

    # Run test using binary
    if "$BIN_LINK" "Installation test successful!" 2>&1 | grep -q "Speech saved"; then
        echo -e "${GREEN}✓ Test passed! Audio saved to: ${TEST_DIR}/output.wav${NC}"

        # Offer to play audio
        if [[ "$OS" == "macOS" ]]; then
            echo -e "${BLUE}Would you like to play the audio? [y/N]${NC}"
            read -p "> " play_audio
            if [[ "$play_audio" =~ ^[Yy]$ ]]; then
                afplay output.wav
            fi
        fi
    else
        echo -e "${RED}✗ Test failed. Check the installation.${NC}"
    fi

    cd - > /dev/null
    echo ""
fi

echo -e "${GREEN}Installation complete! Enjoy using Porua Server.${NC}"
echo ""
