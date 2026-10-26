// Construit www/ : l'interface web + la conversion embarquée pour l'APK Android.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const out = 'www';
await rm(out, { recursive: true, force: true });
await cp('public', out, { recursive: true });
await mkdir(`${out}/vendor/marked`, { recursive: true });
await cp('node_modules/marked/lib/marked.umd.js', `${out}/vendor/marked/marked.umd.js`);

await build({
  entryPoints: ['src/browser.js'],
  outfile: `${out}/url2mark.bundle.js`,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  minify: true,
  legalComments: 'none',
  banner: { js: '/* url2mark — signé michben */' },
});

const index = `${out}/index.html`;
const html = await readFile(index, 'utf8');
await writeFile(index, html.replace('<script src="app.js"></script>', '<script src="url2mark.bundle.js"></script>\n  <script src="app.js"></script>'));
console.log('www/ prêt pour Capacitor');
