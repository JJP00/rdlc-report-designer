/**
 * Idiomas soportados y resolución del idioma efectivo.
 *
 * Orden de resolución (decidido en `docs/features/0005-i18n.md`): variable de
 * entorno (`RDLC_LOCALE`, dev/QA) → preferencia guardada → idioma del SO →
 * inglés. El pseudo-idioma `qps-ploc` solo entra por entorno (herramienta de
 * desarrollo, nunca se persiste).
 */

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Idioma de los catálogos fuente: el fallback queda completo por construcción. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Pseudo-idioma de desarrollo (`RDLC_LOCALE=qps-ploc`): expansión + acentos. */
export const PSEUDO_LOCALE = 'qps-ploc';

/** Etiqueta nativa de cada idioma (para el menú «Idioma»). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Normaliza una etiqueta BCP 47 al idioma soportado (`es-ES` → `es`,
 * `es_MX` → `es`). Devuelve `null` si no es uno de los idiomas soportados.
 */
export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const language = raw.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(language) ? language : null;
}

export interface LocaleSources {
  /** Preferencia guardada por el usuario (menú Fichero → Idioma). */
  saved?: string | null;
  /** `RDLC_LOCALE`: override de desarrollo/QA (incluye `qps-ploc`). */
  env?: string | null;
  /** Idioma del sistema (`app.getLocale()` en el main). */
  system?: string | null;
}

/**
 * Idioma **efectivo** (uso interno: traducción y `<html lang>`). Puede ser
 * `qps-ploc`; en cualquier otro caso siempre es un `Locale` soportado.
 */
export function resolveEffectiveLocale(sources: LocaleSources): Locale | typeof PSEUDO_LOCALE {
  const env = sources.env?.trim().toLowerCase();
  if (env === PSEUDO_LOCALE) return PSEUDO_LOCALE;
  const fromEnv = normalizeLocale(env);
  if (fromEnv) return fromEnv;
  const fromSaved = normalizeLocale(sources.saved);
  if (fromSaved) return fromSaved;
  const fromSystem = normalizeLocale(sources.system);
  if (fromSystem) return fromSystem;
  return DEFAULT_LOCALE;
}

/**
 * Idioma **preferido** (lo que se persiste y se marca en el menú): como
 * `resolveEffectiveLocale`, pero el pseudo-idioma nunca es una preferencia.
 */
export function resolvePreferredLocale(sources: LocaleSources): Locale {
  const effective = resolveEffectiveLocale(sources);
  return effective === PSEUDO_LOCALE
    ? (normalizeLocale(sources.saved) ?? normalizeLocale(sources.system) ?? DEFAULT_LOCALE)
    : effective;
}
