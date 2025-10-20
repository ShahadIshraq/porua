#!/bin/bash
# Download Kokoro TTS models from official sources
# Primary: thewh1teagle/kokoro-onnx GitHub releases

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Kokoro TTS Model Download${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Configuration
MODEL_VERSION="${MODEL_VERSION:-v1.0}"
RELEASE_TAG="model-files-v1.0"
BASE_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/${RELEASE_TAG}"
MODEL_DIR="${MODEL_DIR:-./models}"

# File definitions (filename => expected_size_in_MB)
declare -A FILES=(
    ["kokoro-v1.0.onnx"]="310"
    ["voices-v1.0.bin"]="27"
)

# Create model directory
mkdir -p "$MODEL_DIR"

echo -e "${GREEN}Download location:${NC} $MODEL_DIR"
echo -e "${GREEN}Source:${NC} github.com/thewh1teagle/kokoro-onnx"
echo -e "${GREEN}Total download size:${NC} ~337 MB"
echo ""

# Function to download with resume support
download_file() {
    local filename="$1"
    local expected_size_mb="$2"
    local url="${BASE_URL}/${filename}"
    local output_path="${MODEL_DIR}/${filename}"

    # Check if file exists and has reasonable size
    if [ -f "$output_path" ]; then
        local file_size=$(du -m "$output_path" 2>/dev/null | cut -f1)
        if [ "$file_size" -ge "$((expected_size_mb - 5))" ]; then
            echo -e "${GREEN}✓ ${filename} already exists (${file_size} MB)${NC}"
            return 0
        else
            echo -e "${YELLOW}! ${filename} exists but incomplete, re-downloading...${NC}"
            rm "$output_path"
        fi
    fi

    echo -e "${YELLOW}Downloading ${filename} (~${expected_size_mb} MB)...${NC}"

    # Download with curl (resume support, progress bar)
    if command -v curl &> /dev/null; then
        if curl -L -C - --progress-bar "$url" -o "$output_path"; then
            echo -e "${GREEN}✓ Downloaded ${filename}${NC}"
            return 0
        else
            echo -e "${RED}✗ Failed to download ${filename}${NC}"
            return 1
        fi
    # Fallback to wget
    elif command -v wget &> /dev/null; then
        if wget -c --show-progress "$url" -O "$output_path"; then
            echo -e "${GREEN}✓ Downloaded ${filename}${NC}"
            return 0
        else
            echo -e "${RED}✗ Failed to download ${filename}${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ Neither curl nor wget found${NC}"
        return 1
    fi
}

# Download all files
FAILED=0
for filename in "${!FILES[@]}"; do
    if ! download_file "$filename" "${FILES[$filename]}"; then
        FAILED=1
    fi
    echo ""
done

# Summary
if [ $FAILED -eq 0 ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}✓ All models downloaded successfully!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${GREEN}Downloaded files:${NC}"
    ls -lh "$MODEL_DIR"
    echo ""
    exit 0
else
    echo -e "${BLUE}========================================${NC}"
    echo -e "${RED}✗ Download failed${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Manual download instructions:${NC}"
    echo -e "  mkdir -p $MODEL_DIR"
    for filename in "${!FILES[@]}"; do
        echo -e "  curl -L '${BASE_URL}/${filename}' -o '${MODEL_DIR}/${filename}'"
    done
    echo ""
    echo -e "${YELLOW}Alternative sources:${NC}"
    echo -e "  - https://huggingface.co/onnx-community/Kokoro-82M-ONNX"
    echo -e "  - https://huggingface.co/hexgrad/Kokoro-82M"
    echo ""
    exit 1
fi
