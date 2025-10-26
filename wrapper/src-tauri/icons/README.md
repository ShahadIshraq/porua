# Icons

This directory should contain the following icon files for the Tauri application:

## Required Files

- `32x32.png` - 32x32 PNG (Windows small icon)
- `128x128.png` - 128x128 PNG (macOS/Linux)
- `128x128@2x.png` - 256x256 PNG (macOS Retina)
- `icon.icns` - macOS icon bundle
- `icon.ico` - Windows icon
- `icon.png` - System tray icon (for menu bar)

## Generating Icons

### Option 1: Using existing Porua icon

Copy from the plugin directory:

```bash
# Copy base icon
cp ../../../plugin/icons/icon-128.png ./128x128.png

# Create other sizes (requires ImageMagick)
convert 128x128.png -resize 32x32 32x32.png
convert 128x128.png -resize 256x256 128x128@2x.png
cp 128x128.png icon.png
```

### Option 2: Generate all formats

Use `png2icons` tool:

```bash
npm install -g png2icons

# Generate from a source PNG (at least 512x512 recommended)
png2icons 128x128.png icon -icns -ico -favicon
```

### Option 3: Manual creation

**macOS (.icns):**
```bash
mkdir icon.iconset
sips -z 16 16     128x128.png --out icon.iconset/icon_16x16.png
sips -z 32 32     128x128.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     128x128.png --out icon.iconset/icon_32x32.png
sips -z 64 64     128x128.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   128x128.png --out icon.iconset/icon_128x128.png
sips -z 256 256   128x128.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   128x128.png --out icon.iconset/icon_256x256.png
sips -z 512 512   128x128.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   128x128.png --out icon.iconset/icon_512x512.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

**Windows (.ico):**
Use an online converter or ImageMagick:
```bash
convert 128x128.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

## Temporary Placeholder

If you don't have icons yet, you can use the plugin icon temporarily:

```bash
cd wrapper/src-tauri/icons
cp ../../../../plugin/icons/icon-128.png ./128x128.png
cp 128x128.png 32x32.png
cp 128x128.png 128x128@2x.png
cp 128x128.png icon.png

# For .icns and .ico, you'll need to generate them or use placeholders
# The build will warn but may still work for development
```

## Design Notes

- The icon should be recognizable at small sizes (16x16)
- Use simple, bold shapes
- Consider making separate "running" (green) and "stopped" (gray) versions for the tray icon
- Transparency is supported and recommended

## Icon Status Variants (Future)

For Phase 2, consider creating:
- `icon-green.png` - Server running
- `icon-gray.png` - Server stopped
- `icon-red.png` - Server error

These can be swapped in the system tray to show status at a glance.
