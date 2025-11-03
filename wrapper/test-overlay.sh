#!/bin/bash
# Test script for overlay feature validation

set -e

echo "========================================="
echo "Porua Overlay Feature Test Suite"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function for test status
test_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Check if running on macOS
echo "Test 1: Platform Check"
if [ "$(uname)" == "Darwin" ]; then
    test_status 0 "Running on macOS"
else
    test_status 1 "Not running on macOS (overlay feature requires macOS 12.3+)"
    echo ""
    echo "Overlay feature is macOS-only in this prototype"
    exit 1
fi
echo ""

# Test 2: Check macOS version
echo "Test 2: macOS Version Check"
MACOS_VERSION=$(sw_vers -productVersion)
MAJOR_VERSION=$(echo $MACOS_VERSION | cut -d '.' -f 1)
MINOR_VERSION=$(echo $MACOS_VERSION | cut -d '.' -f 2)

echo "  Detected: macOS $MACOS_VERSION"

if [ "$MAJOR_VERSION" -ge 12 ] && [ "$MINOR_VERSION" -ge 3 ]; then
    test_status 0 "macOS version >= 12.3 (ScreenCaptureKit available)"
else
    test_status 1 "macOS version < 12.3 (ScreenCaptureKit not available)"
    echo "  Note: Will fall back to legacy screen capture"
fi
echo ""

# Test 3: Check Swift compiler
echo "Test 3: Swift Compiler Check"
if command -v swiftc &> /dev/null; then
    SWIFT_VERSION=$(swiftc --version | head -n 1)
    echo "  $SWIFT_VERSION"
    test_status 0 "Swift compiler found"
else
    test_status 1 "Swift compiler not found"
    echo "  Install Xcode Command Line Tools: xcode-select --install"
fi
echo ""

# Test 4: Check Xcode tools
echo "Test 4: Xcode Tools Check"
if xcode-select -p &> /dev/null; then
    XCODE_PATH=$(xcode-select -p)
    echo "  Xcode path: $XCODE_PATH"
    test_status 0 "Xcode Command Line Tools installed"
else
    test_status 1 "Xcode Command Line Tools not found"
    echo "  Install with: xcode-select --install"
fi
echo ""

# Test 5: Check if Swift source files exist
echo "Test 5: Swift Source Files Check"
if [ -f "src-tauri/swift-src/ScreenCapture.swift" ]; then
    LINES=$(wc -l < src-tauri/swift-src/ScreenCapture.swift)
    echo "  ScreenCapture.swift: $LINES lines"
    test_status 0 "Swift source files found"
else
    test_status 1 "Swift source files not found"
fi
echo ""

# Test 6: Check if build script exists
echo "Test 6: Build Script Check"
if [ -f "src-tauri/build-swift.sh" ] && [ -x "src-tauri/build-swift.sh" ]; then
    test_status 0 "Swift build script found and executable"
else
    test_status 1 "Swift build script not found or not executable"
fi
echo ""

# Test 7: Try to build Swift library
echo "Test 7: Swift Library Build Test"
cd src-tauri
if ./build-swift.sh > /dev/null 2>&1; then
    if [ -f "target/swift-build/libScreenCapture.a" ]; then
        SIZE=$(ls -lh target/swift-build/libScreenCapture.a | awk '{print $5}')
        echo "  Library size: $SIZE"
        test_status 0 "Swift library built successfully"
    else
        test_status 1 "Swift library build completed but file not found"
    fi
else
    test_status 1 "Swift library build failed"
    echo "  Run manually: cd src-tauri && ./build-swift.sh"
fi
cd ..
echo ""

# Test 8: Check Rust overlay module
echo "Test 8: Rust Overlay Module Check"
if [ -f "src-tauri/src/overlay/mod.rs" ]; then
    test_status 0 "Overlay module found"
else
    test_status 1 "Overlay module not found"
fi
echo ""

# Test 9: Check UI files
echo "Test 9: UI Files Check"
FILES_FOUND=0
FILES_MISSING=0

check_file() {
    if [ -f "$1" ]; then
        echo "  ✓ $1"
        ((FILES_FOUND++))
    else
        echo "  ✗ $1 (missing)"
        ((FILES_MISSING++))
    fi
}

check_file "src/selection.html"
check_file "src/selection.js"
check_file "src/overlay.html"
check_file "src/overlay.js"

if [ $FILES_MISSING -eq 0 ]; then
    test_status 0 "All UI files found ($FILES_FOUND/4)"
else
    test_status 1 "Missing $FILES_MISSING UI files"
fi
echo ""

# Test 10: Check screen recording permission
echo "Test 10: Screen Recording Permission Check"
# Note: This requires the app to be built and run at least once
echo "  This test requires building and running the app"
echo "  Permission can be checked in: System Preferences > Security & Privacy > Screen Recording"
echo "  ${YELLOW}⚠ SKIP${NC}: Manual verification required"
echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Build the wrapper: cd wrapper && npm run build"
    echo "  2. Run the app and grant screen recording permission"
    echo "  3. Test the overlay feature from the system tray"
    exit 0
else
    echo -e "${RED}Some tests failed ✗${NC}"
    echo ""
    echo "Please fix the failed tests before building"
    exit 1
fi
