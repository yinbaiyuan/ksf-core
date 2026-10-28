import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react','react-dom','lucide-react','@radix-ui/react-dialog','@radix-ui/react-slot','class-variance-authority','clsx','tailwind-merge'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { manifest: true, sourcemap: false, target: 'es2022', rolldownOptions: { output: { codeSplitting: { groups: [
    // Consolidate language entry wrappers. Mermaid keeps its own lazy module
    // boundaries because diagram engines share cyclic exports.
    { name: 'code-languages', test: /\/node_modules\/(?:@codemirror\/(?:lang-|legacy-modes|language-data)|@lezer\/(?!common|lr|highlight))/, includeDependenciesRecursively: false },
  ] } } } },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1' } },
});
