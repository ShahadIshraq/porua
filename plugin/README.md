# Porua - Text-to-Speech Browser Extension

This is a modernized, modular browser extension for text-to-speech functionality.

## Architecture

The extension follows a clean, modular architecture with proper separation of concerns:

### Directory Structure

```
plugin/
├── src/
│   ├── shared/           # Shared utilities and services
│   │   ├── api/          # API client (TTSClient)
│   │   ├── crypto/       # Encryption utilities
│   │   ├── storage/      # Storage management (SettingsStore)
│   │   └── utils/        # Constants, errors, debounce, throttle
│   ├── content/          # Content script modules
│   │   ├── audio/        # Audio handling (StreamParser, AudioQueue)
│   │   ├── state/        # State management (PlaybackState)
│   │   ├── ui/           # UI components (PlayButton, PlayerControl, HighlightManager)
│   │   ├── utils/        # DOM and event utilities
│   │   └── index.js      # Content script entry point
│   ├── popup/            # Popup modules
│   │   ├── SettingsForm.js
│   │   ├── StatusMessage.js
│   │   └── index.js      # Popup entry point
│   └── styles/           # CSS files
│       ├── variables.css
│       ├── popup.css
│       └── content/      # Content script styles
│           ├── play-button.css
│           ├── player-control.css
│           └── highlighting.css
├── dist/                 # Bundled output (generated)
│   ├── content.js
│   └── popup.js
├── build/                # Build configuration
│   └── bundle.js
├── manifest.json         # Extension manifest
├── popup.html            # Popup HTML
└── package.json          # Node dependencies

```

## Key Improvements

### 1. Modular Architecture
- **Separation of Concerns**: Each module has a single, well-defined responsibility
- **Reusability**: Shared utilities can be used across content and popup scripts
- **Testability**: Small, focused modules are easier to test
- **Maintainability**: Easy to locate and modify specific functionality

### 2. Clean Code
- **ES Modules**: Modern import/export syntax
- **No Global Pollution**: Everything is scoped properly
- **Centralized Constants**: Magic numbers replaced with named constants
- **Proper Error Handling**: Custom error classes with meaningful messages

### 3. Performance
- **Bundling**: esbuild bundles and minifies code for optimal load times
- **Event Management**: EventManager class ensures proper cleanup
- **Resource Management**: URL.createObjectURL() cleanup, proper event listener removal

### 4. Security
- **Proper Encryption**: Uses Web Crypto API with PBKDF2 and AES-GCM
- **Input Sanitization**: escapeHtml function prevents XSS
- **Secure Storage**: API keys encrypted in local storage

## Build System

The extension uses esbuild for fast, efficient bundling:

### Commands

```bash
# Install dependencies
npm install

# Build for production (minified)
npm run build

# Build for development (with watch mode and source maps)
npm run dev
```

### Build Configuration

The build system (`build/bundle.js`):
- Bundles ES modules into browser-compatible IIFE format
- Minifies code for production
- Generates source maps for development
- Supports watch mode for rapid development

## Module Overview

### Shared Modules

#### `shared/utils/constants.js`
Centralized constants for timeouts, player states, default settings, and z-index values.

#### `shared/utils/errors.js`
Custom error classes: APIError, StreamParseError, AudioPlaybackError.

#### `shared/crypto/encryption.js`
Encryption utilities using Web Crypto API for secure API key storage.

#### `shared/storage/SettingsStore.js`
Centralized settings management with encrypted API key storage.

#### `shared/api/TTSClient.js`
HTTP client for TTS server communication with proper error handling.

### Content Script Modules

#### `content/state/PlaybackState.js`
Centralized state management with observable pattern for player state.

#### `content/audio/StreamParser.js`
Multipart stream parsing for audio chunks and metadata.

#### `content/audio/AudioQueue.js`
Audio playback queue management with highlight synchronization.

#### `content/ui/PlayButton.js`
Floating play button that appears on paragraph hover.

#### `content/ui/PlayerControl.js`
Draggable player control with play/pause functionality.

#### `content/ui/HighlightManager.js`
Phrase-level text highlighting synchronized with audio playback.

#### `content/utils/events.js`
Event management with automatic cleanup to prevent memory leaks.

#### `content/utils/dom.js`
DOM utilities for safe HTML escaping and element creation.

### Popup Modules

#### `popup/SettingsForm.js`
Settings form management with validation and API testing.

#### `popup/StatusMessage.js`
Status message display with auto-hide functionality.

## Development

1. Make changes to source files in `src/`
2. Run `npm run dev` to build with watch mode
3. Reload extension in browser
4. Test changes

## Testing

To test the extension:

1. Build the extension: `npm run build`
2. Load unpacked extension from the `plugin` directory in your browser
3. Navigate to any webpage with paragraphs
4. Hover over a paragraph to see the play button
5. Click to start TTS playback
6. Open the popup to configure settings

## Migration Notes

This restructuring maintains 100% feature parity with the original monolithic version while providing:
- Better code organization
- Improved maintainability
- Enhanced performance
- Proper resource cleanup
- Modern development workflow
