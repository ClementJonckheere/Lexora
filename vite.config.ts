/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    // Aperçu navigateur : Gutendex et Project Gutenberg n'autorisent pas les requêtes directes (CORS).
    proxy: {
      '/proxy/gutendex': { target: 'https://gutendex.com', changeOrigin: true, followRedirects: true, rewrite: (p) => p.replace(/^\/proxy\/gutendex/, '') },
      '/proxy/mymemory': { target: 'https://api.mymemory.translated.net', changeOrigin: true, rewrite: (p) => p.replace(/^\/proxy\/mymemory/, '') },
      '/proxy/deepl-free': { target: 'https://api-free.deepl.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/proxy\/deepl-free/, '') },
      '/proxy/deepl': { target: 'https://api.deepl.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/proxy\/deepl/, '') },
      '/proxy/tatoeba': { target: 'https://tatoeba.org', changeOrigin: true, followRedirects: true, rewrite: (p) => p.replace(/^\/proxy\/tatoeba/, '') },
      '/proxy/gutenberg': { target: 'https://www.gutenberg.org', changeOrigin: true, followRedirects: true, rewrite: (p) => p.replace(/^\/proxy\/gutenberg/, '') },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
