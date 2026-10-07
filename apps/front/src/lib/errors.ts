/**
 * Mensajes de error de la API para el usuario. El banner muestra el motivo
 * (`message`) y, cuando el backend adjunta detalles (`data`: p. ej. los
 * problemas del XSD al guardar), se listan debajo para que se puedan leer y
 * copiar. El código (`E_...`) queda para los logs de diagnóstico.
 */
export function apiErrorMessage(
  result: { message?: string; data?: unknown },
  fallback: string,
): string {
  const message = result.message?.trim() || fallback;
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
