import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Headers of the `/*` block in public/_headers, so Playwright runs under the production CSP. */
function productionHeaders(): Record<string, string> {
  const text = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8');
  const headers: Record<string, string> = {};
  let inBlock = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) { inBlock = line.trim() === '/*'; continue; }
    const i = line.indexOf(':');
    if (inBlock && i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { headers: productionHeaders() },
  build: { outDir: 'dist', emptyOutDir: true },
});
