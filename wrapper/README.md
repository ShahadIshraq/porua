# Porua Wrapper

A lightweight menu bar/system tray application for managing the Porua TTS Server.

**Browser Extensions:**
- [Chrome Web Store](https://chromewebstore.google.com/detail/porua/ggdmgcopgoceppjdnkhmnfgefbbaahia)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/porua/)

## Features

- **System Tray Control**: Start/Stop the TTS server from your menu bar (macOS) or system tray (Windows)
- **Automatic Installation**: First-run installer handles server setup and model downloads
- **Status Monitoring**: Real-time server status updates
- **Minimal Footprint**: ~60-70 MB installer, lightweight Tauri-based wrapper

## Architecture

Built with:
- **Backend**: Rust + Tauri (system tray, process management, installer)
- **Server**: Porua TTS Server (Rust + Kokoro TTS)
- **Distribution**: Single-file installers (.dmg for macOS, .msi for Windows)

## Development

### Prerequisites

1. **Rust** (1.75+): [Install Rust](https://rustup.rs/)
2. **Node.js** (18+): [Install Node.js](https://nodejs.org/)
3. **Build the server first**:
   ```bash
   cd ../server
   cargo build --release
   ```

### Setup

```bash
cd wrapper
npm install
```

### Run in Development Mode

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

**Output:**
- macOS: `src-tauri/target/release/bundle/dmg/Porua_0.1.0_aarch64.dmg`
- Windows: `src-tauri/target/release/bundle/msi/Porua_0.1.0_x64.msi`

## Project Structure

```
wrapper/
├── src/                    # Frontend (minimal HTML)
│   └── index.html
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # App entry, system tray
│   │   ├── server.rs       # Server process management
│   │   ├── installer.rs    # First-run installation
│   │   ├── config.rs       # Configuration handling
│   │   └── paths.rs        # Platform-specific paths
│   ├── build.rs            # Build script (bundles server)
│   ├── tauri.conf.json     # Tauri configuration
│   ├── Cargo.toml
│   ├── icons/              # App icons
│   └── resources/          # Bundled resources (created during build)
│       ├── porua_server    # Server binary
│       ├── espeak-ng-data/ # Phoneme data
│       └── samples/        # Voice samples
├── package.json
└── README.md
```

## How It Works

### First Launch

1. User installs and opens Porua.app/.exe
2. Wrapper detects first run (no `installed.flag`)
3. Installer runs automatically:
   - Creates app data directory
   - Extracts server binary from bundle
   - Extracts espeak-ng-data and samples
   - Downloads TTS models from GitHub (~337 MB)
   - Creates config.json
4. Server starts automatically on port 3000
5. System tray icon shows green (running)

### Normal Usage

- Click tray icon to see menu
- Use Start/Stop to control server
- Status line shows current state
- Quit cleanly shuts down server

### Configuration

Config stored at:
- **macOS**: `~/Library/Application Support/Porua/config.json`
- **Windows**: `%APPDATA%\Porua\config.json`
- **Linux**: `~/.config/porua/config.json`

Default settings:
```json
{
  "version": "0.1.0",
  "server": {
    "port": 3000,
    "pool_size": 2,
    "log_level": "info"
  }
}
```

### Logs

Logs location:
- **macOS**: `~/Library/Application Support/Porua/logs/`
- **Windows**: `%APPDATA%\Porua\logs\`
- **Linux**: `~/.config/porua/logs/`

Files:
- `app.log` - Wrapper application logs
- `server.log` - Server stdout/stderr

## Icons

The wrapper uses icons from the plugin directory:

```bash
# Already included (PNG files):
src-tauri/icons/
├── 32x32.png          ✅ Copied from plugin
├── 128x128.png        ✅ Copied from plugin
├── 128x128@2x.png     ✅ Copied from plugin
└── icon.png           ✅ Copied from plugin

# Need to be generated once (see GENERATE_ICONS_ONCE.md):
├── icon.icns          ⚠️ macOS bundle icon (generate once, commit)
└── icon.ico           ⚠️ Windows icon (generate once, commit)
```

**Development builds work fine with just PNG files.** For polished production releases, generate `.icns` and `.ico` once, then commit them. See `GENERATE_ICONS_ONCE.md` for instructions.

## Bundled Resources

The build script (`build.rs`) automatically bundles:
1. Server binary from `../../server/target/release/porua_server`
2. espeak-ng-data from `../../server/packaging/espeak-ng-data/`
3. Voice samples from `../../server/samples/`

**Important**: Build the server first, or the build will warn but continue (installation will fail at runtime).

## Testing

### Test Installation Flow

1. Delete app data directory:
   ```bash
   # macOS
   rm -rf ~/Library/Application\ Support/Porua

   # Windows
   rmdir /s %APPDATA%\Porua
   ```

2. Run the app - should trigger first-run installation

### Test Server Control

1. Launch app
2. Wait for server to start
3. Open browser: `http://localhost:3000/health`
4. Should see: `{"status":"ok"}`
5. Stop server via tray menu
6. Refresh browser - should fail to connect
7. Start server via tray menu
8. Refresh browser - should work again

## Distribution

### GitHub Release

```bash
# Build for current platform
npm run build

# Upload to GitHub release
gh release upload v0.1.0 \
  src-tauri/target/release/bundle/dmg/*.dmg \
  src-tauri/target/release/bundle/msi/*.msi
```

### User Installation

**macOS:**
1. Download `Porua_0.1.0_aarch64.dmg`
2. Open DMG, drag to Applications
3. Launch Porua from Applications
4. Wait for installation (~337 MB model download)
5. Server starts automatically

**Windows:**
1. Download `Porua_0.1.0_x64.msi`
2. Run installer
3. Launch Porua from Start Menu
4. Wait for installation (~337 MB model download)
5. Server starts automatically

## Windows Uninstallation

### What Gets Removed

When you uninstall Porua on Windows using the MSI installer, the following is **completely removed**:

1. **Installation Directory** (`C:\Program Files\Porua\`)
   - Application executable
   - Bundled resources

2. **User Data Directory** (`%APPDATA%\Porua\`, approximately **400-500 MB**)
   - `bin/porua_server` - Server binary (~29 MB)
   - `models/` - TTS models (~337 MB)
     - `kokoro-v1.0.onnx` (~310 MB)
     - `voices-v1.0.bin` (~27 MB)
   - `espeak-ng-data/` - Phoneme data (~25 MB)
   - `samples/` - Voice samples
   - `logs/` - Application and server logs
   - `config.json` - User configuration
   - `.env` - Server environment settings
   - `installed.flag` - Installation marker

3. **Registry Entries**
   - `HKCU\Software\Porua Team\Porua`

### Important Notes

- **Automatic Process Termination**: The uninstaller will force-terminate Porua.exe if running
- **Complete Data Removal**: All downloaded models and configurations are deleted
- **No Backup**: User data is not backed up before removal

### Manual Cleanup (if needed)

If uninstallation is incomplete:

```powershell
# Remove app data
Remove-Item -Recurse -Force "$env:APPDATA\Porua"

# Remove registry entries
Remove-Item -Path "HKCU:\Software\Porua Team\Porua" -Recurse -ErrorAction SilentlyContinue
```

### Re-installing After Uninstall

After uninstalling, you can reinstall Porua:
- All models will need to be re-downloaded (~337 MB)
- Configuration will reset to defaults
- First-launch installation will trigger automatically

## Troubleshooting

### Server won't start

Check logs:
```bash
# macOS
tail -f ~/Library/Application\ Support/Porua/logs/server.log

# Windows
type %APPDATA%\Porua\logs\server.log
```

Common issues:
- Missing models: Delete `installed.flag` and restart app
- Port in use: Change port in `config.json` (Phase 2 feature)
- Binary not executable: Check permissions on server binary

### Installation fails

Check app logs:
```bash
# macOS
tail -f ~/Library/Application\ Support/Porua/logs/app.log
```

Common issues:
- Network error during model download: Restart app (download resumes)
- Disk space: Need ~400 MB free space
- Permissions: Check app data directory is writable

### Models not downloading

The installer downloads from:
```
https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/
├── kokoro-v1.0.onnx (310 MB)
└── voices-v1.0.bin (27 MB)
```

Manual download:
```bash
cd ~/Library/Application\ Support/Porua/models  # macOS
# or %APPDATA%\Porua\models on Windows

curl -L -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -O https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## Future Enhancements (Phase 2)

- [ ] Settings window for port, pool size, log level
- [ ] Auto-start on login option
- [ ] View server logs in UI
- [ ] Check for updates
- [ ] Multiple server profiles

## License

MIT
