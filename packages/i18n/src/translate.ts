/**
 * Traducción: wrapper fino sobre `intl-messageformat` (ICU MessageFormat).
 *
 * - El catálogo EN es la fuente; cualquier clave ausente cae a EN y, si
 *   tampoco existe, se registra y se devuelve la propia clave (nunca un crash
 *   en producción).
 * - Mensajes ICU con plurales reales (`{n, plural, one {…} other {…}}`),
 *   `select` e interpolación. `Intl.PluralRules` de Electron da las reglas CLDR.
 * - Convención de catálogo: las comillas simples literales se escriben `''`
 *   (p. ej. `No existe el elemento ''{id}''`); el test de paridad verifica que
 *   toda interpolación se sustituye de verdad.
 */
import { IntlMessageFormat } from 'intl-messageformat';
import { lookup, type CatalogKey, type CatalogShape } from './catalog.js';
import { en } from './catalogs/en/index.js';
import { es } from './catalogs/es/index.js';
import { DEFAULT_LOCALE, normalizeLocale, PSEUDO_LOCALE, type Locale } from './locale.js';
import { pseudoCatalog } from './pseudo.js';

export type MessageParams = Record<string, string | number>;

export interface Translator {
  /** Idioma efectivo del traductor (`qps-ploc` en la pasada pseudo). */
  readonly locale: Locale | typeof PSEUDO_LOCALE;
  /** Traduce una clave del catálogo fuente con parámetros ICU. */
  t(key: CatalogKey, params?: MessageParams): string;
  /** `true` si la clave existe en ES o EN (para claves dinámicas). */
  has(key: string): boolean;
  /**
   * Traducción de una clave construida en runtime (p. ej. el `reason` de un
   * error): `undefined` si no existe en el catálogo del idioma ni en EN.
   */
  tUnsafe(key: string, params?: MessageParams): string | undefined;
}

const CATALOGS: Record<Locale, CatalogShape<typeof en>> = { en, es };
const PSEUDO = pseudoCatalog(en);

/** Caché de formateadores por idioma y mensaje (se construyen una vez). */
const FORMATTER_CACHE = new Map<string, Map<string, IntlMessageFormat>>();

/**
 * Mensajes sin ICU ni comillas escapadas se devuelven tal cual (camino
 * rápido); el resto pasa por `intl-messageformat`.
 */
function isPlain(message: string): boolean {
  return !message.includes('{') && !message.includes("'");
}

function formatterFor(locale: string, message: string): IntlMessageFormat {
  let cache = FORMATTER_CACHE.get(locale);
  if (!cache) {
    cache = new Map<string, IntlMessageFormat>();
    FORMATTER_CACHE.set(locale, cache);
  }
  const cached = cache.get(message);
  if (cached) return cached;
  const formatter = new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
  cache.set(message, formatter);
  return formatter;
}

function format(locale: string, message: string, params?: MessageParams): string {
  if (isPlain(message)) return message;
  try {
    // `IntlMessageFormat#format` acepta `string | number | Date` por valor.
    return formatterFor(locale, message).format(params ?? {}) as string;
  } catch (error) {
    console.error(`[i18n] mensaje ICU inválido (${locale}): ${message}`, error);
    return message;
  }
}

function makeTranslator(
  locale: Locale | typeof PSEUDO_LOCALE,
  messages: CatalogShape<typeof en>,
): Translator {
  // El pseudo-idioma formatea con las reglas de plural de `en`: su catálogo es
  // una transformación del inglés.
  const formatLocale = locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;

  const tUnsafe = (key: string, params?: MessageParams): string | undefined => {
    const source = lookup(messages, key) ?? lookup(en, key);
    if (source === undefined) return undefined;
    return format(formatLocale, source, params);
  };

  return {
    locale,
    t: (key, params) => {
      const message = tUnsafe(key, params);
      if (message === undefined) {
        console.error(`[i18n] clave inexistente: ${key}`);
        return key;
      }
      return message;
    },
    has: (key) => lookup(messages, key) !== undefined || lookup(en, key) !== undefined,
    tUnsafe,
  };
}

/** Traductor de un idioma soportado (incluida la pasada pseudo en dev). */
export function createTranslator(locale: Locale | typeof PSEUDO_LOCALE): Translator {
  if (locale === PSEUDO_LOCALE) return makeTranslator(PSEUDO_LOCALE, PSEUDO);
  return makeTranslator(locale, CATALOGS[locale] ?? en);
}

/**
 * Traducción desde una etiqueta cruda (preferencia, `app.getLocale()`,
 * `RDLC_LOCALE`): normaliza y cae a EN si no se reconoce.
 */
export function createTranslatorFor(raw: string | null | undefined): Translator {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed === PSEUDO_LOCALE) return createTranslator(PSEUDO_LOCALE);
  return createTranslator(normalizeLocale(trimmed) ?? DEFAULT_LOCALE);
}

/** Convención de los mensajes de error: `errors.<reason>` y `errors.fallback.<code>`. */
export const ERROR_REASON_PREFIX = 'errors.';
export const ERROR_FALLBACK_PREFIX = 'errors.fallback.';

/**
 * Compone el mensaje visible de un error del dominio: `reason` → catálogo, y si
 * no hay traducción para el motivo, el fallback por código. `undefined` si no
 * hay ninguno (el llamante decide: mensaje crudo, genérico…).
 */
export function translateError(
  t: Translator,
  error: { reason?: string; code?: string },
  params?: MessageParams,
): string | undefined {
  if (error.reason) {
    const byReason = t.tUnsafe(`${ERROR_REASON_PREFIX}${error.reason}`, params);
    if (byReason !== undefined) return byReason;
  }
  if (error.code) return t.tUnsafe(`${ERROR_FALLBACK_PREFIX}${error.code}`, params);
  return undefined;
}
