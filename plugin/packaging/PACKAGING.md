# Porua Browser Extension - Packaging Guide

## Quick Start

```bash
# Build and package in one command
cd plugin
npm run release
```

Output: `packages/porua-extension-{chrome|firefox}-v0.1.0.zip`

## What the Script Does

1. Validates version consistency across manifest files
2. Validates required files exist
3. Runs production build: `npm run build`
4. Creates temporary package directories
5. Copies extension files (dist, icons, styles, manifests)
6. Creates zip archives for Chrome and Firefox
7. Creates source code archive (for Firefox AMO review)
8. Generates SHA256 checksums for all packages
9. Creates combined `SHA256SUMS` file

## Package Contents

### Chrome Package
```
porua-extension-chrome-v0.1.0/
├── dist/
│   ├── content.js       # Bundled content script
│   └── popup.js         # Bundled popup script
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/styles/
│   ├── variables.css
│   └── content/
│       ├── play-button.css
│       ├── player-control.css
│       └── highlighting.css
├── popup.html
└── manifest.json        # Chrome manifest (Manifest V3)
```

**Package size:** ~100-200 KB compressed

### Firefox Package
```
porua-extension-firefox-v0.1.0/
├── (same structure as Chrome)
└── manifest.json        # Firefox manifest (includes gecko settings)
```

**Package size:** ~100-200 KB compressed

### Source Archive
```
porua-extension-source-v0.1.0/
├── build/               # Build scripts
├── src/                 # Source code
├── tests/               # Test files
├── icons/               # Extension icons
├── manifest.json
├── manifest.firefox.json
├── package.json
├── package-lock.json
├── vitest.config.js
├── popup.html
├── README.md
└── BUILD_INSTRUCTIONS.md  # Auto-generated build guide
```

**Package size:** ~50-100 KB compressed

## Version Management

### Version Locations
The version must be consistent across three files:
- `manifest.json` → `"version": "0.1.0"`
- `manifest.firefox.json` → `"version": "0.1.0"`
- `package.json` → `"version": "0.1.0"`

### Updating Version

**Option 1: Manual Update**
```bash
# Edit all three files manually, then validate
npm run version:validate
```

**Option 2: Automated Sync**
```bash
# Sync from manifest.json (source of truth)
npm run version:sync

# Or update to new version and sync
npm run version:sync 0.2.0
```

### Version Format
Follow semantic versioning: `MAJOR.MINOR.PATCH[-prerelease]`

Examples:
- `0.1.0` - Initial release
- `0.2.0` - Minor update
- `1.0.0` - Major release
- `0.1.1-alpha` - Pre-release (alpha)
- `0.1.1-beta.1` - Pre-release (beta)
- `1.0.0-rc.1` - Release candidate

## Prerequisites

**For local builds:**
- Node.js 18 or higher
- npm 9 or higher
- ~500 KB free disk space

**For CI builds:**
- GitHub Actions automatically handles all dependencies

## Usage Examples

### Local Development Build

```bash
# Install dependencies (first time only)
cd plugin
npm install

# Build and package
npm run release
```

### Individual Browser Packages

```bash
# Chrome only
npm run package:chrome

# Firefox only
npm run package:firefox

# Both browsers
npm run package
```

### Development Mode

```bash
# Build with watch mode (auto-rebuild on changes)
npm run dev

# Then load as unpacked extension in browser
```

## Script Options

### Available npm Scripts

```bash
npm run build              # Build extension (production)
npm run dev                # Build with watch mode
npm run package            # Package both browsers
npm run package:chrome     # Package Chrome only
npm run package:firefox    # Package Firefox only
npm run release            # Build + package (full release)
npm run version:validate   # Check version consistency
npm run version:sync       # Sync versions from manifest.json
npm test                   # Run tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage
```

## Distribution

### GitHub Releases

```bash
# 1. Update version in all manifest files
npm run version:sync 0.2.0

# 2. Commit version update
git add plugin/manifest*.json plugin/package.json
git commit -m "chore: bump plugin version to 0.2.0"

# 3. Create and push tag
git tag plugin-v0.2.0
git push origin plugin-v0.2.0

# 4. GitHub Actions automatically:
#    - Creates release
#    - Builds packages
#    - Uploads artifacts
```

### Checksum Verification

Users can verify package integrity:
```bash
cd packages
sha256sum -c SHA256SUMS
```

### Manual Release (without CI)

```bash
# 1. Build and package
npm run release

# 2. Create release via gh CLI
gh release create plugin-v0.2.0 \
  packages/*.zip \
  packages/*.sha256 \
  packages/SHA256SUMS \
  --title "Porua Browser Extension v0.2.0"
```

## Browser Store Submission

### Chrome Web Store

1. Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `porua-extension-chrome-v0.1.0.zip`
4. Fill in store listing details
5. Submit for review

**Requirements:**
- Developer account ($5 one-time fee)
- Store listing assets (screenshots, description)
- Privacy policy (if collecting data)

