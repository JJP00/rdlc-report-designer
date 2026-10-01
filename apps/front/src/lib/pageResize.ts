import type { PageDto } from '@rdlc-designer/contracts';
import { toCm } from './projection';

/**
 * Matemática del **redimensionado de página** en el lienzo (U10): alto de las
 * bandas (encabezado, cuerpo y pie), ancho de la sección del informe y márgenes.
 *
 * Todo en cm, con imán de 0,1 cm (el mismo que la rejilla) y los mismos límites
 * que aplica el dominio: el ancho de sección **nunca baja del contenido** (si un
 * elemento sobresale, el cuerpo crece), los márgenes no dejan menos de 1 cm de
 * contenido entre lados opuestos y las bandas pueden colapsar a 0.
 */

/** Ancho mínimo de la sección del informe. */
export const MIN_SECTION_CM = 1;
/** Contenido mínimo entre márgenes opuestos. */
export const MIN_CONTENT_CM = 1;

/** Redondeo a 2 decimales (los valores de cm que viajan al documento). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Imán de cm; con paso <= 0 solo redondea (Shift). */
export function snapCm(value: number, step: number): number {
  if (step <= 0) return round2(value);
  return round2(Math.round(value / step) * step);
}

/** Alto de una banda tras un arrastre: nunca < 0 (la banda puede colapsar). */
export function bandHeightFrom(currentCm: number, deltaCm: number, snapStepCm = 0.1): number {
  return Math.max(0, snapCm(currentCm + deltaCm, snapStepCm));
}

/** Ancho de sección tras un arrastre: entre el contenido y el ancho del papel. */
export function sectionWidthFrom(
  currentCm: number,
  deltaCm: number,
  maxCm: number,
  minCm = MIN_SECTION_CM,
  snapStepCm = 0.1,
): number {
  const wanted = snapCm(currentCm + deltaCm, snapStepCm);
  const floor = Math.max(MIN_SECTION_CM, round2(minCm));
  return Math.min(Math.max(wanted, floor), Math.max(floor, round2(maxCm)));
}

/**
 * Mínimo de ancho de sección que impone el **contenido**: el borde derecho más
 * lejano de los items de primer nivel de las tres bandas. El cuerpo nunca queda
 * a la izquierda de su contenido: si un elemento sobresale, crece.
 */
export function sectionContentMinCm(page: PageDto): number {
  let max = 0;
  for (const region of [page.header, page.body, page.footer]) {
    for (const item of region.items) {
      max = Math.max(max, toCm(item.left) + toCm(item.width));
    }
  }
  return round2(max);
}

/**
 * Margen (cm) a partir de la posición del puntero en el eje de la regla:
 * en el lado inicial el margen es la posición; en el final, el resto del papel.
 */
export function marginFromPointer(
  side: 'start' | 'end',
  pointerCm: number,
  sheetCm: number,
  snapStepCm = 0.1,
): number {
  const raw = side === 'start' ? pointerCm : sheetCm - pointerCm;
  return snapCm(raw, snapStepCm);
}

/** Recorta el margen para dejar el contenido mínimo entre lados opuestos. */
export function clampMargin(
  candidateCm: number,
  oppositeCm: number,
  sheetCm: number,
  minContentCm = MIN_CONTENT_CM,
): number {
  const max = Math.max(0, sheetCm - oppositeCm - minContentCm);
  return round2(Math.min(Math.max(candidateCm, 0), max));
}

/** Etiqueta de la previsualización: «2.4 cm» (sin ceros de relleno). */
export function formatCm(value: number): string {
  return `${Number(value.toFixed(2))} cm`;
}

/* ------------------------- tramos de la regla ---------------------------- */

export interface PageRulerSegment {
  key: string;
  /** Rango en cm sobre el eje de la regla. */
  from: number;
  to: number;
  /**
   * `printable` = área entre márgenes; `band` = encabezado o pie (se delimita
   * con línea, como el Report Builder).
   */
  kind: 'printable' | 'band';
  /** Nombre accesible (title). */
  label: string;
}

/** Longitud RDL → cm (sin depender de `lib/projection`). */
function lengthToCm(length: { value: number; unit: string }): number {
  switch (length.unit) {
    case 'mm':
      return length.value / 10;
    case 'in':
      return length.value * 2.54;
    case 'pt':
      return (length.value * 2.54) / 72;
    default:
      return length.value;
  }
}

/**
 * Tramos que resalta la regla (como el Report Builder): el **área imprimible**
 * entre márgenes en ambos ejes y, en la regla vertical, las bandas de
 * **encabezado** y **pie** (con línea, para saber dónde empieza y acaba cada
 * cosa). Las bandas a 0 no se pintan.
 */
export function pageRulerSegments(
  page: {
    width: { value: number; unit: string };
    height: { value: number; unit: string };
    margins: {
      top: { value: number; unit: string };
      bottom: { value: number; unit: string };
      left: { value: number; unit: string };
      right: { value: number; unit: string };
    };
    header: { height: { value: number; unit: string } };
    footer: { height: { value: number; unit: string } };
  },
  axis: 'x' | 'y',
): PageRulerSegment[] {
  const horizontal = axis === 'x';
  const sheet = lengthToCm(horizontal ? page.width : page.height);
  const start = lengthToCm(horizontal ? page.margins.left : page.margins.top);
  const end = sheet - lengthToCm(horizontal ? page.margins.right : page.margins.bottom);
  const segments: PageRulerSegment[] = [
    {
      key: 'printable',
      from: start,
      to: Math.max(start, end),
      kind: 'printable',
      label: 'Área imprimible',
    },
  ];

  if (!horizontal) {
    const header = lengthToCm(page.header.height);
    const footer = lengthToCm(page.footer.height);
    if (header > 0) {
      segments.push({
        key: 'header',
        from: start,
        to: start + header,
        kind: 'band',
        label: 'Encabezado',
      });
    }
    if (footer > 0) {
      segments.push({
        key: 'footer',
        from: Math.max(start, end - footer),
        to: Math.max(start, end),
        kind: 'band',
        label: 'Pie',
      });
    }
  }

  return segments;
}
