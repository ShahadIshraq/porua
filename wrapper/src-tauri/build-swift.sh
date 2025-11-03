#!/bin/bash
# Build script for Swift library compilation

set -e

echo "Building Swift screen capture library..."

# Paths
SWIFT_SRC_DIR="swift-src"
BUILD_DIR="target/swift-build"
OUTPUT_LIB="libScreenCapture.a"

# Create build directory
mkdir -p "$BUILD_DIR"

# Compile Swift code
if [ "$(uname)" == "Darwin" ]; then
    echo "Compiling Swift source files..."

    # Compile Swift to object file
    swiftc -c \
        -sdk "$(xcrun --show-sdk-path)" \
        -target "$(uname -m)-apple-macosx12.0" \
        -emit-object \
        -emit-module \
        -module-name ScreenCapture \
        -o "$BUILD_DIR/ScreenCapture.o" \
        "$SWIFT_SRC_DIR/ScreenCapture.swift"

    echo "Creating static library..."

    # Create static library from object file
    ar rcs "$BUILD_DIR/$OUTPUT_LIB" "$BUILD_DIR/ScreenCapture.o"

    # Verify library was created
    if [ -f "$BUILD_DIR/$OUTPUT_LIB" ]; then
        echo "✓ Swift library built successfully: $BUILD_DIR/$OUTPUT_LIB"
        ls -lh "$BUILD_DIR/$OUTPUT_LIB"
    else
        echo "✗ Failed to build Swift library"
        exit 1
    fi
else
    echo "⚠ Swift compilation is only supported on macOS"
    echo "  Creating dummy library for non-macOS builds..."
    touch "$BUILD_DIR/$OUTPUT_LIB"
fi

echo "Swift build complete"
