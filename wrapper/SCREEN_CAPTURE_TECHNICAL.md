# Screen Capture Feature - Technical Documentation

## Architecture Overview

The screen capture feature is built as an integrated module within the Porua Tauri application, consisting of:

- **Backend (Rust)**: Capture logic, window management, file operations
- **Frontend (HTML/CSS/JS)**: UI overlays and preview interface
- **Integration**: Global shortcuts, system tray, Tauri commands

## Project Structure

```
wrapper/src-tauri/
├── src/
│   ├── main.rs                      # App entry, shortcut registration, tray menu
│   └── capture/
│       ├── mod.rs                   # Module exports
│       ├── monitors.rs              # Monitor detection & DPI handling
│       ├── screenshot.rs            # Screen capture implementation
│       └── overlay.rs               # Overlay window management & selection logic
├── tests/
│   ├── integration_tests.rs         # End-to-end capture workflow tests
│   ├── monitor_tests.rs             # Monitor detection tests
│   ├── overlay_tests.rs             # Overlay logic tests
│   ├── preview_integration_tests.rs # Preview workflow tests
│   ├── screenshot_tests.rs          # Screenshot capture tests
│   └── shortcut_tray_tests.rs       # Shortcut/tray validation tests
└── Cargo.toml                       # Dependencies and features

wrapper/src/
├── overlay.html                     # Selection overlay UI
├── overlay.css                      # Overlay styling
├── overlay.js                       # Selection logic & backend integration
├── preview.html                     # Preview window UI
├── preview.css                      # Preview styling
└── preview.js                       # Preview logic & save functionality
```

## Backend Components

### 1. Monitor Detection (`monitors.rs`)

**Purpose:** Detect displays, handle DPI scaling, calculate virtual screen bounds

**Key Functions:**
```rust
pub fn get_all_monitors_sync() -> Vec<MonitorInfo>
pub fn get_virtual_screen_bounds() -> (i32, i32, u32, u32)
pub fn logical_to_physical(x: i32, y: i32, scale: f64) -> (i32, i32)
pub fn physical_to_logical(x: i32, y: i32, scale: f64) -> (i32, i32)
```

**Features:**
- Cross-platform monitor enumeration
- Virtual screen bounds for multi-monitor setups
- DPI-aware coordinate conversion
- Support for negative coordinates (multi-monitor)

### 2. Screenshot Capture (`screenshot.rs`)

**Purpose:** Capture screen regions and save to temp files

**Key Functions:**
```rust
pub async fn capture_screen_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String>
pub fn get_capture_temp_path() -> PathBuf
pub fn cleanup_old_captures() -> Result<()>
```

**Implementation:**
- Mock implementation for cross-platform testing
- Ready for Windows API integration (production)
- Atomic counter for unique filenames (thread-safe)
- PNG format with lossless compression

### 3. Overlay Management (`overlay.rs`)

**Purpose:** Create overlay windows, calculate selection bounds, validate selections

**Key Functions:**
```rust
pub fn calculate_selection_bounds(start_x: i32, start_y: i32, end_x: i32, end_y: i32) -> (i32, i32, u32, u32)
pub fn is_selection_valid(width: u32, height: u32) -> bool
pub fn clamp_selection_to_bounds(x: i32, y: i32, width: u32, height: u32, screen_bounds: (i32, i32, u32, u32)) -> (i32, i32, u32, u32)
pub async fn create_overlay_window(app_handle: &AppHandle) -> Result<Window, String>
pub async fn close_overlay_window(app_handle: &AppHandle) -> Result<(), String>
```

**Features:**
- Normalizes drag direction (any corner to any corner)
- Minimum 10×10 pixel validation
- Clamps selections to screen bounds
- Fullscreen transparent window creation

### 4. Tauri Commands (`main.rs`)

**Exposed Commands:**
```rust
#[tauri::command] async fn start_screen_capture(app_handle: AppHandle) -> Result<(), String>
#[tauri::command] async fn capture_region(app_handle: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<String, String>
#[tauri::command] async fn cancel_capture(app_handle: AppHandle) -> Result<(), String>
#[tauri::command] async fn get_monitor_info() -> Result<Vec<MonitorInfo>, String>
#[tauri::command] async fn save_capture_as(source_path: String, destination_path: String) -> Result<(), String>
#[tauri::command] async fn open_preview_window(app_handle: AppHandle, image_path: String) -> Result<(), String>
```

## Frontend Components

### 1. Overlay UI (`overlay.html`, `overlay.css`, `overlay.js`)

**Features:**
- Fullscreen semi-transparent background
- Selection rectangle with real-time dimensions
- Blue border/fill for valid selections
- Red border/fill for invalid selections (< 10×10)
- ESC key cancellation
- Context menu suppression

**Event Flow:**
```
mousedown → start selection
mousemove → update selection bounds & tooltip
mouseup → validate & capture
ESC → cancel
```

### 2. Preview UI (`preview.html`, `preview.css`, `preview.js`)

**Features:**
- Dark theme interface
- Centered, scaled image display
- Three action buttons: Recapture, Save As, Close
- Image info display (dimensions, filename)
- ESC key to close

**Event Flow:**
```
load → fetch image via convertFileSrc
Recapture → close preview, start_screen_capture
Save As → open native dialog, save_capture_as command
Close → close window
```

## Integration Points

### 1. Global Shortcut Registration

**Location:** `main.rs` setup function

