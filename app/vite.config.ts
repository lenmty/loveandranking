import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/loveandranking/',
  plugins: [react()],
  // Images live outside the app so this directory can move to its own repository.
  // VITE_ASSET_BASE_URL can point to that repository or a CDN when needed.
  publicDir: resolve(appDir, '../assets/memories'),
});
