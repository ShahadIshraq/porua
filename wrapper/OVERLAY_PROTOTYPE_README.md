# Overlay Feature Prototype

This prototype implements screen reading capabilities for the Porua desktop application using native macOS APIs.

## Features

- **Screen Capture**: Uses ScreenCaptureKit (macOS 12.3+) for high-quality screen capture
- **OCR**: Uses Vision Framework for accurate text recognition
- **Overlay UI**: Transparent selection and reader windows
- **Selection Mode**: Drag-to-select screen regions
- **Reading Controls**: Play/pause, navigation, and text highlighting

## Requirements

### macOS Version
- **Recommended**: macOS 12.3 or later (for ScreenCaptureKit)
- **Minimum**: macOS 11.0 (uses legacy capture method)

### Development Tools
- Xcode Command Line Tools
- Swift 5.5+
- Rust 1.70+
- Node.js 16+

### Permissions
- Screen Recording permission (will be requested on first use)

## Installation & Setup

### 1. Install Dependencies

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js dependencies
cd wrapper
npm install
```

### 2. Build the Server

The wrapper needs the TTS server binary to be built first:

```bash
cd ../server
cargo build --release
cd ../wrapper
```

### 3. Build Swift Library

```bash
cd src-tauri
./build-swift.sh
cd ..
```

### 4. Run Validation Tests

```bash
./test-overlay.sh
```

This will check:
- Platform compatibility
- Swift compiler availability
- Source files presence
- Swift library compilation
- UI files

### 5. Build & Run

```bash
# Development mode (hot reload)
npm run dev

# Production build
npm run build
```

## Project Structure

```
wrapper/
├── src/
│   ├── selection.html          # Selection window UI
│   ├── selection.js            # Selection window logic
│   ├── overlay.html            # Reader overlay UI
│   └── overlay.js              # Reader overlay logic
├── src-tauri/
│   ├── swift-src/
│   │   ├── ScreenCapture.swift # Native screen capture & OCR
│   │   ├── module.modulemap    # Swift module map
│   │   └── ScreenCapture-Bridging-Header.h
│   ├── src/
│   │   ├── overlay/
│   │   │   ├── mod.rs          # Module exports
│   │   │   ├── screen_capture.rs  # Rust FFI bindings
│   │   │   └── state.rs        # State management
│   │   ├── overlay_commands.rs # Tauri commands
│   │   └── main.rs             # Main application
│   ├── build.rs                # Build script (Swift compilation)
│   ├── build-swift.sh          # Swift build helper
│   ├── Entitlements.plist      # macOS entitlements
│   └── Info.plist              # Usage descriptions
├── test-overlay.sh             # Validation test suite
└── OVERLAY_PROTOTYPE_README.md # This file
```

## Usage

### From System Tray

1. Click the Porua icon in the menu bar
2. Select "Read from Screen..."
3. Drag to select the text region you want to read
4. Press Enter or release mouse to confirm
5. The overlay window will appear with the extracted text
6. Click Play to start reading

### Keyboard Shortcuts

**Selection Window:**
- `ESC` - Cancel selection
- `Enter` - Confirm selection

**Overlay Window:**
- `Space` - Play/Pause
- `←` - Previous phrase
- `→` - Next phrase
- `S` - Stop
- `Cmd+R` - Recapture region
- `ESC` - Close overlay

## API Overview

### Tauri Commands

#### Permission Management
```rust
overlay_check_permission() -> bool
overlay_request_permission() -> bool
```

#### Display Information
```rust
overlay_get_displays() -> Vec<Display>
```

#### Screen Capture
```rust
overlay_capture_region(x, y, width, height) -> String  // base64 PNG
overlay_extract_text(base64_image) -> ExtractedText
overlay_capture_and_extract(x, y, width, height) -> ExtractedText
```

#### Window Management
```rust
overlay_open_selection() -> Result<()>
overlay_close_selection() -> Result<()>
overlay_open_reader(x, y) -> Result<()>
overlay_close_reader() -> Result<()>
```

#### Validation
```rust
overlay_run_validation() -> String  // Test results
```

### Data Structures

```rust
struct ExtractedText {
    full_text: String,
    regions: Vec<TextRegion>,
    overall_confidence: f32,
}

struct TextRegion {
    text: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    confidence: f32,
}

struct Display {
    id: u32,
    width: i32,
    height: i32,
}
```

## Testing the Prototype

### Manual Testing Checklist

- [ ] Grant screen recording permission when prompted
- [ ] Open selection window from system tray
- [ ] Select a region containing text
- [ ] Verify text extraction accuracy
- [ ] Check OCR confidence score
- [ ] Test overlay window controls
- [ ] Test keyboard shortcuts
- [ ] Test recapture functionality
- [ ] Verify window positioning
- [ ] Test with different text sizes/fonts

### Automated Validation

Run the validation command from within the app:

```javascript
// From browser console in overlay window
await invoke('overlay_run_validation')
```

This will test:
- Permission status
- Display detection
- Screen capture
- OCR functionality

## Known Limitations

### Current Prototype
- TTS integration is simulated (not connected to actual server yet)
- No phrase-level timing from TTS
- Simplified text display (no phrase splitting)
- No audio playback
- Single display support only
- No text editing/correction
- Basic error handling

### Platform
- macOS only (no Windows/Linux support yet)
- Requires macOS 12.3+ for best experience
- Screen recording permission required

## Troubleshooting

### Permission Issues

**Problem**: "Permission denied" when trying to capture screen

**Solution**:
1. Open System Preferences > Security & Privacy > Privacy
2. Select "Screen Recording" from the left sidebar
3. Enable permission for Porua
4. Restart the application

### Build Issues

**Problem**: Swift compilation fails

**Solution**:
```bash
# Verify Xcode tools
xcode-select --print-path

# Reinstall if needed
sudo rm -rf /Library/Developer/CommandLineTools
xcode-select --install

# Verify Swift
swiftc --version
```

**Problem**: "Framework not found ScreenCaptureKit"

**Solution**:
- Ensure macOS 12.3 or later
- Update Xcode Command Line Tools

### Runtime Issues

**Problem**: Selection window doesn't appear

**Solution**:
- Check console for errors
- Verify screen recording permission
- Try restarting the app

**Problem**: OCR returns empty text

**Solution**:
- Ensure selected region contains clear text
- Try higher contrast text
- Check OCR confidence score
- Test with simpler fonts

## Next Steps

### Integration Tasks
1. Connect to actual TTS server
2. Implement phrase-level timing sync
3. Add audio playback
4. Implement text editing
5. Add voice/speed selection
6. Implement auto-scroll

### Enhancement Ideas
- Multi-display support
- Text correction UI
- Custom highlighting colors
- Saved regions/presets
- Batch processing
- Export to file
- Language detection

## Contributing

This is a prototype. For production integration:

1. Review the integration guide in `main_overlay_integration.rs`
2. Merge overlay module into main application
3. Add proper error handling
4. Implement TTS integration
5. Add comprehensive tests
6. Update user documentation

## Support

For issues or questions:
- Check the console logs
- Run validation tests: `./test-overlay.sh`
- Review the main implementation plan document
- Test with the validation command

## License

Same as the main Porua project (MIT).
