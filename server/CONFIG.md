# TTS Server Configuration Guide

## Environment-based Configuration

The TTS server supports configuration via environment variables and `.env` files.

### Quick Start

1. Copy the example configuration file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your preferred settings

3. Start the server:
   ```bash
   cargo run --release -- --server
   ```

## Configuration Options

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (use `--port` flag) |

### TTS Pool Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_POOL_SIZE` | `2` | Number of TTS engines in the pool. Higher values allow more concurrent requests but use more memory. |

### Authentication Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_API_KEY_FILE` | Various* | Path to API keys file (one key per line). Leave unset to disable authentication. |

*Default locations checked:
- `./api_keys.txt`
- `~/.tts-server/api_keys.txt`
- `/etc/tts-server/api_keys.txt`

### Rate Limiting Configuration

**Note:** Rate limiting is only active when API key authentication is enabled.

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_PER_SECOND` | `10` | Maximum requests per second per API key |
| `RATE_LIMIT_BURST_SIZE` | `20` | Maximum burst size per API key (number of requests that can be made immediately) |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RUST_LOG` | `tts_server=info,ort=warn,kokoros=warn` | Log level configuration |

Valid log levels: `error`, `warn`, `info`, `debug`, `trace`

Examples:
```bash
# Debug logs for all modules
RUST_LOG=debug

# Debug logs for tts_server only
RUST_LOG=tts_server=debug

# Info logs for everything
RUST_LOG=info
```

## Configuration Priority

Environment variables are loaded in the following order (later sources override earlier ones):

1. System environment variables
2. `.env` file in the current directory
3. Command-line arguments (for `--port`)

## Examples

### Example 1: Development Server

```bash
# .env
TTS_POOL_SIZE=1
RUST_LOG=debug
```

```bash
cargo run -- --server --port 8080
```

### Example 2: Production Server with Authentication

```bash
# .env
TTS_POOL_SIZE=4
TTS_API_KEY_FILE=/etc/tts-server/api_keys.txt
RATE_LIMIT_PER_SECOND=20
RATE_LIMIT_BURST_SIZE=50
RUST_LOG=info
```

Create API keys file:
```bash
# /etc/tts-server/api_keys.txt
prod-key-abc123
prod-key-def456
```

```bash
./target/release/tts_server --server
```

### Example 3: High-Throughput Server

```bash
# .env
TTS_POOL_SIZE=8
RATE_LIMIT_PER_SECOND=50
RATE_LIMIT_BURST_SIZE=100
```

```bash
./target/release/tts_server --server
```

## Docker Configuration

When running in Docker, you can:

1. **Use environment variables:**
   ```bash
   docker run -e TTS_POOL_SIZE=4 -e RATE_LIMIT_PER_SECOND=20 tts-server
   ```

2. **Use .env file:**
   ```bash
   docker run --env-file .env tts-server
   ```

3. **Mount configuration files:**
   ```bash
   docker run -v $(pwd)/.env:/app/.env tts-server
   ```

## Troubleshooting

### Configuration not loading

1. Ensure `.env` file is in the same directory as the binary or where you run the command
2. Check file permissions (should be readable)
3. Verify no syntax errors in `.env` (no spaces around `=`)

### Rate limiting not working

Rate limiting requires API key authentication to be enabled. Check:
1. `TTS_API_KEY_FILE` is set and points to a valid file
2. The API keys file contains at least one valid key
3. Server logs show "Authentication: Status: ENABLED"

### Debugging configuration

Run with debug logging to see what configuration is loaded:
```bash
RUST_LOG=debug cargo run -- --server
```

Look for startup messages showing:
- Pool configuration
- Authentication status
- Rate limiting status
