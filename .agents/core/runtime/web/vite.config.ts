import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { manifest: true, sourcemap: false, target: 'es2022' },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:4173' } },
});
