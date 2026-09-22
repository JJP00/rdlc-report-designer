/**
 * Mensajes de error de la API para el usuario. El banner muestra solo el motivo
 * (`message`); el código (`E_...`) queda para los logs de diagnóstico.
 */
export function apiErrorMessage(result: { message?: string }, fallback: string): string {
  const message = result.message?.trim();
  return message ? message : fallback;
}
