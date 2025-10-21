# Porua Browser Extension - Release Checklist

Use this checklist when preparing a new release to ensure all steps are completed correctly.

## Pre-Release Preparation

### 1. Code Quality

- [ ] All planned features are implemented and tested
- [ ] Code is reviewed (if working with team)
- [ ] All TODO comments are addressed or documented
- [ ] No debug/console.log statements in production code
- [ ] Code follows project style guidelines

### 2. Testing

- [ ] Run full test suite: `npm test`
  ```bash
  cd plugin
  npm test
  ```
- [ ] All tests pass with no warnings
- [ ] Test coverage is acceptable: `npm run test:coverage`
- [ ] Manual testing completed:
  - [ ] Chrome - Load unpacked extension and test features
  - [ ] Firefox - Load temporary add-on and test features
  - [ ] Test TTS playback functionality
  - [ ] Test settings/configuration panel
  - [ ] Test on sample websites
  - [ ] Verify server connection works
  - [ ] Test error handling (server offline, network errors)

### 3. Version Update

- [ ] Decide on new version number (follow semantic versioning)
  - **Patch** (0.1.X): Bug fixes, minor changes
  - **Minor** (0.X.0): New features, backwards compatible
  - **Major** (X.0.0): Breaking changes

- [ ] Update version using sync script:
  ```bash
  cd plugin
  npm run version:sync 0.X.X
  ```

- [ ] Verify version consistency:
  ```bash
  npm run version:validate
  ```

- [ ] Confirm versions match in:
  - [ ] `manifest.json`
  - [ ] `manifest.firefox.json`
  - [ ] `package.json`

### 4. Documentation

- [ ] Update `CHANGELOG.md` with changes for this version
  - [ ] Added features
  - [ ] Fixed bugs
  - [ ] Changed behavior
  - [ ] Deprecated features
  - [ ] Removed features
  - [ ] Security fixes

- [ ] Update `README.md` if needed:
  - [ ] New features documented
  - [ ] Installation instructions current
  - [ ] Configuration options updated
  - [ ] Screenshots updated (if UI changed)

- [ ] Review and update inline documentation/comments

### 5. Build and Package

- [ ] Clean previous builds:
  ```bash
  cd plugin
  rm -rf dist packages .packaging-temp
  ```

- [ ] Run full release build:
  ```bash
  npm run release
  ```

- [ ] Verify build succeeds with no errors

- [ ] Check package contents:
  ```bash
  cd packages
  ls -lh
  ```

- [ ] Expected files present:
  - [ ] `porua-extension-chrome-v0.X.X.zip`
  - [ ] `porua-extension-chrome-v0.X.X.zip.sha256`
  - [ ] `porua-extension-firefox-v0.X.X.zip`
  - [ ] `porua-extension-firefox-v0.X.X.zip.sha256`
  - [ ] `porua-extension-source-v0.X.X.zip`
  - [ ] `porua-extension-source-v0.X.X.zip.sha256`
  - [ ] `SHA256SUMS`

- [ ] Verify checksums:
  ```bash
  sha256sum -c SHA256SUMS
  ```

### 6. Local Testing of Packages

- [ ] Test Chrome package:
  ```bash
  # Extract zip
  cd /tmp
  unzip /path/to/porua-extension-chrome-v0.X.X.zip -d chrome-test

  # Load in Chrome
  # 1. Visit chrome://extensions/
  # 2. Enable "Developer mode"
  # 3. Click "Load unpacked"
  # 4. Select chrome-test directory
  # 5. Test all features
  ```

- [ ] Test Firefox package:
  ```bash
  # Firefox can load zip directly
  # 1. Visit about:debugging#/runtime/this-firefox
  # 2. Click "Load Temporary Add-on"
  # 3. Select the firefox zip file
  # 4. Test all features
  ```

- [ ] Core features work in both browsers:
  - [ ] Extension loads without errors
  - [ ] UI renders correctly
  - [ ] TTS playback works
  - [ ] Settings persist
  - [ ] Server connection established

### 7. Git and Repository

- [ ] All changes committed:
  ```bash
  git status  # Should show clean working directory
  ```

- [ ] Create commit for version bump:
  ```bash
  git add plugin/manifest*.json plugin/package.json plugin/CHANGELOG.md
  git commit -m "chore: bump plugin version to 0.X.X"
  ```

- [ ] Push to remote:
  ```bash
  git push origin main
  # Or push to your feature branch first
  ```

- [ ] Ensure CI tests pass on main branch

## Release Execution

### 8. Create Release Tag

- [ ] Create annotated tag:
  ```bash
  git tag -a plugin-v0.X.X -m "Release Porua Browser Extension v0.X.X"
  ```

- [ ] Verify tag was created:
  ```bash
  git tag -l "plugin-v*"
  ```

- [ ] Push tag to trigger release:
  ```bash
  git push origin plugin-v0.X.X
  ```

### 9. Monitor GitHub Actions

