#!/bin/bash

# TTS Server Installation Script
# Automated installation of TTS Server binary and models

set -e  # Exit on any error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   TTS Server Installation Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root (for system-wide installation)
if [ "$EUID" -eq 0 ]; then
    INSTALL_MODE="system"
    INSTALL_DIR="/usr/local/tts-server"
    BIN_LINK="/usr/local/bin/tts_server"
else
    echo -e "${YELLOW}Not running as root. Choose installation mode:${NC}"
    echo "  1) System-wide installation (requires sudo)"
    echo "  2) User-specific installation (no sudo required)"
    read -p "Enter choice [1-2]: " choice

    case $choice in
        1)
            INSTALL_MODE="system"
            INSTALL_DIR="/usr/local/tts-server"
            BIN_LINK="/usr/local/bin/tts_server"
            NEEDS_SUDO=true
            ;;
        2)
            INSTALL_MODE="user"
            INSTALL_DIR="$HOME/.local/tts-server"
            BIN_LINK="$HOME/.local/bin/tts_server"
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
if [ ! -f "bin/tts_server" ]; then
    echo -e "${RED}✗ Binary not found. Are you in the correct directory?${NC}"
    echo -e "${YELLOW}Please run this script from the extracted package directory.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Package structure verified${NC}"

# Check if models exist
if [ ! -f "models/kokoro-v1.0.onnx" ] || [ ! -f "models/voices-v1.0.bin" ]; then
    echo -e "${RED}✗ Model files not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Model files found${NC}"
echo ""

# Step 2: Create directories
echo -e "${YELLOW}Step 2/7:${NC} Creating installation directories..."
run_cmd mkdir -p "$INSTALL_DIR/bin"
run_cmd mkdir -p "$INSTALL_DIR/models"

if [ "$INSTALL_MODE" = "user" ]; then
    mkdir -p "$HOME/.local/bin"
fi

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Step 3: Copy binary
echo -e "${YELLOW}Step 3/7:${NC} Installing binary..."
run_cmd cp bin/tts_server "$INSTALL_DIR/bin/"
run_cmd chmod +x "$INSTALL_DIR/bin/tts_server"

BINARY_SIZE=$(du -h "$INSTALL_DIR/bin/tts_server" | cut -f1)
echo -e "${GREEN}✓ Binary installed${NC} (${BINARY_SIZE})"
echo ""

# Step 4: Copy models
echo -e "${YELLOW}Step 4/7:${NC} Installing model files..."
run_cmd cp models/kokoro-v1.0.onnx "$INSTALL_DIR/models/"
run_cmd cp models/voices-v1.0.bin "$INSTALL_DIR/models/"

MODEL_SIZE=$(du -h "$INSTALL_DIR/models/kokoro-v1.0.onnx" | cut -f1)
VOICES_SIZE=$(du -h "$INSTALL_DIR/models/voices-v1.0.bin" | cut -f1)
echo -e "${GREEN}✓ Models installed${NC}"
echo -e "  - kokoro-v1.0.onnx: ${MODEL_SIZE}"
echo -e "  - voices-v1.0.bin: ${VOICES_SIZE}"
echo ""

# Step 5: Copy optional files
echo -e "${YELLOW}Step 5/7:${NC} Installing documentation and examples..."
if [ -f "api_keys.txt.example" ]; then
    run_cmd cp api_keys.txt.example "$INSTALL_DIR/"
    echo -e "${GREEN}✓ API keys example copied${NC}"
fi
echo ""

# Step 6: Create symlink
echo -e "${YELLOW}Step 6/7:${NC} Creating binary symlink..."
run_cmd ln -sf "$INSTALL_DIR/bin/tts_server" "$BIN_LINK"
echo -e "${GREEN}✓ Symlink created: $BIN_LINK${NC}"
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

# Check if already configured
if grep -q "TTS_MODEL_DIR" "$SHELL_RC" 2>/dev/null; then
    echo -e "${YELLOW}! Environment already configured in $SHELL_RC${NC}"
else
    echo ""
    echo -e "${BLUE}Would you like to add TTS_MODEL_DIR to your shell profile? [y/N]${NC}"
    read -p "> " add_to_profile

    if [[ "$add_to_profile" =~ ^[Yy]$ ]]; then
        echo "" >> "$SHELL_RC"
        echo "# TTS Server configuration" >> "$SHELL_RC"
        echo "export TTS_MODEL_DIR=\"$INSTALL_DIR/models\"" >> "$SHELL_RC"
        echo "export TTS_POOL_SIZE=2  # Adjust based on your needs" >> "$SHELL_RC"
        echo "" >> "$SHELL_RC"
        echo -e "${GREEN}✓ Environment variables added to $SHELL_RC${NC}"
        echo -e "${YELLOW}Run: source $SHELL_RC${NC}"
    else
        echo -e "${YELLOW}! Skipped. You'll need to set TTS_MODEL_DIR manually:${NC}"
        echo -e "  export TTS_MODEL_DIR=\"$INSTALL_DIR/models\""
    fi
fi

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
echo -e "  Binary:      $INSTALL_DIR/bin/tts_server"
echo -e "  Models:      $INSTALL_DIR/models/"
echo -e "  Symlink:     $BIN_LINK"
echo -e "  Total size:  $(du -sh "$INSTALL_DIR" | cut -f1)"
echo ""

# Verification
echo -e "${YELLOW}Verifying installation...${NC}"

# Set temporary environment for verification
export TTS_MODEL_DIR="$INSTALL_DIR/models"

# Test if binary is accessible
if command -v tts_server &> /dev/null; then
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
echo -e "${YELLOW}1. Test CLI mode:${NC}"
echo -e "   TTS_MODEL_DIR=\"$INSTALL_DIR/models\" tts_server \"Hello world!\""
echo ""
echo -e "${YELLOW}2. Start HTTP server:${NC}"
echo -e "   TTS_MODEL_DIR=\"$INSTALL_DIR/models\" tts_server --server --port 3000"
echo ""
echo -e "${YELLOW}3. Test API:${NC}"
echo -e "   curl -X POST http://localhost:3000/tts \\"
echo -e "     -H \"Content-Type: application/json\" \\"
echo -e "     -d '{\"text\": \"Hello!\", \"voice\": \"bf_lily\"}' \\"
echo -e "     --output test.wav"
echo ""
echo -e "${YELLOW}4. Full documentation:${NC}"
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

    # Run test
    if TTS_MODEL_DIR="$INSTALL_DIR/models" "$BIN_LINK" "Installation test successful!" 2>&1 | grep -q "Speech saved"; then
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

echo -e "${GREEN}Installation complete! Enjoy using TTS Server.${NC}"
echo ""