```rust
app.global_shortcut_manager().register("Ctrl+Shift+S", move || {
    // Open capture overlay
    capture::overlay::create_overlay_window(&app).await
})
```

**Features:**
- Registered on app startup
- Works from any application
- Auto-unregistered on app quit

### 2. System Tray Integration

**Location:** `main.rs` create_tray_menu function

```rust
menu.add_item(CustomMenuItem::new("capture_screen", "Capture Screen Area"))
```

**Handler:**
```rust
"capture_screen" => {
    capture::overlay::create_overlay_window(&app_handle).await
}
```

## Testing Strategy

### Automated Tests (68 tests)

**Test Distribution:**
- Infrastructure: 4 tests
- Monitor detection: 8 tests
- Screenshot capture: 9 tests
- Overlay logic: 10 tests
- Integration tests: 5 tests
- Preview integration: 8 tests
- Shortcut/tray: 19 tests
- Config/fixtures: 5 tests

**Run Tests:**
```bash
cd wrapper/src-tauri
cargo test
```

### Manual Tests

**Test Checklists:**
- `OVERLAY_MANUAL_TESTS.md` - 15 overlay UI tests
- `PREVIEW_MANUAL_TESTS.md` - 20 preview UI tests
- `SHORTCUT_TRAY_MANUAL_TESTS.md` - 20 shortcut/tray tests
- `E2E_INTEGRATION_TESTS.md` - 20 end-to-end tests

## Configuration

### Cargo.toml

**Dependencies:**
```toml
tauri = { version = "1.5", features = [
    "global-shortcut-all",  # For Ctrl+Shift+S
    "dialog-save",          # For save dialog
    "window-all",           # For window management
    # ... other features
]}
image = "0.24"             # For PNG operations
urlencoding = "2.1"        # For preview URL encoding
```

### tauri.conf.json

**Allowlists:**
```json
"allowlist": {
    "window": { "all": true },
    "dialog": { "save": true },
    "globalShortcut": { "all": true }
}
```

## Performance Considerations

### Memory Management
- Temporary captures cleaned up periodically
- Image buffers released after save
- Window close frees resources
- Atomic counter prevents filename collisions

### Async Operations
- Capture is non-blocking (async)
- Window operations use async runtime
- File I/O uses async APIs

### Thread Safety
- `AtomicU64` for capture counter
- `Arc<Mutex<>>` for shared state
- No race conditions in parallel tests

## Error Handling

### Error Categories

1. **Validation Errors**
   - Selection too small (< 10×10)
   - Selection out of bounds (clamped automatically)

2. **System Errors**
   - Failed to create window
   - Failed to capture screen
   - Failed to save file

3. **Permission Errors**
   - No screen recording permission (macOS)
   - No file write permission

### Error Propagation

```rust
Result<T, String> // Commands return string errors
Result<T, anyhow::Error> // Internal functions use anyhow
```

## Platform-Specific Notes

### macOS
- Requires screen recording permission
- Uses Cmd+Shift+S (Tauri maps Ctrl to Cmd)
- App must not be sandboxed for global shortcuts

### Windows
- Uses native screen capture APIs (in production)
- Works in Windows 10 and later
- No special permissions required

### Linux
- Works with X11 and Wayland (basic support)
- Some compositors may block overlays
- Requires session permissions for shortcuts

## Development Workflow

### Building
```bash
cd wrapper/src-tauri
cargo build
```

### Running
```bash
cd wrapper/src-tauri
cargo run
```

### Testing
```bash
# All tests
cargo test

# Specific test file
cargo test --test integration_tests

# With output
cargo test -- --nocapture

# Quiet mode
cargo test --quiet
```

### Adding New Tests

1. Create test file in `tests/` directory
2. Import required modules: `use porua_wrapper::capture::*;`
3. Write test functions with `#[test]` or `#[tokio::test]`
4. Run tests to verify

## Extending the Feature

### Adding New Capture Formats

1. Modify `screenshot.rs` to support format parameter
2. Update `capture_region` command signature
3. Add format selection to preview UI
4. Update save dialog filters

### Adding Annotations

1. Create new UI component for annotation tools
2. Add canvas overlay in preview
3. Implement drawing functions
4. Update save logic to render annotations

### Adding OCR

1. Integrate OCR library (tesseract-rs)
2. Add "Extract Text" button to preview
3. Process image through OCR pipeline
4. Display/copy extracted text

## Debugging

### Enable Logging

Add to `.env` or environment:
```bash
RUST_LOG=debug cargo run
```

### Common Debug Points

- Shortcut registration: Look for "Global shortcut...registered successfully"
- Capture trigger: "Screen capture requested from..."
- Window creation: "Screen capture overlay opened"
- Capture complete: "Capture successful: /path/to/file"

### Console Inspection

Open browser dev tools on overlay/preview windows:
- Right-click → Inspect Element
- Console tab shows JavaScript logs
- Network tab shows resource loading

## Contributing

### Code Style
- Follow Rust standard formatting (`cargo fmt`)
- Run clippy before committing (`cargo clippy`)
- Write tests for new functions
- Update documentation

### Pull Request Checklist
- [ ] All tests pass (`cargo test`)
- [ ] No clippy warnings
- [ ] Code formatted (`cargo fmt`)
- [ ] Documentation updated
- [ ] Manual tests performed
- [ ] Commit message follows convention

## License

MIT License - See LICENSE file for details

---

**For User Documentation:** See `SCREEN_CAPTURE_FEATURE.md`

**For Testing:** See test markdown files in `wrapper/` directory
