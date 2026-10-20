import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = dirname(fileURLToPath(import.meta.url));
const frontSrc = resolve(root, '../front/src');

/**
 * Estructura del monorepo:
 *   main + preload → apps/back      renderer → apps/front
 */
export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['@rdlc-designer/contracts', '@rdlc-designer/i18n'] }),
    ],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { main: resolve(root, 'src/main.ts') },
      },
    },
  },
  preload: {
    // El sandbox de Electron no admite ESM ni `require` de `node_modules`:
    // el preload se emite en CommonJS y con todo bundleado (T2).
    plugins: [externalizeDepsPlugin({ exclude: ['@rdlc-designer/contracts', 'zod'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { preload: resolve(root, 'src/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(root, '../front'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': frontSrc,
      },
    },
    build: {
      outDir: resolve(root, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(root, '../front/index.html') },
      },
    },
  },
});
