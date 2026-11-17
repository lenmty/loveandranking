import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Keep the image catalogue separate from the app source. It can later be
  // replaced by a CDN URL through VITE_ASSET_BASE_URL.
  publicDir: resolve(appDir, '../assets/memories'),
});
