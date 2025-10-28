# Wrapper Setup Guide

## Prerequisites

Before building the wrapper, ensure you have:

### 1. Build the Server

The wrapper bundles the server binary, so build it first:

```bash
cd server
cargo build --release
```

This creates: `server/target/release/porua_server`

### 2. Install Dependencies

**Rust:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Node.js:**
```bash
# macOS
brew install node

# Or download from https://nodejs.org/
```

**Install Tauri CLI:**
```bash
cd wrapper
npm install
```

### 3. Generate Icons (One-Time, Optional)

The wrapper includes PNG icons (copied from plugin). For polished production builds, you should generate `.icns` (macOS) and `.ico` (Windows) **once**, then commit them.

**See `GENERATE_ICONS_ONCE.md` for detailed instructions.**

**Quick version (macOS):**
```bash
cd wrapper/src-tauri/icons
mkdir icon.iconset
sips -z 16 16 128x128.png --out icon.iconset/icon_16x16.png
sips -z 32 32 128x128.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 128x128.png --out icon.iconset/icon_32x32.png
sips -z 64 64 128x128.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 128x128.png --out icon.iconset/icon_128x128.png
sips -z 256 256 128x128.png --out icon.iconset/icon_128x128@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
git add icon.icns && git commit -m "Add macOS icon"
```

**Windows .ico:** Use online converter at https://convertio.co/png-ico/

**Note:** Development builds work fine without these files. Only needed for polished releases.

## Development

### Run in Development Mode

```bash
cd wrapper
npm run dev
```

This will:
1. Compile the Rust code
2. Bundle resources (server, espeak-ng-data, samples)
3. Launch the app in development mode
4. Enable hot-reload for frontend changes

**Note:** The first run will trigger installation (model downloads).

### Development Tips

- **Logs**: Check `~/.config/porua/logs/` (Linux/macOS) or `%APPDATA%\Porua\logs\` (Windows)
- **Reset installation**: Delete `~/.config/porua/` to trigger fresh install
- **Server logs**: Tail `logs/server.log` to see server output
- **App logs**: Tail `logs/app.log` to see wrapper logs

## Building for Production

### Build for Current Platform

```bash
cd wrapper
npm run build
```

**Output locations:**

macOS:
```
src-tauri/target/release/bundle/dmg/Porua_0.1.0_aarch64.dmg  # ARM64
src-tauri/target/release/bundle/dmg/Porua_0.1.0_x64.dmg      # Intel
```

Windows:
```
src-tauri\target\release\bundle\msi\Porua_0.1.0_x64.msi
```

Linux:
```
src-tauri/target/release/bundle/appimage/porua_0.1.0_amd64.AppImage
src-tauri/target/release/bundle/deb/porua_0.1.0_amd64.deb
```

### Build Size

Expected installer sizes:
- macOS DMG: ~60-70 MB
- Windows MSI: ~60-70 MB
- Linux AppImage: ~65-75 MB

Models are downloaded separately during first run (~337 MB).

### Cross-Platform Builds

For cross-compilation, see Tauri's guide:
https://tauri.app/v1/guides/building/cross-platform

## Testing

### Test Installation Flow

1. **Clean install test:**
   ```bash
   # Delete app data
   rm -rf ~/Library/Application\ Support/Porua  # macOS
   rm -rf ~/.config/porua                        # Linux
   rmdir /s %APPDATA%\Porua                     # Windows (cmd)

   # Run app
   npm run dev
   ```

2. **Verify installation:**
   - Should see "Setting up Porua..." notification
   - Should download models
   - Should see "Setup complete!" notification
   - Server should start automatically

3. **Check installation:**
   ```bash
   ls -la ~/Library/Application\ Support/Porua  # macOS

   # Should see:
   # bin/porua_server
   # models/kokoro-v1.0.onnx
   # models/voices-v1.0.bin
   # espeak-ng-data/
   # samples/
   # config.json
   # installed.flag
   # logs/
   ```

### Test Server Control

1. **Start/Stop test:**
   - Click tray icon
   - Click "Stop Server"
   - Verify status changes to "Stopped"
   - Verify health check fails: `curl http://localhost:3000/health`
   - Click "Start Server"
   - Wait for status to show "Running (3000)"
   - Verify health check works: `curl http://localhost:3000/health`

