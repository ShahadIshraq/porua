# TTS Server - Installation Guide

## Quick Install

### Automated Installation (Recommended)

```bash
# Extract package
tar -xzf tts-server-v0.1.0-macos-arm64.tar.gz
cd tts-server-v0.1.0-macos-arm64

# Run installer
./install.sh
```

The installer will:
- Install to `/usr/local/tts-server` (system) or `~/.local/tts-server` (user)
- Create symlink to `/usr/local/bin/tts_server` or `~/.local/bin/tts_server`
- Set up environment variables (optional)

### Manual Installation

```bash
# Copy files
sudo mkdir -p /usr/local/tts-server/{bin,models}
sudo cp bin/tts_server /usr/local/tts-server/bin/
sudo cp models/* /usr/local/tts-server/models/

# Create symlink
sudo ln -sf /usr/local/tts-server/bin/tts_server /usr/local/bin/tts_server

# Set environment variable
export TTS_MODEL_DIR=/usr/local/tts-server/models
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`):
```bash
export TTS_MODEL_DIR=/usr/local/tts-server/models
export TTS_POOL_SIZE=2
```

## Verification

```bash
# Test binary
tts_server --version

# Test TTS
tts_server "Hello world"

# Test server
tts_server --server --port 3000
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
cp api_keys.txt.example /usr/local/tts-server/api_keys.txt

# Edit and add your keys
nano /usr/local/tts-server/api_keys.txt

# Start server with API keys
TTS_API_KEYS_FILE=/usr/local/tts-server/api_keys.txt tts_server --server
```

## Systemd Service (Linux)

Create `/etc/systemd/system/tts-server.service`:

```ini
[Unit]
Description=TTS Server
After=network.target

[Service]
Type=simple
User=www-data
Environment="TTS_MODEL_DIR=/usr/local/tts-server/models"
Environment="TTS_POOL_SIZE=2"
ExecStart=/usr/local/bin/tts_server --server --port 3000
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tts-server
sudo systemctl start tts-server
```

## Launch Agent (macOS)

Create `~/Library/LaunchAgents/com.tts-server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tts-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/tts_server</string>
        <string>--server</string>
        <string>--port</string>
        <string>3000</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TTS_MODEL_DIR</key>
        <string>/usr/local/tts-server/models</string>
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
launchctl load ~/Library/LaunchAgents/com.tts-server.plist
```

## Uninstall

```bash
# Stop service
sudo systemctl stop tts-server  # Linux
launchctl unload ~/Library/LaunchAgents/com.tts-server.plist  # macOS

# Remove files
sudo rm -rf /usr/local/tts-server
sudo rm /usr/local/bin/tts_server

# Remove environment variables from shell profile
```

## Troubleshooting

**Models not found:**
```bash
export TTS_MODEL_DIR=/usr/local/tts-server/models
```

**Permission denied:**
```bash
chmod +x /usr/local/tts-server/bin/tts_server
```

**Port in use:**
```bash
lsof -i :3000
# Use different port: --port 3001
```

**Low memory:**
```bash
TTS_POOL_SIZE=1 tts_server --server
```
