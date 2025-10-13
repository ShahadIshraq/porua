#!/usr/bin/env node

const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, '.packaging-temp');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

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
 * Validate that required files exist
 */
function validateRequiredFiles() {
  const requiredFiles = [
    'manifest.json',
    'manifest.firefox.json',
    'popup.html',
    'dist/content.js',
    'icons/icon-16.png',
    'icons/icon-48.png',
    'icons/icon-128.png'
  ];

  const missing = requiredFiles.filter(file => !fs.existsSync(path.join(ROOT_DIR, file)));

  if (missing.length > 0) {
    console.error('❌ Missing required files:');
    missing.forEach(file => console.error(`   - ${file}`));
    process.exit(1);
  }
}

/**
 * Run production build
 */
function runBuild() {
  console.log('🔨 Running production build...');
  try {
    execSync('npm run build', {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
    console.log('✅ Build completed\n');
  } catch (error) {
    console.error('❌ Build failed');
    process.exit(1);
  }
}

/**
 * Copy files to temporary packaging directory
 */
async function copyFiles(tempDir, manifestFile) {
  console.log('📦 Copying files...');

  // Copy each file/directory
  for (const item of FILES_TO_INCLUDE) {
    const sourcePath = path.join(ROOT_DIR, item);
    const destPath = path.join(tempDir, item);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`⚠️  Warning: ${item} does not exist, skipping`);
      continue;
    }

    await fs.copy(sourcePath, destPath);
    console.log(`   ✓ ${item}`);
  }

  // Copy appropriate manifest
  const manifestSource = path.join(ROOT_DIR, manifestFile);
  const manifestDest = path.join(tempDir, 'manifest.json');
  await fs.copy(manifestSource, manifestDest);
  console.log(`   ✓ manifest.json (from ${manifestFile})`);

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
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      resolve(sizeInMB);
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
  const crypto = require('crypto');
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Package for Chrome
 */
async function packageChrome(version) {
  console.log('🌐 Packaging for Chrome...');

  const tempDir = path.join(TEMP_DIR, 'chrome');
  await fs.ensureDir(tempDir);
  await copyFiles(tempDir, 'manifest.json');

  const outputFile = path.join(PACKAGES_DIR, `tts-reader-chrome-v${version}.zip`);
  await fs.ensureDir(PACKAGES_DIR);

  const sizeInMB = await createZip(tempDir, outputFile);
  const checksum = generateChecksum(outputFile);

  console.log(`✅ Chrome package created: ${path.basename(outputFile)}`);
  console.log(`   Size: ${sizeInMB} MB`);
  console.log(`   SHA256: ${checksum}\n`);

  return { file: outputFile, size: sizeInMB, checksum };
}

/**
 * Package for Firefox
 */
async function packageFirefox(version) {
  console.log('🦊 Packaging for Firefox...');

  const tempDir = path.join(TEMP_DIR, 'firefox');
  await fs.ensureDir(tempDir);
  await copyFiles(tempDir, 'manifest.firefox.json');

  const outputFile = path.join(PACKAGES_DIR, `tts-reader-firefox-v${version}.zip`);
  await fs.ensureDir(PACKAGES_DIR);

  const sizeInMB = await createZip(tempDir, outputFile);
  const checksum = generateChecksum(outputFile);

  console.log(`✅ Firefox package created: ${path.basename(outputFile)}`);
  console.log(`   Size: ${sizeInMB} MB`);
  console.log(`   SHA256: ${checksum}\n`);

  return { file: outputFile, size: sizeInMB, checksum };
}

/**
 * Create source code archive for Firefox review
 */
async function createSourceArchive(version) {
  console.log('📄 Creating source code archive...');

  const outputFile = path.join(PACKAGES_DIR, `tts-reader-source-v${version}.zip`);

  // Source files to include (everything except build artifacts and dependencies)
  const sourceDir = ROOT_DIR;
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ Source archive created: ${path.basename(outputFile)}`);
      console.log(`   Size: ${sizeInMB} MB\n`);
      resolve();
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

Load the extension in your browser:
- Chrome: Load the root directory as an unpacked extension
- Firefox: Load the root directory as a temporary extension
`;

    archive.append(buildInstructions, { name: 'BUILD_INSTRUCTIONS.md' });
    archive.finalize();
  });
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
  console.log('📦 TTS Reader Extension Packager\n');
  console.log('='.repeat(50));
  console.log('');

  try {
    // Validate environment
    validateRequiredFiles();

    // Run build
    runBuild();

    // Get version
    const version = getVersion();
    console.log(`📌 Version: ${version}\n`);

    // Clean up any previous temp directory
    await cleanup();

    // Package for requested browsers
    const results = [];

    if (buildChrome) {
      results.push(await packageChrome(version));
    }

    if (buildFirefox) {
      results.push(await packageFirefox(version));
      await createSourceArchive(version);
    }

    // Clean up temp directory
    await cleanup();

    // Summary
    console.log('='.repeat(50));
    console.log('✨ Packaging complete!\n');
    console.log(`📂 Packages created in: ${PACKAGES_DIR}`);

    if (buildChrome) {
      console.log('\n🌐 Chrome Web Store:');
      console.log('   Upload the Chrome package to:');
      console.log('   https://chrome.google.com/webstore/devconsole');
    }

    if (buildFirefox) {
      console.log('\n🦊 Firefox Add-ons (AMO):');
      console.log('   Upload both the Firefox package and source archive to:');
      console.log('   https://addons.mozilla.org/developers/addon/submit/distribution');
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Packaging failed:', error.message);
    await cleanup();
    process.exit(1);
  }
}

// Run the packager
main();
