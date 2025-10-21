#!/usr/bin/env node

const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, '.packaging-temp');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

// Color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// Parse command line arguments
const args = process.argv.slice(2);
const buildChrome = !args.includes('--firefox');
const buildFirefox = !args.includes('--chrome');

// Files and directories to include in packages
const FILES_TO_INCLUDE = [
  'dist',
  'icons',
  'popup.html',
  'src/styles'
];

/**
 * Read version from manifest.json
 */
function getVersion() {
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

/**
 * Validate version consistency across all manifest files
 */
function validateVersionConsistency() {
  console.log(`${CYAN}🔍 Validating version consistency...${RESET}`);

  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifestFirefoxPath = path.join(ROOT_DIR, 'manifest.firefox.json');
  const packagePath = path.join(ROOT_DIR, 'package.json');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestFirefox = JSON.parse(fs.readFileSync(manifestFirefoxPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const manifestVersion = manifest.version;
  const manifestFirefoxVersion = manifestFirefox.version;
  const packageVersion = packageJson.version;

  console.log(`   manifest.json:          ${manifestVersion}`);
  console.log(`   manifest.firefox.json:  ${manifestFirefoxVersion}`);
  console.log(`   package.json:           ${packageVersion}`);

  if (manifestVersion !== manifestFirefoxVersion || manifestVersion !== packageVersion) {
    console.error(`\n${RED}❌ Version mismatch detected!${RESET}`);
    console.error(`${YELLOW}Run 'npm run version:validate' for details${RESET}`);
    console.error(`${YELLOW}Or run 'npm run version:sync' to fix${RESET}\n`);
    process.exit(1);
  }

  console.log(`${GREEN}✅ All versions match: ${manifestVersion}${RESET}\n`);
  return manifestVersion;
}

/**
 * Validate that required files exist
 */
function validateRequiredFiles() {
  console.log(`${CYAN}🔍 Validating required files...${RESET}`);

  const requiredFiles = [
    'manifest.json',
    'manifest.firefox.json',
    'popup.html',
    'dist/content.js',
    'dist/popup.js',
    'icons/icon-16.png',
    'icons/icon-48.png',
    'icons/icon-128.png'
  ];

  const missing = requiredFiles.filter(file => !fs.existsSync(path.join(ROOT_DIR, file)));

  if (missing.length > 0) {
    console.error(`${RED}❌ Missing required files:${RESET}`);
    missing.forEach(file => console.error(`   - ${file}`));
    console.error(`\n${YELLOW}Run 'npm run build' first${RESET}\n`);
    process.exit(1);
  }

  console.log(`${GREEN}✅ All required files present${RESET}\n`);
}

/**
 * Run production build
 */
function runBuild() {
  console.log(`${CYAN}🔨 Running production build...${RESET}`);
  try {
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    console.log(`${GREEN}✅ Build completed${RESET}\n`);
  } catch (error) {
    console.error(`${RED}❌ Build failed${RESET}`);
    process.exit(1);
  }
}

/**
 * Copy files to temporary packaging directory
 */
async function copyFiles(tempDir, manifestFile) {
  console.log(`${CYAN}📦 Copying files...${RESET}`);

  // Copy each file/directory
  for (const item of FILES_TO_INCLUDE) {
    const sourcePath = path.join(ROOT_DIR, item);
    const destPath = path.join(tempDir, item);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`${YELLOW}⚠️  Warning: ${item} does not exist, skipping${RESET}`);
      continue;
    }

    await fs.copy(sourcePath, destPath);
    console.log(`   ${GREEN}✓${RESET} ${item}`);
  }

  // Copy appropriate manifest
  const manifestSource = path.join(ROOT_DIR, manifestFile);
  const manifestDest = path.join(tempDir, 'manifest.json');
  await fs.copy(manifestSource, manifestDest);
  console.log(`   ${GREEN}✓${RESET} manifest.json (from ${manifestFile})`);

  console.log('');
}

/**
 * Create a zip archive
 */
function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeInBytes = archive.pointer();
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
      resolve({ bytes: sizeInBytes, kb: sizeInKB, mb: sizeInMB });
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Generate SHA256 checksum
 */
function generateChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Write checksum file
 */
function writeChecksumFile(filePath, checksum) {
  const fileName = path.basename(filePath);
  const checksumContent = `${checksum}  ${fileName}\n`;
  fs.writeFileSync(`${filePath}.sha256`, checksumContent, 'utf8');
}

/**
 * Display package tree
 */
function displayPackageTree(tempDir) {
  console.log(`${CYAN}📂 Package contents:${RESET}`);

  try {
    // Try to use tree command if available
    const output = execSync(`tree -L 3 ${tempDir} 2>/dev/null || find ${tempDir} -type f`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    // Format output
    const lines = output.split('\n').slice(0, 30); // Limit to 30 lines
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`   ${line.replace(tempDir, '.')}`);
      }
    });

    if (output.split('\n').length > 30) {
      console.log(`   ${YELLOW}... (output truncated)${RESET}`);
    }
  } catch (error) {
    // Fallback: simple file listing
    console.log(`   ${BLUE}→${RESET} dist/`);
    console.log(`   ${BLUE}→${RESET} icons/`);
    console.log(`   ${BLUE}→${RESET} src/styles/`);
    console.log(`   ${BLUE}→${RESET} manifest.json`);
    console.log(`   ${BLUE}→${RESET} popup.html`);
  }

  console.log('');
}

