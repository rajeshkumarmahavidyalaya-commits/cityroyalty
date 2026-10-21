// Production build:  npm run build            -> dist/            (deploy this)
//                    npm run build:artifact   -> dist-artifact/   (page fragment + models embedded, for hosts that only serve web file types)
//
// What it does: bundles and tree-shakes the app with three.js into ONE minified, content-hashed JS file, minifies the
// CSS, copies assets/, and rewrites index.html (no import map, preload hints, hashed URLs). Source files stay readable
// and runnable without a build (`npm start`).
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = process.argv.includes('--artifact');
const out = join(root, artifact ? 'dist-artifact' : 'dist');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/* ---------- JavaScript ---------- */
const swapModelSource = {
  name: 'embedded-models',
  setup(b) {
    if (!artifact) return;
    b.onResolve({ filter: /model-source\.js$/ }, () => ({ path: join(root, 'js/model-source.embedded.js') }));
  },
};
const result = await build({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  splitting: artifact, // artifact: the second jacket lives in its own lazily loaded chunk
  outdir: join(out, 'js'),
  entryNames: 'app-[hash]',
  chunkNames: 'chunk-[hash]',
  legalComments: 'none',
  alias: { three: createRequire(import.meta.url).resolve('three/build/three.module.js') },
  loader: { '.glb': 'base64' },
  plugins: [swapModelSource],
  metafile: true,
  logLevel: 'warning',
});
const entry = Object.keys(result.metafile.outputs).find((f) => result.metafile.outputs[f].entryPoint);
const jsFile = relative(out, resolve(root, entry)).replace(/\\/g, '/');

/* ---------- CSS ---------- */
const css = await transform(readFileSync(join(root, 'css/style.css'), 'utf8'), { loader: 'css', minify: true });
const cssName = `css/app-${hash(css.code)}.css`;
mkdirSync(join(out, 'css'), { recursive: true });
writeFileSync(join(out, cssName), css.code); // url(../assets/...) still resolves: css/ and assets/ keep their relative layout

/* ---------- assets ---------- */
cpSync(join(root, 'assets'), join(out, 'assets'), {
  recursive: true,
  filter: (src) => !(artifact && src.endsWith('.glb')), // artifact: models are embedded in JS chunks instead
});

/* ---------- HTML ---------- */
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('<link rel="stylesheet" href="css/style.css">', `<link rel="stylesheet" href="${cssName}">\n  <link rel="modulepreload" href="${jsFile}">`)
  .replace('<script type="module" src="js/main.js"></script>', `<script type="module" src="${jsFile}"></script>`)
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .replace(/\n\s+/g, '\n');
if (artifact) {
  // the host wraps the page in its own document: keep only what belongs inside it
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/\s*<meta charset[^>]*>/, '').replace(/\s*<meta name="viewport"[^>]*>/, '')
    .replace(/\s*<meta name="theme-color"[^>]*>/, '').replace(/\s*<link rel="icon"[^>]*>/, '')
    .replace(/\s*<link rel="preload" as="fetch"[^>]*>/, '') // no .glb to preload: models are embedded
    .replace(/<title>[\s\S]*?<\/title>/, '<title>City Royalty</title>');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}
writeFileSync(join(out, artifact ? 'city-royalty.html' : 'index.html'), html);

/* ---------- report ---------- */
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(out).map((f) => relative(out, f).replace(/\\/g, '/')).sort();
const kb = (f) => (statSync(join(out, f)).size / 1024).toFixed(0).padStart(5);
console.log(`\n${artifact ? 'artifact' : 'production'} build -> ${relative(root, out)}/  (${files.length} files)`);
for (const f of files.filter((x) => /^(js|css)\//.test(x) || x.endsWith('.html'))) console.log(`${kb(f)} KB  ${f}`);
writeFileSync(join(out, '.files.json'), JSON.stringify(files.filter((f) => f !== '.files.json' && !f.endsWith('.html'))));
