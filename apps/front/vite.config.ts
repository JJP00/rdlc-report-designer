import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Dev standalone del renderer en navegador (`vite` en este paquete).
 *  La app real (Electron) usa la config de `apps/back/electron.vite.config.ts`. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
