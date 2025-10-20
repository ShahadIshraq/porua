# Porua Server - Installation Guide

## Package Contents

This package includes:

- `bin/porua_server` - Server binary (~29 MB)
- `espeak-ng-data/` - Phoneme data (~25 MB, bundled)
- `.env.example` - Environment configuration template
- `api_keys.txt.example` - API keys template (optional)
- `download_models.sh` - Script to download TTS models (~337 MB)
- `install.sh` - Installation script
- `docs/README.md` - Full project documentation

**Note:** TTS models are downloaded separately (not bundled in package):
- `kokoro-v1.0.onnx` (310 MB)
- `voices-v1.0.bin` (27 MB)
- Source: https://github.com/thewh1teagle/kokoro-onnx/releases

## Quick Install

### Automated Installation (Recommended)

```bash
# 1. Extract package
tar -xzf porua-server-v0.1.0-macos-arm64.tar.gz
cd porua-server-v0.1.0-macos-arm64

# 2. Download models (~337 MB)
./download_models.sh

# 3. Install (automatically handles macOS quarantine)
./install.sh
```

The installer will:
- Install binary and eSpeak-ng phoneme data (~25 MB, bundled in package)
- **Automatically remove macOS quarantine attribute** (no manual xattr needed!)
- Download TTS models from official source (if not already downloaded)
- Install to `/usr/local/porua` (system) or `~/.local/porua` (user)
- Create `.env` file with configured paths
- Create symlink to `/usr/local/bin/porua_server` or `~/.local/bin/porua_server`
- Binary automatically finds models via intelligent path resolution

## Model Download

Models are downloaded separately from the official Kokoro ONNX repository.

### Automatic Download (Recommended)

```bash
./download_models.sh
```

This downloads:
- `kokoro-v1.0.onnx` (310 MB) - TTS model
- `voices-v1.0.bin` (27 MB) - Voice style vectors
- **Source:** https://github.com/thewh1teagle/kokoro-onnx/releases

### Manual Download

```bash
mkdir -p models
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
```

### Resume Interrupted Downloads

The download script supports resume:
```bash
# If download was interrupted, just run again
./download_models.sh  # Will resume from where it stopped
```

### Manual Installation

```bash
# 1. Download models
./download_models.sh

# 2. Copy files
sudo mkdir -p /usr/local/porua/{bin,models,share}
sudo cp bin/porua_server /usr/local/porua/bin/
sudo cp models/* /usr/local/porua/models/
sudo cp -r espeak-ng-data /usr/local/porua/share/
sudo cp .env.example /usr/local/porua/

# 3. Create configuration (optional)
sudo cp /usr/local/porua/.env.example /usr/local/porua/.env
# Edit /usr/local/porua/.env as needed

# 4. Create symlink
sudo ln -sf /usr/local/porua/bin/porua_server /usr/local/bin/porua_server
```

**Note:** No shell profile configuration needed! The binary uses intelligent path resolution to automatically find:
- Models via symlink resolution and fallback search paths
- Configuration from `.env` file (loaded automatically via dotenvy)
- eSpeak-ng data from bundled installation

## macOS Security (Automatic)

**Good news!** The install script automatically removes the macOS quarantine attribute, so you don't need to do anything manually.

During installation, you'll see:
```
Removing macOS quarantine attribute...
✓ macOS quarantine attribute removed
```

**Manual removal (only if needed):**

If you installed manually without using `install.sh`, you can remove the quarantine attribute:

```bash
# For system install
sudo xattr -d com.apple.quarantine /usr/local/porua/bin/porua_server

# For user install
xattr -d com.apple.quarantine ~/.local/porua/bin/porua_server
```

**Why this matters:** macOS marks downloaded files as quarantined by Gatekeeper, preventing execution. The install script automatically removes this security flag for a seamless experience.

## Verification

```bash
# Test binary
porua_server --version

# Test TTS
porua_server "Hello world"

# Test server
porua_server --server --port 3000
curl http://localhost:3000/health

# Test API
curl -X POST http://localhost:3000/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world!", "voice": "bf_lily"}' \
  --output test.wav
```

## Configuration

### Using .env File (Recommended)

The installer automatically creates a `.env` file with configured paths. You can customize it for your needs:

```bash
# Edit configuration file
nano /usr/local/porua/.env  # or ~/.local/porua/.env
```

**The .env file is automatically loaded by the binary** using the dotenvy library.

