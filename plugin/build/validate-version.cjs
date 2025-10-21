#!/usr/bin/env node

/**
 * Version Validation Script
 *
 * Validates that version numbers are consistent across:
 * - manifest.json
 * - manifest.firefox.json
 * - package.json
 *
 * Exits with error code 1 if versions don't match.
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
 * Main validation function
 */
function validateVersions() {
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${BLUE}Version Validation${RESET}`);
  console.log(`${BLUE}========================================${RESET}`);
  console.log('');

  // Read version from each file
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifestFirefoxPath = path.join(ROOT_DIR, 'manifest.firefox.json');
  const packagePath = path.join(ROOT_DIR, 'package.json');

  console.log('📖 Reading version numbers...\n');

  const manifest = readJSON(manifestPath);
  const manifestFirefox = readJSON(manifestFirefoxPath);
  const packageJson = readJSON(packagePath);

  const manifestVersion = manifest.version;
  const manifestFirefoxVersion = manifestFirefox.version;
  const packageVersion = packageJson.version;

  // Display versions
  console.log(`   manifest.json:          ${manifestVersion}`);
  console.log(`   manifest.firefox.json:  ${manifestFirefoxVersion}`);
  console.log(`   package.json:           ${packageVersion}`);
  console.log('');

  // Check if all versions match
  const allMatch =
    manifestVersion === manifestFirefoxVersion &&
    manifestVersion === packageVersion;

  if (allMatch) {
    console.log(`${GREEN}✓ All versions match: ${manifestVersion}${RESET}`);
    console.log('');
    console.log(`${BLUE}========================================${RESET}`);
    console.log(`${GREEN}✓ Validation passed!${RESET}`);
    console.log(`${BLUE}========================================${RESET}`);
    console.log('');
    process.exit(0);
  } else {
    console.log(`${RED}✗ Version mismatch detected!${RESET}\n`);

    // Show specific mismatches
    if (manifestVersion !== manifestFirefoxVersion) {
      console.log(`${RED}  ✗ manifest.json (${manifestVersion}) ≠ manifest.firefox.json (${manifestFirefoxVersion})${RESET}`);
    }
    if (manifestVersion !== packageVersion) {
      console.log(`${RED}  ✗ manifest.json (${manifestVersion}) ≠ package.json (${packageVersion})${RESET}`);
    }
    if (manifestFirefoxVersion !== packageVersion) {
      console.log(`${RED}  ✗ manifest.firefox.json (${manifestFirefoxVersion}) ≠ package.json (${packageVersion})${RESET}`);
    }

    console.log('');
    console.log(`${YELLOW}To fix this, update all version numbers to match:${RESET}`);
    console.log(`  1. Edit manifest.json`);
    console.log(`  2. Edit manifest.firefox.json`);
    console.log(`  3. Edit package.json`);
    console.log('');
    console.log(`${YELLOW}Or use the sync script:${RESET}`);
    console.log(`  npm run version:sync`);
    console.log('');
    console.log(`${BLUE}========================================${RESET}`);
    console.log(`${RED}✗ Validation failed!${RESET}`);
    console.log(`${BLUE}========================================${RESET}`);
    console.log('');
    process.exit(1);
  }
}

// Run validation
validateVersions();