- [ ] Go to GitHub Actions tab
- [ ] Watch "Plugin Release" workflow run
- [ ] Verify all jobs succeed:
  - [ ] `create-release` job completes
  - [ ] `build` job completes
- [ ] Check for any errors or warnings

### 10. Verify Release

- [ ] Go to GitHub Releases page
- [ ] Locate new release `plugin-v0.X.X`
- [ ] Verify release contains:
  - [ ] Correct version number in title
  - [ ] Release notes with description
  - [ ] Auto-generated notes from commits
  - [ ] All 7 asset files attached:
    - 3 zip files (chrome, firefox, source)
    - 3 sha256 files
    - 1 SHA256SUMS file

- [ ] Download and verify an artifact:
  ```bash
  # Download chrome package
  wget https://github.com/USER/REPO/releases/download/plugin-v0.X.X/porua-extension-chrome-v0.X.X.zip

  # Download checksums
  wget https://github.com/USER/REPO/releases/download/plugin-v0.X.X/SHA256SUMS

  # Verify
  sha256sum -c SHA256SUMS
  ```

- [ ] Test installing from GitHub release artifacts

## Post-Release

### 11. Browser Store Submission (Optional)

#### Chrome Web Store

- [ ] Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] Select your extension (or create new item)
- [ ] Upload `porua-extension-chrome-v0.X.X.zip`
- [ ] Update store listing:
  - [ ] Version notes/changelog
  - [ ] Screenshots (if changed)
  - [ ] Description (if changed)
- [ ] Submit for review
- [ ] Monitor review status
- [ ] Respond to any review feedback

#### Firefox Add-ons (AMO)

- [ ] Visit [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
- [ ] Select your add-on (or submit new add-on)
- [ ] Upload `porua-extension-firefox-v0.X.X.zip`
- [ ] Upload `porua-extension-source-v0.X.X.zip`
- [ ] Update listing:
  - [ ] Version notes/changelog
  - [ ] Screenshots (if changed)
  - [ ] Description (if changed)
- [ ] Submit for review
- [ ] Monitor review status (can take 1-2 weeks)
- [ ] Respond to reviewer questions/requests

### 12. Communication

- [ ] Update project README with new version info
- [ ] Announce release (if applicable):
  - [ ] Project Discord/Slack
  - [ ] Twitter/social media
  - [ ] Blog post
  - [ ] Email newsletter
- [ ] Update documentation website (if exists)
- [ ] Close related GitHub issues/milestones

### 13. Monitoring

- [ ] Monitor for bug reports:
  - [ ] GitHub issues
  - [ ] Browser store reviews
  - [ ] User feedback channels

- [ ] Check metrics:
  - [ ] Download counts
  - [ ] Active users (from browser stores)
  - [ ] Error reports

### 14. Cleanup

- [ ] Local cleanup:
  ```bash
  cd plugin
  rm -rf .packaging-temp
  # Keep packages directory for reference
  ```

- [ ] Archive old releases (if needed)
- [ ] Update issue tracker:
  - [ ] Close resolved issues
  - [ ] Update milestone
  - [ ] Plan next release

## Emergency Rollback

If critical issues are discovered after release:

### Option 1: Quick Patch

- [ ] Fix the issue
- [ ] Create patch version (0.X.Y+1)
- [ ] Follow release process for patch
- [ ] Mark previous version as "yanked" if severe

### Option 2: Revert Release

- [ ] Delete GitHub release tag:
  ```bash
  git tag -d plugin-v0.X.X
  git push origin :refs/tags/plugin-v0.X.X
  ```

- [ ] Delete GitHub release via web UI
- [ ] Communicate issue to users
- [ ] Fix and re-release with new version

### Option 3: Store Removal

- [ ] Request urgent review from Chrome/Firefox
- [ ] Temporarily disable extension in stores
- [ ] Fix and resubmit

## Version-Specific Notes

### v0.1.0 (Initial Release)

- [ ] First public release checklist items:
  - [ ] Privacy policy in place (if needed)
  - [ ] License file included
  - [ ] Contributing guidelines available
  - [ ] Code of conduct published
  - [ ] Issue templates created
  - [ ] Pull request template created

### Pre-Release Versions (alpha, beta, rc)

- [ ] Tag format: `plugin-v0.X.X-alpha.Y`
- [ ] Mark as "pre-release" in GitHub
- [ ] Add warning in release notes
- [ ] Limited distribution (testers only)
- [ ] Do not submit to public stores

## Checklist Summary

**Before tagging:**
- ✅ Tests pass
- ✅ Version updated
- ✅ CHANGELOG updated
- ✅ Packages built and tested locally
- ✅ Changes committed and pushed

**After tagging:**
- ✅ GitHub Actions succeeds
- ✅ Release artifacts verified
- ✅ Store submissions completed (optional)
- ✅ Documentation updated
- ✅ Users notified

---

**Last updated:** 2024-10-21 (for v0.1.0)

**Notes:**
- This checklist should be updated as the release process evolves
- Add version-specific notes for each release
- Review and improve based on lessons learned
