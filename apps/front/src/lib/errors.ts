/**
 * Mensajes de error de la API para el usuario (borde de traducción, fase 2 de
 * i18n): el backend manda `code` + `reason` + `params` y aquí se compone el
 * texto visible con el catálogo del idioma vigente.
 *
 * El banner muestra el motivo traducido y, cuando el backend adjunta detalles
 * (`data`: p. ej. los problemas del XSD al guardar), se listan debajo para que
 * se puedan leer y copiar. `message` (diagnóstico en inglés) solo se usa si el
 * motivo no tiene traducción; el código (`E_...`) queda para los logs.
 */
import { translateError, type MessageParams, type Translator } from '@rdlc-designer/i18n';

export interface ApiErrorLike {
  code?: string;
  reason?: string;
  params?: MessageParams;
  message?: string;
  data?: unknown;
}

export function apiErrorMessage(
  result: ApiErrorLike,
  translator: Translator,
  fallback: string,
): string {
  const translated = translateError(translator, result, result.params);
  const fromApi = result.message?.trim();
  const message = translated ?? (fromApi || fallback);
  const details = errorDetails(result.data);
  if (details.length === 0) return message;
  return [message, ...details.map((detail) => `• ${detail}`)].join('\n');
}

/** Detalles de error que se pueden mostrar: hoy, listas de textos (XSD). */
function errorDetails(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/** true si el mensaje trae detalle multilínea (merece quedarse en pantalla). */
export function hasErrorDetails(message: string): boolean {
  return message.includes('\n');
}

/**
 * true si el error exige una acción del usuario (leer un aviso largo, resolver
 * un conflicto, revisar el disco): los avisos con estos códigos no se borran
 * solos (BUG-57).
 */
export function isPersistentErrorCode(code: string): boolean {
  return code === 'E_UNSUPPORTED_SCHEMA' || code === 'E_CONFLICT' || code === 'E_IO';
}