**Available settings in .env:**
- **TTS_MODEL_DIR:** Model location (auto-configured during install)
- **PIPER_ESPEAKNG_DATA_DIRECTORY:** eSpeak-ng data path (auto-configured)
- **TTS_POOL_SIZE:** Number of concurrent TTS engines (default: 2)
- **PORT:** Server port (default: 3000)
- **RATE_LIMIT_MODE:** Rate limiting strategy (auto, per-key, per-ip, disabled)
- **RUST_LOG:** Log levels (error, warn, info, debug, trace)
- **Authentication:** API key file path
- **Rate Limits:** Per-key and per-IP configurations

**Example customization:**
```bash
# Increase TTS pool for better concurrency
TTS_POOL_SIZE=4

# Change server port
PORT=8080

# Enable debug logging
RUST_LOG=debug

# Enable per-IP rate limiting
RATE_LIMIT_MODE=per-ip
RATE_LIMIT_UNAUTHENTICATED_PER_SECOND=10
```

### Environment Variables (Override)

Environment variables take precedence over `.env` file settings:

```bash
# Override specific settings
TTS_MODEL_DIR=/custom/path porua_server --server
TTS_POOL_SIZE=4 PORT=8080 porua_server --server
```

### How Path Resolution Works

The binary uses intelligent path resolution (no shell config needed):

1. **TTS_MODEL_DIR set?** → Use that path
2. **Symlink resolution:** Resolves `~/.local/bin/porua_server` → `~/.local/porua/bin/porua_server` → checks `../models`
3. **Fallback search paths:**
   - `/opt/models`
   - `/usr/local/porua/models`
   - `~/.local/porua/models`
   - `~/.tts-server/models`
   - `./models` (current directory, for development)

### API Keys (Optional)

```bash
# Copy example file
cp api_keys.txt.example /usr/local/porua/api_keys.txt

# Edit and add your keys
nano /usr/local/porua/api_keys.txt

# Start server with API keys
TTS_API_KEYS_FILE=/usr/local/porua/api_keys.txt porua_server --server
```

## Systemd Service (Linux)

Create `/etc/systemd/system/porua-server.service`:

```ini
[Unit]
Description=Porua Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/usr/local/porua
ExecStart=/usr/local/bin/porua_server --server
Restart=always

[Install]
WantedBy=multi-user.target
```

**The binary automatically:**
- Loads configuration from `/usr/local/porua/.env`
- Finds models via symlink resolution
- Discovers eSpeak-ng data from bundled installation

**Optional: Override settings with EnvironmentFile**
```ini
[Service]
Type=simple
User=www-data
WorkingDirectory=/usr/local/porua
EnvironmentFile=/usr/local/porua/.env
ExecStart=/usr/local/bin/porua_server --server
Restart=always
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable porua-server
sudo systemctl start porua-server
```

## Launch Agent (macOS)

Create `~/Library/LaunchAgents/com.porua-server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.porua-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/porua_server</string>
        <string>--server</string>
        <string>--port</string>
        <string>3000</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/usr/local/porua</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

**The binary automatically:**
- Loads configuration from `/usr/local/porua/.env` via dotenvy
- Finds models via symlink resolution
- No environment variables needed in plist!

Load:
```bash
launchctl load ~/Library/LaunchAgents/com.porua-server.plist
```

## Uninstall

```bash
# Stop service
sudo systemctl stop porua-server  # Linux
launchctl unload ~/Library/LaunchAgents/com.porua-server.plist  # macOS

# Remove files
sudo rm -rf /usr/local/porua  # or rm -rf ~/.local/porua
sudo rm /usr/local/bin/porua_server  # or rm ~/.local/bin/porua_server
```

## Troubleshooting

**macOS: "Cannot be opened because the developer cannot be verified":**

This should not happen if you used `install.sh`, which automatically removes the quarantine attribute. If you see this error:

```bash
# Option 1: Run the install script (recommended)
./install.sh  # Handles quarantine removal automatically

# Option 2: Manual removal
sudo xattr -d com.apple.quarantine /usr/local/porua/bin/porua_server
# or for user install:
xattr -d com.apple.quarantine ~/.local/porua/bin/porua_server
```

**Models not downloading:**
```bash
# Check internet connection
# Try manual download
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
```

**Models not found:**
```bash
# Check if models exist
ls -lh /usr/local/porua/models/  # or ~/.local/porua/models/

# If models are missing, download them
./download_models.sh

# If installed in custom location, set TTS_MODEL_DIR in .env:
echo "TTS_MODEL_DIR=/custom/path/models" >> /usr/local/porua/.env
```

**Permission denied:**
```bash
chmod +x /usr/local/porua/bin/porua_server
```

**Port in use:**
```bash
lsof -i :3000
# Use different port: --port 3001
```

**Low memory:**
```bash
TTS_POOL_SIZE=1 porua_server --server
```
