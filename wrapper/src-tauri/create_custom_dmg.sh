#!/bin/bash

# Script to create a custom DMG with background image and icon positioning
# Usage: ./create_custom_dmg.sh <path-to-app-bundle> <output-dmg-name> <version>

set -e

APP_BUNDLE="$1"
OUTPUT_DMG="$2"
VERSION="${3:-0.1.0}"

if [ -z "$APP_BUNDLE" ] || [ -z "$OUTPUT_DMG" ]; then
    echo "Usage: $0 <path-to-app-bundle> <output-dmg-name> <version>"
    exit 1
fi

if [ ! -d "$APP_BUNDLE" ]; then
    echo "Error: App bundle not found at $APP_BUNDLE"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKGROUND_PNG="$SCRIPT_DIR/dmg-background.png"
BACKGROUND_2X_PNG="$SCRIPT_DIR/dmg-background@2x.png"

if [ ! -f "$BACKGROUND_PNG" ]; then
    echo "Error: Background image not found at $BACKGROUND_PNG"
    exit 1
fi

echo "Creating custom DMG..."
echo "  App bundle: $APP_BUNDLE"
echo "  Output DMG: $OUTPUT_DMG"
echo "  Background: $BACKGROUND_PNG"

# Create a temporary directory for DMG contents
TMP_DIR=$(mktemp -d)
trap "rm -rf '$TMP_DIR'" EXIT

# Copy the app bundle to temp directory
echo "Copying app bundle..."
cp -R "$APP_BUNDLE" "$TMP_DIR/"

# Create Applications symlink
echo "Creating Applications symlink..."
ln -s /Applications "$TMP_DIR/Applications"

# Create a temporary DMG to mount and customize
TMP_DMG="$TMP_DIR/temp.dmg"
FINAL_DMG="$OUTPUT_DMG"

# Calculate size needed (app bundle size + 50MB buffer)
APP_SIZE=$(du -sm "$APP_BUNDLE" | cut -f1)
DMG_SIZE=$((APP_SIZE + 50))

echo "Creating temporary DMG (${DMG_SIZE}MB)..."
hdiutil create -size ${DMG_SIZE}m -fs HFS+ -volname "Porua" "$TMP_DMG"

# Mount the temporary DMG
echo "Mounting temporary DMG..."
MOUNT_DIR=$(hdiutil attach -readwrite -noverify -noautoopen "$TMP_DMG" | grep Volumes | awk '{print $3}')

if [ -z "$MOUNT_DIR" ]; then
    echo "Error: Failed to mount temporary DMG"
    exit 1
fi

echo "Mounted at: $MOUNT_DIR"

# Copy app bundle to mounted DMG
echo "Copying app bundle to DMG..."
cp -R "$APP_BUNDLE" "$MOUNT_DIR/"

# Create Applications symlink in mounted DMG
echo "Creating Applications symlink in DMG..."
ln -s /Applications "$MOUNT_DIR/Applications"

# Copy background image
echo "Adding background image..."
mkdir -p "$MOUNT_DIR/.background"
cp "$BACKGROUND_PNG" "$MOUNT_DIR/.background/background.png"
if [ -f "$BACKGROUND_2X_PNG" ]; then
    cp "$BACKGROUND_2X_PNG" "$MOUNT_DIR/.background/background@2x.png"
fi

# Use AppleScript to set DMG appearance
echo "Configuring DMG window appearance..."
osascript <<EOF
tell application "Finder"
    tell disk "Porua"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {400, 100, 1060, 500}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 100
        set background picture of viewOptions to file ".background:background.png"
        set position of item "Porua.app" of container window to {180, 170}
        set position of item "Applications" of container window to {480, 170}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
EOF

# Wait a bit for Finder to finish
sleep 3

# Unmount the DMG
echo "Unmounting DMG..."
hdiutil detach "$MOUNT_DIR"

# Convert to compressed, read-only DMG
echo "Converting to final compressed DMG..."
rm -f "$FINAL_DMG"
hdiutil convert "$TMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$FINAL_DMG"

echo "✓ DMG created successfully: $FINAL_DMG"

# Print DMG info
DMG_SIZE_MB=$(du -h "$FINAL_DMG" | cut -f1)
echo "  Final size: $DMG_SIZE_MB"
