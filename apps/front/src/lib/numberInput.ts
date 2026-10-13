/**
 * Parseo del borrador de un campo numérico de los paneles.
 *
 * `Number.parseFloat` a secas no sirve: acepta colas («12abc» → 12) y, con
 * `replace(',', '.')`, trunca los separadores de miles («1.234,5» → 1.234
 * descartando «,5» en silencio). Aquí el borrador se valida **completo** antes
 * de convertirlo (BUG-44).
 */

/**
 * Convierte el texto tecleado en número, o `undefined` si no es un número
 * completo. Reglas:
 *
 * - coma o punto como separador decimal («1,5» / «1.5»);
 * - con ambos separadores, el **último** es el decimal y el otro de miles
 *   («1.234,5» → 1234.5; «1,234.5» → 1234.5);
 * - con un solo tipo de separador se interpreta como decimal (convención del
 *   panel: «1,5» es 1,5);
 * - cualquier otro texto se rechaza («12abc», «1,2,3», «1 5»).
 */
export function parseNumberDraft(draft: string): number | undefined {
  const trimmed = draft.trim();
  if (trimmed === '') return undefined;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = trimmed.split(thousands).join('').replace(decimal, '.');
  } else {
    normalized = trimmed.replace(',', '.');
  }

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}
