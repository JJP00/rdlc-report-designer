import { defineConfig } from '@playwright/test';

/**
 * E2E del diseñador sobre la app Electron real (Playwright `_electron`).
 * El `webServer` no aplica: el spec lanza el binario con `out/` ya construido
 * (`pnpm e2e` compila antes). Un solo worker: la app abre una ventana.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
