import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', vercel: 'src/vercel.ts', 'scripts/import-woo': 'scripts/import-woo.ts', 'scripts/seed': 'scripts/seed.ts', 'scripts/create-admin': 'scripts/create-admin.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // workspace TS package is bundled; everything else stays external (installed from package.json)
  noExternal: ['@cityroyalty/shared'],
  external: ['sharp', '@aws-sdk/client-s3'],
});
