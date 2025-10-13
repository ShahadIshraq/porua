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

## Building for Production

### Create Distribution Packages

```bash
npm run package          # Create both Chrome and Firefox packages
npm run package:chrome   # Create Chrome package only
npm run package:firefox  # Create Firefox package only
npm run release          # Build + package in one command
```

Packages are created in the `packages/` directory:
- `tts-reader-chrome-v{version}.zip` - Chrome Web Store package
- `tts-reader-firefox-v{version}.zip` - Firefox Add-ons package
- `tts-reader-source-v{version}.zip` - Source code archive (for Firefox review)

### Package Contents

Both packages include:
- `dist/` - Bundled and minified JavaScript
- `icons/` - Extension icons
- `popup.html` - Settings popup
- `src/styles/` - CSS stylesheets
- `manifest.json` - Browser-specific manifest

### Submission Guidelines

#### Chrome Web Store
1. Run `npm run package:chrome`
2. Upload `tts-reader-chrome-v{version}.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Follow the submission wizard

#### Firefox Add-ons (AMO)
1. Run `npm run package:firefox`
2. Upload both:
   - `tts-reader-firefox-v{version}.zip` (extension package)
   - `tts-reader-source-v{version}.zip` (source code for review)
3. Submit at [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution)
4. The source archive includes `BUILD_INSTRUCTIONS.md` for reviewers

### Validation

Before packaging, the build script validates:
- All required files exist (manifests, icons, built JavaScript)
- Production build completes successfully
- Package sizes are reasonable

After packaging, test in both browsers:
- Chrome: Load unpacked extension from root directory
- Firefox: Load temporary add-on from root directory
