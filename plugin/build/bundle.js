import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: {
    'content': join(rootDir, 'src/content/index.js'),
    'popup': join(rootDir, 'src/popup/index.js'),
    'background': join(rootDir, 'src/background/service-worker.js')
  },
  bundle: true,
  outdir: join(rootDir, 'dist'),
  format: 'iife',
  target: 'chrome96',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  loader: {
    '.css': 'css'
  }
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
