# Porua Server - Installation Guide

## Quick Install

### Automated Installation (Recommended)

```bash
# Extract package
tar -xzf porua-server-v0.1.0-macos-arm64.tar.gz
cd porua-server-v0.1.0-macos-arm64

# Run installer
./install.sh
```

The installer will:
- Install to `/usr/local/porua` (system) or `~/.local/porua` (user)
- Create symlink to `/usr/local/bin/porua_server` or `~/.local/bin/porua_server`
- Set up environment variables (optional)

### Manual Installation

```bash
# Copy files
sudo mkdir -p /usr/local/porua/{bin,models}
sudo cp bin/porua_server /usr/local/porua/bin/
sudo cp models/* /usr/local/porua/models/

# Create symlink
sudo ln -sf /usr/local/porua/bin/porua_server /usr/local/bin/porua_server

# Set environment variable
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
