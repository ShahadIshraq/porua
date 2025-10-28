# One-Time Icon Generation

**Do this once, then commit the icons. No need to regenerate.**

## macOS (.icns)

```bash
cd wrapper/src-tauri/icons
mkdir icon.iconset

# Generate all required sizes
sips -z 16 16 128x128.png --out icon.iconset/icon_16x16.png
sips -z 32 32 128x128.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 128x128.png --out icon.iconset/icon_32x32.png
sips -z 64 64 128x128.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 128x128.png --out icon.iconset/icon_128x128.png
sips -z 256 256 128x128.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 128x128.png --out icon.iconset/icon_256x256.png
sips -z 512 512 128x128.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 128x128.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 128x128.png --out icon.iconset/icon_512x512@2x.png

# Create .icns
iconutil -c icns icon.iconset -o icon.icns

# Cleanup
rm -rf icon.iconset

echo "✓ Generated icon.icns"
```

## Windows (.ico)

**Option 1: Using ImageMagick (if installed)**
```bash
cd wrapper/src-tauri/icons
convert 128x128.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
echo "✓ Generated icon.ico"
```

**Option 2: Using Online Converter**
1. Upload `wrapper/src-tauri/icons/128x128.png` to https://convertio.co/png-ico/
2. Download as `icon.ico`
3. Save to `wrapper/src-tauri/icons/icon.ico`

## Then Commit

```bash
git add wrapper/src-tauri/icons/icon.icns wrapper/src-tauri/icons/icon.ico
git commit -m "Add macOS and Windows icon files"
```

**Done!** Icons are now in the repo forever. No regeneration needed.
