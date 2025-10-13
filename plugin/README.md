# TTS Reader Extension

Browser extension for text-to-speech with real-time phrase highlighting.

## Setup

```bash
npm install
npm run build
```

## Load in Browser

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → Select the `plugin` directory

## Usage

Hover over any paragraph and click the play button to start TTS with highlighting.

## Development

```bash
npm run dev    # Watch mode with auto-rebuild
```

## Testing

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Run tests with interactive UI
npm run test:coverage # Run tests with coverage report
```

Test files are in `tests/` directory. Current coverage: 171 tests across utilities, state management, stream parsing, encryption, API client, and storage layer.