2. **Process test:**
   ```bash
   # Check if server is running
   ps aux | grep porua_server

   # Check port is listening
   lsof -i :3000  # macOS/Linux
   netstat -ano | findstr :3000  # Windows
   ```

3. **Quit test:**
   - Click "Quit" in tray menu
   - Verify server process is killed
   - Verify app exits cleanly

## Troubleshooting

### Build fails: "Server binary not found"

**Solution:**
```bash
cd server
cargo build --release
cd ../wrapper
npm run build
```

### Build fails: "espeak-ng-data not found"

**Cause:** Missing espeak-ng data in server repo.

**Solution:**
```bash
# The data should be in the repository
ls server/packaging/espeak-ng-data/

# If missing, you need to obtain it from the server setup
```

### Development mode: "Failed to start server"

**Check:**
1. Server binary exists: `ls server/target/release/porua_server`
2. Models downloaded: `ls ~/Library/Application\ Support/Porua/models/`
3. Check logs: `tail -f ~/Library/Application\ Support/Porua/logs/server.log`

**Common issues:**
- Port 3000 already in use: Kill existing process or change port in config
- Models missing: Delete `installed.flag` and restart
- Binary not executable: `chmod +x ~/Library/Application\ Support/Porua/bin/porua_server`

### Icons missing in build

**Symptoms:**
- Build warns about missing icons
- App shows generic icon

**Solution:**
1. Run `./scripts/generate-icons.sh`
2. Or manually create `icon.icns` and `icon.ico`
3. Rebuild: `npm run build`

### macOS: "App can't be opened because it is from an unidentified developer"

**Solution:**
```bash
xattr -d com.apple.quarantine /Applications/Porua.app
```

Or: System Preferences → Security & Privacy → Click "Open Anyway"

**For distribution:** Sign the app with an Apple Developer certificate.

### Windows: "Windows protected your PC"

**Solution:** Click "More info" → "Run anyway"

**For distribution:** Sign the installer with a code signing certificate.

## Distribution

### GitHub Release

1. **Build for all platforms** (use CI or build locally)
2. **Create release:**
   ```bash
   gh release create v0.1.0 \
     wrapper/src-tauri/target/release/bundle/dmg/*.dmg \
     wrapper/src-tauri/target/release/bundle/msi/*.msi \
     --title "Porua v0.1.0" \
     --notes "First release"
   ```

3. **Generate checksums:**
   ```bash
   cd wrapper/src-tauri/target/release/bundle/dmg
   shasum -a 256 *.dmg > checksums.txt
   ```

### User Installation Guide

Create instructions for users:

**macOS:**
1. Download `Porua_0.1.0_aarch64.dmg` (ARM) or `Porua_0.1.0_x64.dmg` (Intel)
2. Open DMG
3. Drag Porua to Applications
4. Launch Porua from Applications
5. Wait for setup (model download, ~337 MB)
6. Server starts automatically
7. Use menu bar icon to control server

**Windows:**
1. Download `Porua_0.1.0_x64.msi`
2. Run installer
3. Launch from Start Menu
4. Wait for setup (model download, ~337 MB)
5. Server starts automatically
6. Use system tray icon to control server

## Next Steps

After successful build:

1. **Test thoroughly** - Try all features
2. **Update main README** - Add wrapper documentation
3. **Create release notes** - Document changes
4. **Plan Phase 2** - Settings UI, auto-start, etc.

## Getting Help

- **Check logs**: Always check `logs/app.log` and `logs/server.log`
- **Tauri docs**: https://tauri.app/v1/guides/
- **GitHub issues**: Report bugs with log excerpts

## Development Workflow

Typical development cycle:

```bash
# 1. Make changes to Rust code
vim wrapper/src-tauri/src/main.rs

# 2. Run in dev mode (auto-reloads)
cd wrapper && npm run dev

# 3. Test changes
# ... interact with app ...

# 4. Check logs
tail -f ~/Library/Application\ Support/Porua/logs/app.log

# 5. Clean install test
rm -rf ~/Library/Application\ Support/Porua
npm run dev

# 6. Build for production
npm run build

# 7. Test production build
open src-tauri/target/release/bundle/dmg/Porua_0.1.0_aarch64.dmg
```