/**
 * Package for Chrome
 */
async function packageChrome(version) {
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${BLUE}🌐 Packaging for Chrome${RESET}`);
  console.log(`${BLUE}========================================${RESET}\n`);

  const tempDir = path.join(TEMP_DIR, 'chrome');
  await fs.ensureDir(tempDir);
  await copyFiles(tempDir, 'manifest.json');

  displayPackageTree(tempDir);

  const outputFile = path.join(PACKAGES_DIR, `porua-extension-chrome-v${version}.zip`);
  await fs.ensureDir(PACKAGES_DIR);

  console.log(`${CYAN}📦 Creating Chrome package...${RESET}`);
  const size = await createZip(tempDir, outputFile);
  const checksum = generateChecksum(outputFile);
  writeChecksumFile(outputFile, checksum);

  console.log(`${GREEN}✅ Chrome package created${RESET}`);
  console.log(`   File:   ${path.basename(outputFile)}`);
  console.log(`   Size:   ${size.mb} MB (${size.kb} KB)`);
  console.log(`   SHA256: ${checksum}`);
  console.log('');

  return { file: outputFile, size, checksum };
}

/**
 * Package for Firefox
 */
async function packageFirefox(version) {
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${BLUE}🦊 Packaging for Firefox${RESET}`);
  console.log(`${BLUE}========================================${RESET}\n`);

  const tempDir = path.join(TEMP_DIR, 'firefox');
  await fs.ensureDir(tempDir);
  await copyFiles(tempDir, 'manifest.firefox.json');

  displayPackageTree(tempDir);

  const outputFile = path.join(PACKAGES_DIR, `porua-extension-firefox-v${version}.zip`);
  await fs.ensureDir(PACKAGES_DIR);

  console.log(`${CYAN}📦 Creating Firefox package...${RESET}`);
  const size = await createZip(tempDir, outputFile);
  const checksum = generateChecksum(outputFile);
  writeChecksumFile(outputFile, checksum);

  console.log(`${GREEN}✅ Firefox package created${RESET}`);
  console.log(`   File:   ${path.basename(outputFile)}`);
  console.log(`   Size:   ${size.mb} MB (${size.kb} KB)`);
  console.log(`   SHA256: ${checksum}`);
  console.log('');

  return { file: outputFile, size, checksum };
}

/**
 * Create source code archive for Firefox review
 */
async function createSourceArchive(version) {
  console.log(`${BLUE}========================================${RESET}`);
  console.log(`${BLUE}📄 Creating Source Archive${RESET}`);
  console.log(`${BLUE}========================================${RESET}\n`);

  const outputFile = path.join(PACKAGES_DIR, `porua-extension-source-v${version}.zip`);

  // Source files to include (everything except build artifacts and dependencies)
  const sourceDir = ROOT_DIR;
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeInBytes = archive.pointer();
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);

      const checksum = generateChecksum(outputFile);
      writeChecksumFile(outputFile, checksum);

      console.log(`${GREEN}✅ Source archive created${RESET}`);
      console.log(`   File:   ${path.basename(outputFile)}`);
      console.log(`   Size:   ${sizeInMB} MB (${sizeInKB} KB)`);
      console.log(`   SHA256: ${checksum}`);
      console.log('');

      resolve({ file: outputFile, size: { mb: sizeInMB, kb: sizeInKB }, checksum });
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add all source files, excluding build artifacts and dependencies
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: [
        'node_modules/**',
        'dist/**',
        'packages/**',
        '.packaging-temp/**',
        '.git/**',
        '.DS_Store',
        '*.log'
      ]
    });

    // Add a BUILD_INSTRUCTIONS.md file
    const buildInstructions = `# Build Instructions

## Prerequisites
- Node.js 18 or higher
- npm 9 or higher

## Building the Extension

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Build the extension:
   \`\`\`bash
   npm run build
   \`\`\`

3. Create distribution packages:
   \`\`\`bash
   npm run package
   \`\`\`

The built extension will be in the \`dist/\` directory and packages in \`packages/\`.

## Development

For development with auto-rebuild:
\`\`\`bash
npm run dev
\`\`\`

## Testing

Run tests:
\`\`\`bash
npm test
\`\`\`

## Loading in Browser

### Chrome/Edge
1. Visit \`chrome://extensions/\`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the root directory

### Firefox
1. Visit \`about:debugging#/runtime/this-firefox\`
2. Click "Load Temporary Add-on"
3. Select any file in the root directory
`;

    archive.append(buildInstructions, { name: 'BUILD_INSTRUCTIONS.md' });
    archive.finalize();
  });
}

