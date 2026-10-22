import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...next,
  ...coreWebVitals,
  ...typescript,
  globalIgnores(['**/.next/**', '**/.next-*/**', '**/dist/**', '**/node_modules/**', 'apps/showcase/**', 'apps/web/src/three/**', 'apps/api/**', 'packages/**', 'e2e/**']),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      // Client-only hydration from localStorage / cookies and fetch-on-mount legitimately set state in effects.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // admin thumbnails are already-optimised CDN renditions behind auth; next/image adds nothing there
    files: ['apps/admin/**'],
    rules: { '@next/next/no-img-element': 'off' },
  },
]);
