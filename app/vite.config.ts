import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Use the isolated staging catalogue until it is ready to be promoted.
  // VITE_ASSET_BASE_URL can later point to a separate image repository or CDN.
  publicDir: resolve(appDir, '../CardImporter/standalone/output/images'),
});
