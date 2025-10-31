module.exports = {
  sourceDir: '.',
  artifactsDir: './packages',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['about:debugging'],
    keepProfileChanges: true,
    browserConsole: true,
  },
  ignoreFiles: [
    'node_modules',
    'build',
    'scripts',
    'tests',
    'packages',
    'coverage',
    '.git',
    '.packaging-temp',
    'manifest.json.bak',
    '*.md',
    'vitest.config.js',
  ],
};
