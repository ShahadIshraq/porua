# Releasing Porua Browser Extension

This guide provides a complete walkthrough of the release process for the Porua Browser Extension.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Prerequisites](#prerequisites)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

## Quick Reference

**Standard release (automated):**

```bash
# 1. Update version and changelog
npm run version:sync 0.2.0
# Edit CHANGELOG.md

# 2. Commit and tag
git add .
git commit -m "chore: bump version to 0.2.0"
git tag plugin-v0.2.0
git push origin main
git push origin plugin-v0.2.0

# 3. GitHub Actions handles the rest automatically
```

## Prerequisites

### Required Tools

- **Git** - Version control
- **Node.js** - Version 18 or higher
- **npm** - Version 9 or higher
- **GitHub CLI** (optional) - For manual releases

### Recommended Setup

- **Git hooks** - Pre-commit hooks in `.githooks/` automatically validate version consistency when manifest files are committed. This prevents accidental commits with mismatched versions.

### Required Access

- **GitHub Repository** - Write access to push tags
- **GitHub Actions** - Must be enabled on repository
- **Browser Store Accounts** (optional for store submission):
  - Chrome Web Store developer account ($5 one-time fee)
  - Firefox Add-ons developer account (free)

### Knowledge Requirements

- Understanding of semantic versioning
- Basic Git operations
- GitHub Actions workflow basics
- Browser extension installation process

## Release Process

### Step 1: Prepare the Release

#### 1.1 Decide on Version Number

Follow [Semantic Versioning](https://semver.org/):

- **Patch version** (0.1.X): Bug fixes, minor changes
  - Example: `0.1.0` → `0.1.1`
  - Use when: Fixing bugs, updating dependencies, minor text changes

- **Minor version** (0.X.0): New features, backwards compatible
  - Example: `0.1.0` → `0.2.0`
  - Use when: Adding new features, enhancing existing features

- **Major version** (X.0.0): Breaking changes
  - Example: `0.9.0` → `1.0.0`
  - Use when: Removing features, changing APIs, major redesigns

- **Pre-release** (0.1.0-alpha.1): Testing versions
  - Example: `0.2.0-alpha.1`, `0.2.0-beta.1`, `0.2.0-rc.1`
  - Use when: Testing new features before public release

#### 1.2 Update Version Numbers

Use the sync script to update all version files:

```bash
cd plugin
npm run version:sync 0.2.0
```

This updates:
- `manifest.json`
- `manifest.firefox.json`
- `package.json`

Verify the sync worked:

```bash
npm run version:validate
```

Expected output:
```
========================================
Version Validation
========================================

📖 Reading version numbers...

   manifest.json:          0.2.0
   manifest.firefox.json:  0.2.0
   package.json:           0.2.0

✓ All versions match: 0.2.0
```

#### 1.3 Update CHANGELOG.md

Edit `plugin/CHANGELOG.md` and add an entry for the new version:

```markdown
## [0.2.0] - 2024-10-21

### Added
- New feature X
- Support for Y

### Changed
- Improved performance of Z
- Updated UI for better accessibility

### Fixed
- Bug where A happened
- Issue with B in Firefox

### Deprecated
- Feature C will be removed in v1.0.0

### Security
- Fixed XSS vulnerability in D
```

#### 1.4 Run Tests

Ensure all tests pass:

```bash
npm test
```

Fix any failing tests before proceeding.

#### 1.5 Build and Test Locally

Build the packages:

```bash
npm run release
```

This will:
1. Validate version consistency
2. Run production build
3. Create packages for Chrome and Firefox
4. Generate checksums

Test the packages manually:

**Chrome:**
```bash
# Extract the zip
unzip packages/porua-extension-chrome-v0.2.0.zip -d /tmp/test-chrome

# Load in Chrome:
# 1. Visit chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select /tmp/test-chrome
# 5. Test all features
```

**Firefox:**
```bash
# Firefox can load zip directly
# 1. Visit about:debugging#/runtime/this-firefox
# 2. Click "Load Temporary Add-on"
# 3. Select packages/porua-extension-firefox-v0.2.0.zip
# 4. Test all features
```

Verify:
- ✅ Extension loads without errors
- ✅ All features work as expected
- ✅ No console errors
- ✅ Settings persist correctly
- ✅ TTS playback works

### Step 2: Commit and Tag

#### 2.1 Review Changes

Check what will be committed:

```bash
git status
git diff
```

Should show changes to:
- `manifest.json`
- `manifest.firefox.json`
- `package.json`
- `CHANGELOG.md`

#### 2.2 Commit Version Bump

```bash
git add plugin/manifest.json plugin/manifest.firefox.json plugin/package.json plugin/CHANGELOG.md
git commit -m "chore: bump plugin version to 0.2.0"
```

#### 2.3 Push to Main

```bash
git push origin main
```

Wait for CI tests to pass before proceeding.

#### 2.4 Create Release Tag

Create an annotated tag:

```bash
git tag -a plugin-v0.2.0 -m "Release Porua Browser Extension v0.2.0"
```

Verify tag was created:

```bash
git tag -l "plugin-v*"
```

### Step 3: Trigger Release

Push the tag to GitHub:

```bash
git push origin plugin-v0.2.0
```

This triggers the GitHub Actions workflow.

### Step 4: Monitor Release

#### 4.1 Watch GitHub Actions

1. Go to your repository on GitHub
2. Click "Actions" tab
3. Find the "Plugin Release" workflow run
4. Watch the progress

The workflow has two jobs:
- **create-release**: Creates the GitHub release
- **build**: Builds packages and uploads artifacts

Both jobs should complete successfully (green checkmark).

#### 4.2 Check for Errors

If any job fails:
1. Click on the failed job
2. Expand the failed step
3. Read the error message
4. See [Troubleshooting](#troubleshooting) section

### Step 5: Verify Release

#### 5.1 Check GitHub Release Page

1. Go to `https://github.com/YOUR_USERNAME/porua/releases`
2. Find `Porua Browser Extension v0.2.0`
3. Verify the release page contains:
   - ✅ Correct version number in title
   - ✅ Release notes and description
   - ✅ Auto-generated notes from commits
   - ✅ 7 attached files:
     - `porua-extension-chrome-v0.2.0.zip`
     - `porua-extension-chrome-v0.2.0.zip.sha256`
     - `porua-extension-firefox-v0.2.0.zip`
     - `porua-extension-firefox-v0.2.0.zip.sha256`
     - `porua-extension-source-v0.2.0.zip`
     - `porua-extension-source-v0.2.0.zip.sha256`
     - `SHA256SUMS`

#### 5.2 Download and Test Release Artifacts

Download a package and verify checksum:

```bash
# Download package
wget https://github.com/YOUR_USERNAME/porua/releases/download/plugin-v0.2.0/porua-extension-chrome-v0.2.0.zip

# Download checksums
wget https://github.com/YOUR_USERNAME/porua/releases/download/plugin-v0.2.0/SHA256SUMS

# Verify
sha256sum porua-extension-chrome-v0.2.0.zip
sha256sum -c SHA256SUMS
```

Test the downloaded package in browser to ensure it works.

### Step 6: Submit to Browser Stores (Optional)

#### 6.1 Chrome Web Store

1. Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your developer account
3. Click on your extension (or "New Item" for first release)
4. Click "Package" → "Upload new package"
5. Upload `porua-extension-chrome-v0.2.0.zip`
6. Update store listing:
   - Add version notes to "What's new in this version"
   - Update screenshots if UI changed
   - Update description if needed
7. Click "Submit for review"
8. Wait for review (typically 1-3 business days)

**Review process:**
- Automated checks run immediately
- Manual review may occur
- You'll be notified via email when published

#### 6.2 Firefox Add-ons (AMO)

1. Visit [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
2. Sign in with your developer account
3. Click on your add-on (or "Submit New Add-on" for first release)
4. Click "Upload New Version"
5. Upload both packages:
   - `porua-extension-firefox-v0.2.0.zip` (binary)
   - `porua-extension-source-v0.2.0.zip` (source code - required)
6. Fill in version notes
7. Submit for review
8. Wait for review (typically 1-2 weeks)

**Review process:**
- Automated validation runs
- Manual code review occurs (this is why it takes longer)
- Reviewers may ask questions or request changes
- Monitor your email and AMO dashboard

### Step 7: Post-Release Tasks

#### 7.1 Announce the Release

Consider announcing via:
- GitHub Discussions
- Project Discord/Slack
- Social media (Twitter, etc.)
- Blog post
- Email to users

Example announcement:

```
🎉 Porua Browser Extension v0.2.0 is now available!

New features:
- Feature X
- Feature Y

Download: https://github.com/YOUR_USERNAME/porua/releases/tag/plugin-v0.2.0

Chrome Web Store: [link]
Firefox Add-ons: [link]

Full changelog: https://github.com/YOUR_USERNAME/porua/blob/main/plugin/CHANGELOG.md
```

#### 7.2 Update Documentation

- Update main README if needed
- Update screenshots if UI changed
- Update any external documentation

#### 7.3 Monitor Feedback

- Watch GitHub issues for bug reports
- Monitor browser store reviews
- Respond to user questions

#### 7.4 Plan Next Release

- Create milestone for next version
- Add planned features to backlog
- Close completed issues/milestones

## Troubleshooting

### Version Mismatch Error

**Problem:** Build fails with "Version mismatch detected!"

**Solution:**
```bash
npm run version:validate  # See which files don't match
npm run version:sync      # Fix automatically
```

**Prevention:** The repository's pre-commit hook (`.githooks/pre-commit`) automatically validates version consistency when manifest files are committed.

### GitHub Actions Fails - Tests Don't Pass

**Problem:** The `build` job fails at the "Run tests" step

**Solution:**
```bash
# Run tests locally to see the error
npm test

# Fix the failing tests
# Commit the fixes
git add .
git commit -m "fix: resolve test failures"
git push origin main

# Delete and recreate the tag
git tag -d plugin-v0.2.0
git push origin :refs/tags/plugin-v0.2.0
git tag -a plugin-v0.2.0 -m "Release Porua Browser Extension v0.2.0"
git push origin plugin-v0.2.0
```

### GitHub Actions Fails - Build Error

**Problem:** The `build` job fails at the "Build extension" step

**Solution:**
```bash
# Run build locally to see the error
npm run build

# Fix the build error
# Commit and follow same process as above
```

### Cannot Push Tag - Already Exists

**Problem:** `git push origin plugin-v0.2.0` fails because tag exists

**Solution:**
```bash
# Delete remote tag
git push origin :refs/tags/plugin-v0.2.0

# Delete local tag
git tag -d plugin-v0.2.0

# Recreate tag
git tag -a plugin-v0.2.0 -m "Release Porua Browser Extension v0.2.0"

# Push again
git push origin plugin-v0.2.0
```

### Release Assets Not Uploaded

**Problem:** Release created but no files attached

**Solution:**
- Check GitHub Actions logs for upload errors
- Verify packages were created in build job
- Check repository permissions (Actions needs write access)
- Manually upload assets:
  ```bash
  gh release upload plugin-v0.2.0 plugin/packages/*.zip plugin/packages/*.sha256 plugin/packages/SHA256SUMS
  ```

### Browser Store Rejects Package

**Problem:** Chrome/Firefox rejects the uploaded package

**Common reasons:**
- Version already exists (bump version)
- Manifest errors (validate manifest)
- Missing permissions declarations
- Code policy violations

**Solution:**
- Read the rejection message carefully
- Fix the issue
- Create a new patch version
- Follow release process again

## Advanced Topics

### Pre-Release Versions

For alpha, beta, or release candidate versions:

```bash
# Create alpha release
npm run version:sync 0.2.0-alpha.1
git add plugin/manifest*.json plugin/package.json plugin/CHANGELOG.md
git commit -m "chore: bump version to 0.2.0-alpha.1"
git tag plugin-v0.2.0-alpha.1
git push origin main
git push origin plugin-v0.2.0-alpha.1
```

The workflow automatically marks releases with `-alpha`, `-beta`, or `-rc` as pre-releases on GitHub.

**Important:** Do not submit pre-release versions to public browser stores.

### Manual Release (Without CI)

If GitHub Actions is unavailable:

```bash
# 1. Build packages
npm run release

# 2. Create release manually via GitHub UI or gh CLI
gh release create plugin-v0.2.0 \
  plugin/packages/*.zip \
  plugin/packages/*.sha256 \
  plugin/packages/SHA256SUMS \
  --title "Porua Browser Extension v0.2.0" \
  --notes "Release notes here"
```

### Hotfix Release

For urgent bug fixes:

```bash
# 1. Create hotfix branch from tag
git checkout -b hotfix/0.2.1 plugin-v0.2.0

# 2. Make the fix
# ... edit files ...

# 3. Test thoroughly
npm test
npm run release

# 4. Commit fix
git add .
git commit -m "fix: critical bug in feature X"

# 5. Merge to main
git checkout main
git merge hotfix/0.2.1

# 6. Update version
npm run version:sync 0.2.1

# 7. Release
git add .
git commit -m "chore: bump version to 0.2.1"
git tag plugin-v0.2.1
git push origin main
git push origin plugin-v0.2.1

# 8. Delete hotfix branch
git branch -d hotfix/0.2.1
```

### Rolling Back a Release

If a critical issue is found after release:

**Option 1: Create a fix release (recommended)**
```bash
# Fix the issue and release new patch version
npm run version:sync 0.2.1
# ... follow normal release process
```

**Option 2: Delete the release**
```bash
# Delete GitHub release
gh release delete plugin-v0.2.0 --yes

# Delete tag
git tag -d plugin-v0.2.0
git push origin :refs/tags/plugin-v0.2.0

# Communicate to users about the rollback
```

**Option 3: Mark as broken**
- Edit GitHub release and add warning at the top
- Disable extension in browser stores (if already published)

## Related Documentation

- [PACKAGING.md](packaging/PACKAGING.md) - Detailed packaging information
- [RELEASE_CHECKLIST.md](packaging/RELEASE_CHECKLIST.md) - Complete release checklist
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [README.md](README.md) - User documentation

## Getting Help

If you encounter issues not covered here:

1. Check GitHub Actions logs for error details
2. Review closed issues for similar problems
3. Ask in project Discord/Slack
4. Open an issue with `release` label

## Changelog

- **2024-10-21**: Initial release process documentation (v0.1.0)

---

**Last updated:** 2024-10-21
**Maintainer:** Porua Development Team
