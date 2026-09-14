import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      // Necesario para medir memoria retenida con precisión en el test diagnóstico.
      forks: { execArgv: ['--expose-gc'] },
    },
  },
});