/**
 * Create combined checksums file
 */
function createCombinedChecksums(version) {
  console.log(`${CYAN}📝 Creating combined checksums file...${RESET}`);

  const checksumFiles = [
    `porua-extension-chrome-v${version}.zip`,
    `porua-extension-firefox-v${version}.zip`,
    `porua-extension-source-v${version}.zip`
  ];

  let combinedContent = '';

  checksumFiles.forEach(fileName => {
    const filePath = path.join(PACKAGES_DIR, fileName);
    const checksumPath = `${filePath}.sha256`;

    if (fs.existsSync(checksumPath)) {
      const checksumContent = fs.readFileSync(checksumPath, 'utf8');
      combinedContent += checksumContent;
    }
  });

  const combinedPath = path.join(PACKAGES_DIR, 'SHA256SUMS');
  fs.writeFileSync(combinedPath, combinedContent, 'utf8');

  console.log(`${GREEN}✅ Combined checksums: SHA256SUMS${RESET}\n`);
}

/**
 * Clean up temporary directory
 */
async function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    await fs.remove(TEMP_DIR);
  }
}

/**
 * Main packaging workflow
 */
async function main() {
  console.log(`${BLUE}╔════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║   Porua Extension Packager v0.1.0      ║${RESET}`);
  console.log(`${BLUE}╚════════════════════════════════════════╝${RESET}`);
  console.log('');

  try {
    // Validate environment
    const version = validateVersionConsistency();
    validateRequiredFiles();

    // Run build
    runBuild();

    console.log(`${BLUE}========================================${RESET}`);
    console.log(`${BLUE}📌 Version: ${version}${RESET}`);
    console.log(`${BLUE}========================================${RESET}\n`);

    // Clean up any previous temp directory
    await cleanup();

    // Package for requested browsers
    const results = [];

    if (buildChrome) {
      const chromeResult = await packageChrome(version);
      results.push({ browser: 'Chrome', ...chromeResult });
    }

    if (buildFirefox) {
      const firefoxResult = await packageFirefox(version);
      results.push({ browser: 'Firefox', ...firefoxResult });
      const sourceResult = await createSourceArchive(version);
      results.push({ browser: 'Source', ...sourceResult });
    }

    // Create combined checksums
    createCombinedChecksums(version);

    // Clean up temp directory
    await cleanup();

    // Summary
    console.log(`${BLUE}========================================${RESET}`);
    console.log(`${GREEN}✨ Packaging Complete!${RESET}`);
    console.log(`${BLUE}========================================${RESET}\n`);

    console.log(`${CYAN}📦 Packages created:${RESET}`);
    results.forEach(result => {
      const fileName = path.basename(result.file);
      console.log(`   ${GREEN}✓${RESET} ${fileName}`);
      console.log(`     Size: ${result.size.mb} MB`);
      console.log(`     SHA256: ${result.checksum.substring(0, 16)}...`);
      console.log('');
    });

    console.log(`${CYAN}📂 Output directory:${RESET} ${PACKAGES_DIR}\n`);

    if (buildChrome) {
      console.log(`${BLUE}🌐 Chrome Web Store:${RESET}`);
      console.log('   Upload the Chrome package to:');
      console.log(`   ${CYAN}https://chrome.google.com/webstore/devconsole${RESET}\n`);
    }

    if (buildFirefox) {
      console.log(`${BLUE}🦊 Firefox Add-ons (AMO):${RESET}`);
      console.log('   Upload both the Firefox package and source archive to:');
      console.log(`   ${CYAN}https://addons.mozilla.org/developers/addon/submit/distribution${RESET}\n`);
    }

    console.log(`${YELLOW}💡 Tip:${RESET} Verify packages with:`);
    console.log(`   cd ${PACKAGES_DIR}`);
    console.log(`   sha256sum -c SHA256SUMS`);
    console.log('');

  } catch (error) {
    console.error(`\n${RED}❌ Packaging failed:${RESET}`, error.message);
    await cleanup();
    process.exit(1);
  }
}

// Run the packager
main();
