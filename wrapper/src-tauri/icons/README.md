# Icons

Icon files for the Tauri wrapper application.

## Current Status

✅ **PNG files** - Ready to use (copied from plugin/icons/)
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.png`

⚠️ **Platform-specific formats** - Need to be generated once
- `icon.icns` - macOS icon bundle (not yet generated)
- `icon.ico` - Windows icon (not yet generated)

## To Complete Icon Setup

**See `../../../GENERATE_ICONS_ONCE.md` for one-time generation instructions.**

Someone with macOS (for .icns) or ImageMagick (for .ico) should generate these files **once**, then commit them. After that, they're in the repo forever.

### Quick Generation (macOS)

```bash
# From wrapper/src-tauri/icons/
mkdir icon.iconset
sips -z 16 16 128x128.png --out icon.iconset/icon_16x16.png
sips -z 32 32 128x128.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 128x128.png --out icon.iconset/icon_32x32.png
sips -z 64 64 128x128.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 128x128.png --out icon.iconset/icon_128x128.png
sips -z 256 256 128x128.png --out icon.iconset/icon_128x128@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

### Quick Generation (Windows .ico)

Use online converter: https://convertio.co/png-ico/
- Upload `128x128.png`
- Download as `icon.ico`

## Build Status

- **Development builds**: Work fine with just PNG files
- **Production builds**: May warn about missing .icns/.ico but still build
- **Polished releases**: Should have all formats

## Design Notes

Icons sourced from plugin directory (`plugin/icons/icon-128.png`).

### Future Enhancements

Consider creating status-specific tray icons:
- `icon-green.png` - Server running
- `icon-gray.png` - Server stopped
- `icon-red.png` - Server error
