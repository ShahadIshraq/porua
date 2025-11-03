# Overlay Feature - Quick Reference Card

## 🚀 Quick Start Commands

```bash
# Validate environment
./test-overlay.sh

# Build Swift library
cd src-tauri && ./build-swift.sh && cd ..

# Build wrapper
npm run build

# Run in dev mode
npm run dev
```

## 📦 File Locations

| Component | Path |
|-----------|------|
| Swift source | `src-tauri/swift-src/ScreenCapture.swift` |
| Rust FFI | `src-tauri/src/overlay/screen_capture.rs` |
| Tauri commands | `src-tauri/src/overlay_commands.rs` |
| Selection UI | `src/selection.html` + `src/selection.js` |
| Overlay UI | `src/overlay.html` + `src/overlay.js` |
| Build script | `src-tauri/build-swift.sh` |
| Test page | `test-page.html` |

## 🔧 Common Tasks

### Add New OCR Language
```swift
// In ScreenCapture.swift, recognizeText():
request.recognitionLanguages = ["en-US", "es-ES"]  // Add language code
```

### Adjust OCR Accuracy
```swift
// In ScreenCapture.swift, recognizeText():
request.recognitionLevel = .accurate  // or .fast
```

### Change Window Appearance
```javascript
// In overlay.html <style>:
#container {
    background: rgba(255, 255, 255, 0.95);  // Adjust opacity
    border-radius: 12px;  // Adjust rounding
}
```

### Add New Keyboard Shortcut
```javascript
// In overlay.js, setupEventListeners():
case 'n':  // Your new key
    yourNewFunction();
    break;
```

### Modify Selection Box Style
```css
/* In selection.html <style>: */
#selection-box {
    border: 2px solid #0ea5e9;  /* Change color */
    background: rgba(14, 165, 233, 0.1);  /* Change fill */
}
```

## 🎨 Customization Points

### Colors
```css
/* Primary accent */
--accent-color: #0ea5e9;

/* Selection box */
--selection-border: #0ea5e9;
--selection-fill: rgba(14, 165, 233, 0.1);

/* Highlight */
--highlight-bg: linear-gradient(120deg, #fbbf24 0%, #f59e0b 100%);

/* Overlay background */
--overlay-bg: rgba(255, 255, 255, 0.95);
```

### Timing
```javascript
// Selection window fade
transition: opacity 0.3s ease;

// Highlight transition
transition: background-color 0.2s;

// Simulated playback speed (in overlay.js)
setTimeout(() => simulatePlayback(), 2000);  // 2 seconds per phrase
```

### OCR Settings
```swift
// Confidence threshold (filter results)
if confidence < 0.5 { continue }  // Skip low-confidence

// Language correction
request.usesLanguageCorrection = true  // or false

// Recognition level
request.recognitionLevel = .accurate  // or .fast
```

## 🐛 Debugging

### Enable Verbose Logging
```rust
// In overlay_commands.rs:
use tracing::{debug, info, warn, error};

debug!("Detailed info: {:?}", data);
```

### Check Swift Compilation
```bash
cd src-tauri
./build-swift.sh
ls -lh target/swift-build/libScreenCapture.a
```

### Inspect FFI Calls
```rust
// In screen_capture.rs:
println!("FFI call with: {:?}", region);
let result = unsafe { screen_capture_region(...) };
println!("FFI returned: {:?}", result);
```

### View OCR Results in Console
```javascript
// In selection.js:
console.log('Extracted text:', extractedText);
console.log('Full text:', extractedText.full_text);
console.log('Regions:', extractedText.regions);
console.log('Confidence:', extractedText.overall_confidence);
```

### Monitor Performance
```rust
use std::time::Instant;

let start = Instant::now();
// ... operation ...
println!("Operation took: {:?}", start.elapsed());
```

## 🔍 Common Issues & Solutions

| Issue | Quick Fix |
|-------|-----------|
| Build fails | `xcode-select --install` |
| Permission denied | System Preferences → Screen Recording |
| Empty OCR result | Check text contrast, try larger region |
| Window not appearing | Check console, verify invoke calls |
| Swift lib missing | Run `./build-swift.sh` |
| FFI crash | Check C string handling, verify pointers |

## 📊 Performance Tuning

### Reduce OCR Time
```swift
// Use fast recognition for real-time
request.recognitionLevel = .fast

// Limit languages
request.recognitionLanguages = ["en-US"]  // Only English

// Disable correction for speed
request.usesLanguageCorrection = false
```

### Optimize Capture Size
```rust
// In overlay_commands.rs:
const MAX_DIMENSION: i32 = 2000;
if width > MAX_DIMENSION {
    // Scale down large captures
}
```

### Reduce Memory Usage
```javascript
// In overlay.js, after processing:
extractedImage = null;  // Clear image data
```

## 🧪 Quick Test Snippets

### Test Permission Check
```javascript
let hasPermission = await invoke('overlay_check_permission');
console.log('Permission:', hasPermission);
```

### Test Screen Capture
```javascript
let imageData = await invoke('overlay_capture_region', {
    x: 0, y: 0, width: 100, height: 100
});
console.log('Captured:', imageData.length, 'bytes');
```

### Test OCR
```javascript
let result = await invoke('overlay_extract_text', {
    base64Image: imageData
});
console.log('Text:', result.full_text);
console.log('Confidence:', result.overall_confidence);
```

### Run Full Validation
```javascript
let report = await invoke('overlay_run_validation');
console.log(report);
```

## 📱 Tauri Command Reference

```rust
// Permission
overlay_check_permission() -> bool
overlay_request_permission() -> bool

// Display
overlay_get_displays() -> String (JSON)

// Capture
overlay_capture_region(x, y, width, height) -> String (base64)
overlay_extract_text(base64_image) -> ExtractedText
overlay_capture_and_extract(x, y, width, height) -> ExtractedText

// Windows
overlay_open_selection() -> Result<()>
overlay_close_selection() -> Result<()>
overlay_open_reader(x, y) -> Result<()>
overlay_close_reader() -> Result<()>

// State
overlay_get_state() -> String (JSON)

// Validation
overlay_run_validation() -> String
```

## 🎯 Integration Checklist

```rust
// 1. Add to main.rs imports
mod overlay;
mod overlay_commands;
use crate::overlay::OverlayManager;

// 2. Update AppState
overlay_manager: Arc<OverlayManager>,

// 3. Initialize in setup
let overlay_manager = OverlayManager::new();

// 4. Add to invoke_handler
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    overlay_commands::overlay_check_permission,
    overlay_commands::overlay_request_permission,
    // ... rest of overlay commands ...
])

// 5. Add to system tray menu
.add_item(CustomMenuItem::new("screen_reader", "Read from Screen..."))

// 6. Handle in tray event
"screen_reader" => {
    overlay_commands::overlay_open_selection(app_handle).await
}
```

## 🔗 Quick Links

- Full docs: `OVERLAY_PROTOTYPE_README.md`
- Testing guide: `TESTING_GUIDE.md`
- Test page: `test-page.html`
- Validation: `./test-overlay.sh`

---

**Tip**: Bookmark this file for quick reference during development!