### Firefox Add-ons (AMO)

1. Visit [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
2. Click "Submit a New Add-on"
3. Upload `porua-extension-firefox-v0.1.0.zip`
4. Upload `porua-extension-source-v0.1.0.zip` (for code review)
5. Fill in listing details
6. Submit for review

**Requirements:**
- Firefox Add-ons account (free)
- Source code archive (mandatory for review)
- Add-on listing details

**Review time:**
- Chrome: ~1-3 days
- Firefox: ~1-2 weeks (includes manual code review)

## Release Checklist

- [ ] Update version in manifest files
- [ ] Run `npm run version:validate`
- [ ] Update `CHANGELOG.md`
- [ ] Run tests: `npm test`
- [ ] Test build: `npm run release`
- [ ] Test both packages locally in browsers
- [ ] Create git tag: `git tag plugin-v0.X.X`
- [ ] Push tag: `git push origin plugin-v0.X.X`
- [ ] Verify GitHub Actions build succeeds
- [ ] Download and test release artifacts
- [ ] Submit to browser stores (optional)
- [ ] Publish release notes

## Troubleshooting

### Version Mismatch

**Problem:** Build fails with version mismatch error

**Solution:**
```bash
npm run version:validate  # Check which files are mismatched
npm run version:sync      # Auto-fix version inconsistencies
```

### Build Fails

**Problem:** `npm run build` fails

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try build again
npm run build
```

### Missing Required Files

**Problem:** Package script reports missing files

**Solution:**
```bash
# Ensure build ran successfully
npm run build

# Check dist directory exists
ls -la dist/

# Rebuild if needed
rm -rf dist
npm run build
```

### Package Size Too Large

**Problem:** Package exceeds browser store limits

**Solution:**
- Chrome Web Store limit: 128 MB (plenty of room)
- Firefox AMO limit: 200 MB (plenty of room)
- Current packages: ~100-200 KB (well within limits)

### Checksum Verification Fails

**Problem:** `sha256sum -c SHA256SUMS` reports mismatches

**Solution:**
```bash
# Repackage to regenerate checksums
npm run package

# Or manually generate checksums
cd packages
sha256sum *.zip > SHA256SUMS
```

## CI/CD Details

### GitHub Actions Workflow

**Trigger:** Push tag `plugin-v*.*.*` or manual workflow dispatch

**Jobs:**
1. **create-release**
   - Extracts version from tag
   - Detects pre-release status
   - Creates GitHub release with description

2. **build**
   - Installs Node.js and dependencies
   - Validates version consistency
   - Runs tests
   - Builds extension
   - Packages for Chrome and Firefox
   - Generates checksums
   - Uploads all artifacts to release

**Artifacts uploaded:**
- `porua-extension-chrome-v0.1.0.zip` + `.sha256`
- `porua-extension-firefox-v0.1.0.zip` + `.sha256`
- `porua-extension-source-v0.1.0.zip` + `.sha256`
- `SHA256SUMS` (combined checksums)

## Development Workflow

### Local Testing

```bash
# 1. Make changes to source code
vim src/content/index.js

# 2. Run tests
npm test

# 3. Build
npm run build

# 4. Load in browser

# Chrome:
# - Visit chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select plugin directory

# Firefox:
# - Visit about:debugging#/runtime/this-firefox
# - Click "Load Temporary Add-on"
# - Select any file in plugin directory
```

### Watch Mode

```bash
# Start watch mode
npm run dev

# Make changes - files rebuild automatically
# Reload extension in browser to see changes
```

## File Structure

```
plugin/
├── build/
│   ├── bundle.js           # esbuild configuration
│   ├── package.cjs         # Packaging script (enhanced)
│   ├── validate-version.js # Version validation
│   └── sync-version.js     # Version sync utility
├── src/
│   ├── content/
│   │   └── index.js        # Content script entry
│   ├── popup/
│   │   └── index.js        # Popup script entry
│   └── styles/
│       └── ...             # CSS files
├── tests/
│   └── ...                 # Test files
├── icons/
│   └── ...                 # Extension icons
├── dist/                   # Build output (gitignored)
│   ├── content.js
│   └── popup.js
├── packages/               # Package output (gitignored)
│   └── ...                 # Generated zip files
├── packaging/              # Packaging documentation
│   ├── PACKAGING.md        # This file
│   └── RELEASE_CHECKLIST.md
├── manifest.json           # Chrome manifest
├── manifest.firefox.json   # Firefox manifest
├── package.json            # npm configuration
├── package-lock.json       # Dependency lock file
├── popup.html              # Extension popup UI
├── vitest.config.js        # Test configuration
├── README.md               # User documentation
├── CHANGELOG.md            # Version history
└── RELEASING.md            # Release process guide
```

## Version History

- **v0.1.0** - Initial release
  - Chrome and Firefox support
  - Automated packaging and release
  - GitHub Actions CI/CD
