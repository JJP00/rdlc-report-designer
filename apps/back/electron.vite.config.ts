import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Estructura del monorepo:
 *   main + preload → apps/back      renderer → apps/front
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@rdlc-designer/contracts'] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { main: resolve(root, 'src/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@rdlc-designer/contracts'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { preload: resolve(root, 'src/preload.ts') },
      },
    },
  },
  renderer: {
    root: resolve(root, '../front'),
    plugins: [react()],
    build: {
      outDir: resolve(root, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(root, '../front/index.html') },
      },
    },
  },
});
