#!/usr/bin/env node

/**
 * Version Sync Script
 *
 * Synchronizes version numbers across:
 * - manifest.json (source of truth)
 * - manifest.firefox.json
 * - package.json
 *
 * Usage:
 *   node sync-version.js [new-version]
 *
 * If new-version is provided, updates manifest.json first, then syncs.
 * If no version is provided, syncs from manifest.json to other files.
 */

const fs = require('fs');
const path = require('path');

// Color codes for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Read JSON file safely
 */
function readJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`${RED}✗ Failed to read ${filePath}:${RESET}`, error.message);
    process.exit(1);
  }
}

/**
 * Write JSON file safely with pretty formatting
 */
function writeJSON(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    console.error(`${RED}✗ Failed to write ${filePath}:${RESET}`, error.message);
    process.exit(1);
  }
}

/**
 * Validate version format (semver)
 */
function isValidVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  return semverRegex.test(version);
}

/**
 * Main sync function
 */
function syncVersions(newVersion = null) {
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${BLUE}Version Sync${RESET}`);
  console.log(`${BLUE}========================================${RESET}`);
  console.log('');

  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifestFirefoxPath = path.join(ROOT_DIR, 'manifest.firefox.json');
  const packagePath = path.join(ROOT_DIR, 'package.json');

  // Read all files
  const manifest = readJSON(manifestPath);
  const manifestFirefox = readJSON(manifestFirefoxPath);
  const packageJson = readJSON(packagePath);

  let sourceVersion = manifest.version;

  // If new version is provided, update manifest.json first
  if (newVersion) {
    if (!isValidVersion(newVersion)) {
      console.log(`${RED}✗ Invalid version format: ${newVersion}${RESET}`);
      console.log(`${YELLOW}Expected format: X.Y.Z or X.Y.Z-prerelease${RESET}`);
      console.log(`${YELLOW}Examples: 1.0.0, 1.2.3-alpha, 2.0.0-beta.1${RESET}`);
      console.log('');
      process.exit(1);
    }

    console.log(`${YELLOW}📝 Updating version to: ${newVersion}${RESET}\n`);
    manifest.version = newVersion;
    sourceVersion = newVersion;
    writeJSON(manifestPath, manifest);
    console.log(`${GREEN}✓ Updated manifest.json${RESET}`);
  } else {
    console.log(`${YELLOW}📖 Syncing from manifest.json: ${sourceVersion}${RESET}\n`);
  }

  // Show current versions
  console.log('Current versions:');
  console.log(`   manifest.json:          ${sourceVersion}`);
  console.log(`   manifest.firefox.json:  ${manifestFirefox.version}`);
  console.log(`   package.json:           ${packageJson.version}`);
  console.log('');

  // Update manifest.firefox.json
  let updated = false;
  if (manifestFirefox.version !== sourceVersion) {
    manifestFirefox.version = sourceVersion;
    writeJSON(manifestFirefoxPath, manifestFirefox);
    console.log(`${GREEN}✓ Updated manifest.firefox.json${RESET}`);
    updated = true;
  } else {
    console.log(`${BLUE}→ manifest.firefox.json already at ${sourceVersion}${RESET}`);
  }

  // Update package.json
  if (packageJson.version !== sourceVersion) {
    packageJson.version = sourceVersion;
    writeJSON(packagePath, packageJson);
    console.log(`${GREEN}✓ Updated package.json${RESET}`);
    updated = true;
  } else {
    console.log(`${BLUE}→ package.json already at ${sourceVersion}${RESET}`);
  }

  console.log('');

  if (updated || newVersion) {
    console.log(`${GREEN}✓ All files now at version: ${sourceVersion}${RESET}`);
    console.log('');
    console.log(`${YELLOW}Next steps:${RESET}`);
    console.log(`  1. Review the changes`);
    console.log(`  2. Commit: git add . && git commit -m "chore: bump version to ${sourceVersion}"`);
    console.log(`  3. Tag: git tag plugin-v${sourceVersion}`);
    console.log(`  4. Push: git push origin plugin-v${sourceVersion}`);
  } else {
    console.log(`${GREEN}✓ All versions already in sync!${RESET}`);
  }

  console.log('');
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${GREEN}✓ Sync complete!${RESET}`);
  console.log(`${BLUE}========================================${RESET}`);
  console.log('');
}

// Parse command line arguments
const newVersion = process.argv[2];

// Run sync
syncVersions(newVersion);
