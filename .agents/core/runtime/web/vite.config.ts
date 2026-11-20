import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mermaidCSPPlugin } from '../../applications/sdk/server/mermaid-csp.mjs';
export default defineConfig({
  plugins: [mermaidCSPPlugin(), react(), tailwindcss()],
  resolve: { dedupe: ['react','react-dom','lucide-react','@radix-ui/react-dialog','@radix-ui/react-slot','class-variance-authority','clsx','tailwind-merge','react-markdown','remark-gfm','remark-math','rehype-sanitize','rehype-katex','rehype-highlight','katex','highlight.js','mermaid','dompurify'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { manifest: true, sourcemap: false, target: 'es2022', rolldownOptions: { preserveEntrySignatures: 'allow-extension', input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
  }, output: { codeSplitting: { groups: [
    // Consolidate language entry wrappers. Mermaid keeps its own lazy module
    // boundaries because diagram engines share cyclic exports.
    { name: 'code-languages', test: /\/node_modules\/(?:@codemirror\/(?:lang-|legacy-modes|language-data)|@lezer\/(?!common|lr|highlight))/, includeDependenciesRecursively: false },
  ] } } } },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1' } },
});
