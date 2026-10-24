import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', vercel: 'src/vercel.ts', 'scripts/import-woo': 'scripts/import-woo.ts', 'scripts/seed': 'scripts/seed.ts', 'scripts/create-admin': 'scripts/create-admin.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // workspace TS package is bundled; everything else stays external (installed from package.json)
  // sanitize-html requires the ESM-only htmlparser2 family; bundling them lets esbuild do the interop, so the API
  // runs on Node versions without require(esm) (e.g. the Vercel runtime)
  noExternal: ['@cityroyalty/shared', 'sanitize-html', /^htmlparser2/, /^dom(handler|utils|-serializer|elementtype)/, /^entities/],
  external: ['sharp', '@aws-sdk/client-s3'],
  // bundled CommonJS (sanitize-html) needs a real require for Node built-ins
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
