#!/bin/bash

# Generate icon files for Tauri from the plugin icon
# Requires: ImageMagick (brew install imagemagick on macOS)

set -e

cd "$(dirname "$0")/.."

SOURCE_ICON="../plugin/icons/icon-128.png"
ICONS_DIR="src-tauri/icons"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    exit 1
fi

echo "Generating icons from $SOURCE_ICON..."

# Create icons directory if it doesn't exist
mkdir -p "$ICONS_DIR"

# Generate PNG sizes
echo "Generating PNG files..."
convert "$SOURCE_ICON" -resize 32x32 "$ICONS_DIR/32x32.png"
convert "$SOURCE_ICON" -resize 128x128 "$ICONS_DIR/128x128.png"
convert "$SOURCE_ICON" -resize 256x256 "$ICONS_DIR/128x128@2x.png"
cp "$ICONS_DIR/128x128.png" "$ICONS_DIR/icon.png"

# Generate macOS .icns
echo "Generating macOS .icns..."
if command -v iconutil &> /dev/null; then
    mkdir -p "$ICONS_DIR/icon.iconset"
    convert "$SOURCE_ICON" -resize 16x16 "$ICONS_DIR/icon.iconset/icon_16x16.png"
    convert "$SOURCE_ICON" -resize 32x32 "$ICONS_DIR/icon.iconset/icon_16x16@2x.png"
    convert "$SOURCE_ICON" -resize 32x32 "$ICONS_DIR/icon.iconset/icon_32x32.png"
    convert "$SOURCE_ICON" -resize 64x64 "$ICONS_DIR/icon.iconset/icon_32x32@2x.png"
    convert "$SOURCE_ICON" -resize 128x128 "$ICONS_DIR/icon.iconset/icon_128x128.png"
    convert "$SOURCE_ICON" -resize 256x256 "$ICONS_DIR/icon.iconset/icon_128x128@2x.png"
    convert "$SOURCE_ICON" -resize 256x256 "$ICONS_DIR/icon.iconset/icon_256x256.png"
    convert "$SOURCE_ICON" -resize 512x512 "$ICONS_DIR/icon.iconset/icon_256x256@2x.png"
    convert "$SOURCE_ICON" -resize 512x512 "$ICONS_DIR/icon.iconset/icon_512x512.png"
    convert "$SOURCE_ICON" -resize 1024x1024 "$ICONS_DIR/icon.iconset/icon_512x512@2x.png"
    iconutil -c icns "$ICONS_DIR/icon.iconset" -o "$ICONS_DIR/icon.icns"
    rm -rf "$ICONS_DIR/icon.iconset"
    echo "✓ Generated icon.icns"
else
    echo "⚠ iconutil not found, skipping .icns generation (macOS only)"
fi

# Generate Windows .ico
echo "Generating Windows .ico..."
if command -v convert &> /dev/null; then
    convert "$SOURCE_ICON" -define icon:auto-resize=256,128,96,64,48,32,16 "$ICONS_DIR/icon.ico"
    echo "✓ Generated icon.ico"
else
    echo "⚠ ImageMagick convert not found, skipping .ico generation"
    echo "  Install ImageMagick: brew install imagemagick (macOS)"
fi

echo ""
echo "✓ Icon generation complete!"
echo ""
echo "Generated files:"
ls -lh "$ICONS_DIR"
