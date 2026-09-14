import type { Length as LengthDto, LengthUnit } from '@rdlc-designer/contracts';

/**
 * Longitud RDL (value object). El tipo viene del contrato compartido (mismo
 * vocabulario en DTOs y comandos); la lógica de parseo/formateo es del dominio.
 *
 * En el corpus todo llega en `cm`; el dominio admite las 4 unidades canónicas.
 */

const LENGTH_RE = /^(-?\d+(?:\.\d+)?)(cm|mm|in|pt)?$/;

const CM_PER_UNIT: Record<LengthUnit, number> = {
  cm: 1,
  mm: 0.1,
  in: 2.54,
  pt: 2.54 / 72,
};

export type Length = LengthDto;

/** Parseo de la representación XML (`"2.1cm"`, `"10pt"`, `"3"`). */
export function parseLength(raw: string | undefined): Length | undefined {
  if (raw === undefined) return undefined;
  const match = LENGTH_RE.exec(raw.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: (match[2] as LengthUnit | undefined) ?? 'cm' };
}

/** Formateo canónico para el XML (sin espacios, unidad siempre explícita). */
export function formatLength(length: Length): string {
  return `${trimNumber(length.value)}${length.unit}`;
}

/** Conversión a centímetros (para comparaciones y snapping). */
export function toCm(length: Length): number {
  return length.value * CM_PER_UNIT[length.unit];
}

export function fromCm(value: number, unit: LengthUnit = 'cm'): Length {
  // Mismo redondeo que `formatLength`: lo que se aplica y lo que se escribe coinciden.
  return { value: Number((value / CM_PER_UNIT[unit]).toFixed(6)), unit };
}

export function lengthsEqual(a: Length, b: Length): boolean {
  return Math.abs(toCm(a) - toCm(b)) < 1e-9;
}

/** Evita `2.1000000000000001cm` y similares al formatear. */
function trimNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
