# Porua Server - Installation Guide

## Quick Install

### Automated Installation (Recommended)

```bash
# 1. Extract package
tar -xzf porua-server-v0.1.0-macos-arm64.tar.gz
cd porua-server-v0.1.0-macos-arm64

# 2. Download models (~337 MB)
./download_models.sh

# 3. Install
./install.sh
```

The installer will:
- Download TTS models from official source (if not already downloaded)
- Install to `/usr/local/porua` (system) or `~/.local/porua` (user)
- Create symlink to `/usr/local/bin/porua_server` or `~/.local/bin/porua_server`
- Set up environment variables (optional)

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
sudo mkdir -p /usr/local/porua/{bin,models}
sudo cp bin/porua_server /usr/local/porua/bin/
sudo cp models/* /usr/local/porua/models/

# 3. Create symlink
sudo ln -sf /usr/local/porua/bin/porua_server /usr/local/bin/porua_server

# 4. Set environment variable
export TTS_MODEL_DIR=/usr/local/porua/models
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`):
```bash
export TTS_MODEL_DIR=/usr/local/porua/models
export TTS_POOL_SIZE=2
```

## Verification

```bash
# Test binary
porua_server --version

# Test TTS
porua_server "Hello world"

# Test server
porua_server --server --port 3000
curl http://localhost:3000/health
```

## Configuration

### Environment Variables

```bash
TTS_MODEL_DIR=/path/to/models    # Model location (required if not in default location)
TTS_POOL_SIZE=2                   # Number of TTS engines (default: 2)
RUST_LOG=info                     # Log level: error, warn, info, debug
```

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
Environment="TTS_MODEL_DIR=/usr/local/porua/models"
Environment="TTS_POOL_SIZE=2"
ExecStart=/usr/local/bin/porua_server --server --port 3000
Restart=always

[Install]
WantedBy=multi-user.target
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
    <key>EnvironmentVariables</key>
    <dict>
        <key>TTS_MODEL_DIR</key>
        <string>/usr/local/porua/models</string>
        <key>TTS_POOL_SIZE</key>
        <string>2</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

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
sudo rm -rf /usr/local/porua
sudo rm /usr/local/bin/porua_server

# Remove environment variables from shell profile
```

## Troubleshooting

**Models not downloading:**
```bash
# Check internet connection
# Try manual download
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' -o models/kokoro-v1.0.onnx
curl -L 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' -o models/voices-v1.0.bin
```

**Models not found:**
```bash
export TTS_MODEL_DIR=/usr/local/porua/models
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
