/**
 * Composición del mensaje de un error de dominio **fuera** del renderer
 * (logs del main, MCP): usa el catálogo del idioma indicado y cae al inglés.
 *
 * El MCP mantiene inglés estable para agentes (decisión de
 * `docs/features/0005-i18n.md`): siempre `describeError(error)` sin locale.
 */
import { createTranslator, createTranslatorFor, translateError } from '@rdlc-designer/i18n';
import type { DomainError } from './domainError.js';

/** Mensaje del error en el idioma del traductor (por defecto, inglés). */
export function describeError(error: DomainError, locale = 'en'): string {
  const t = createTranslatorFor(locale);
  return (
    translateError(t, error, error.params as Record<string, string | number> | undefined) ??
    createTranslator('en').tUnsafe(`errors.fallback.${error.code}`) ??
    error.code
  );
}
