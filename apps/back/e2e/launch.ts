/**
 * Entorno de lanzamiento de la app en los E2E: fija el idioma a **ES**, el de
 * los selectores de la suite.
 *
 * El idioma por defecto de la app es el del SO (`app.getLocale()`): en CI
 * (en-US) la UI saldría en inglés y media suite no encontraría sus textos. La
 * pasada EN tendrá su propia suite (fase 4 de `docs/features/0005-i18n.md`).
 */
export function appEnv(): Record<string, string> {
  return { ...process.env, RDLC_LOCALE: 'es' } as Record<string, string>;
}
