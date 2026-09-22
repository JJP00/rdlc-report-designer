/**
 * Ganchos de diagnóstico en `window` para los E2E (Playwright): selección,
 * tiradores, separadores de la rejilla y proyección viva.
 *
 * Se publican en desarrollo y en el build `--mode e2e`; en el build de
 * producción no existen.
 */
export const TEST_HOOKS_ENABLED = import.meta.env.MODE !== 'production';
