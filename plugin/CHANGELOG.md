# Changelog

All notable changes to the Porua Browser Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- [ ] Voice selection UI
- [ ] Reading speed controls
- [ ] Keyboard shortcuts
- [ ] Dark mode theme
- [ ] Reading progress tracker

## [0.1.0] - 2024-10-21

### Added
- Initial release of Porua Browser Extension
- Chrome extension support (Manifest V3)
- Firefox add-on support (Manifest V3 with gecko settings)
- Text-to-speech functionality powered by Porua TTS Server
- Browser integration with play button on text selection
- Floating player controls for playback management
- Text highlighting during playback
- Extension popup with settings
- Configurable server connection settings
- Storage API for persisting user preferences
- Automated build system using esbuild
- Comprehensive test suite using Vitest
- GitHub Actions CI/CD pipeline
  - Automated testing on push/PR
  - Automated release creation on tag push
  - Multi-browser package generation (Chrome and Firefox)
  - SHA256 checksum generation for all packages
  - Source code archive for Firefox AMO review
- Version management scripts
  - `validate-version.js` for consistency checking
  - `sync-version.js` for automated version synchronization
- Enhanced packaging script with detailed output
- Complete release documentation
  - `PACKAGING.md` - Packaging guide
  - `RELEASE_CHECKLIST.md` - Release checklist
  - `RELEASING.md` - Release process guide
  - `CHANGELOG.md` - This file

### Technical Details
- **Manifest Version**: 3
- **Minimum Chrome Version**: 96
- **Minimum Firefox Version**: 109
- **Build Tool**: esbuild
- **Test Framework**: Vitest
- **Package Format**: ZIP archives
- **Distribution**: GitHub Releases, Chrome Web Store, Firefox AMO

### Package Structure
```
porua-extension-chrome-v0.1.0.zip
porua-extension-firefox-v0.1.0.zip
porua-extension-source-v0.1.0.zip
SHA256SUMS
```

### Dependencies
- esbuild ^0.19.0
- vitest ^3.2.4
- archiver ^7.0.1
- fs-extra ^11.3.2

### Server Compatibility
- Requires Porua TTS Server v0.1.0 or higher
- Default connection: http://localhost:3000

### Known Limitations
- Requires local server installation (no cloud TTS yet)
- No offline functionality
- Limited to localhost server connections by default
- No voice selection UI (uses server default voice)
- No reading speed controls (uses server default speed)

### Browser Compatibility
- ✅ Chrome 96+
- ✅ Edge 96+
- ✅ Firefox 109+
- ❌ Safari (not yet supported)

---

## Release Links

- [0.1.0](https://github.com/YOUR_USERNAME/porua/releases/tag/plugin-v0.1.0) - 2024-10-21

---

## Contributing

When adding entries to the changelog:

1. Add items under `[Unreleased]` during development
2. Move items to a new version section upon release
3. Follow the format: `### Category` then `- Description`
4. Use these categories:
   - **Added** - New features
   - **Changed** - Changes to existing functionality
   - **Deprecated** - Soon-to-be removed features
   - **Removed** - Removed features
   - **Fixed** - Bug fixes
   - **Security** - Security improvements

## Version History

### Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

### Release Cadence

- **Patch releases**: As needed for bug fixes (typically within days)
- **Minor releases**: Monthly for new features
- **Major releases**: As needed for breaking changes

### Pre-Release Versions

Pre-release versions follow the format: `X.Y.Z-{alpha|beta|rc}.N`

Examples:
- `0.2.0-alpha.1` - Alpha release for testing
- `0.2.0-beta.1` - Beta release for broader testing
- `0.2.0-rc.1` - Release candidate, near-final testing

---

**Changelog maintained by:** Porua Development Team
**Last updated:** 2024-10-21
