/**
 * `@rdlc-designer/i18n` — i18n compartida por main y renderer.
 *
 * - Catálogos ICU (EN fuente, ES) con claves tipadas derivadas del EN.
 * - `createTranslator(locale)` / `createTranslatorFor(raw)`: único mecanismo
 *   de traducción en main (diálogos nativos, logs) y renderer (UI).
 * - `resolvePreferredLocale` / `resolveEffectiveLocale`: preferencia guardada →
 *   idioma del SO → EN, con override de desarrollo (`RDLC_LOCALE`).
 * - Pseudo-idioma (`qps-ploc`) para la pasada de layout.
 *
 * El binding React vive en `@rdlc-designer/i18n/react`.
 */
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  normalizeLocale,
  PSEUDO_LOCALE,
  resolveEffectiveLocale,
  resolvePreferredLocale,
  type Locale,
  type LocaleSources,
} from './locale.js';
export {
  lookup,
  walkKeys,
  type CatalogKey,
  type CatalogShape,
  type MessageKey,
} from './catalog.js';
export {
  createTranslator,
  createTranslatorFor,
  ERROR_FALLBACK_PREFIX,
  ERROR_REASON_PREFIX,
  translateError,
  type MessageParams,
  type Translator,
} from './translate.js';
export { en } from './catalogs/en/index.js';
export { es } from './catalogs/es/index.js';
