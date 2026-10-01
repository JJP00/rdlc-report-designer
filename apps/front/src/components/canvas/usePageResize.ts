import type { PageMarginsDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import {
  bandContentMinCm,
  clampMargin,
  formatCm,
  marginFromPointer,
  sectionContentMinCm,
} from '@/lib/pageResize';
import { cm, toCm } from '@/lib/projection';
import type { PageResizeHandle } from './PageResizeLayer';
import type { RulerMark } from './Ruler';

/** Etiquetas accesibles de los márgenes (aria-label de los marcadores). */
const MARGIN_LABELS = {
  left: 'Margen izquierdo',
  right: 'Margen derecho',
  top: 'Margen superior',
  bottom: 'Margen inferior',
} as const;

type MarginSide = keyof typeof MARGIN_LABELS;

/**
 * U10 · márgenes arrastrables desde la regla (estilo Word): resuelve el margen
 * del arrastre (imán de 0,1 cm; Shift lo desactiva; contenido mínimo entre
 * lados opuestos) y construye los marcadores de cada regla. La previsualización
 * la pinta `PageResizeLayer` (línea + etiqueta) a través de su ref.
 */
export function usePageResize({
  projection,
  onSetPageMargins,
}: {
  projection: ProjectionDto;
  onSetPageMargins?: (margins: PageMarginsDto) => void;
}): {
  pageResizeRef: RefObject<PageResizeHandle | null>;
  rulerMarks: (axis: 'x' | 'y') => RulerMark[];
  /** Mínimos por contenido: el cuerpo no baja de sus items (cm). */
  sectionMinCm: number;
  /** Mínimos por contenido de cada banda: su alto no baja de sus items (cm). */
  bandMinCm: { header: number; body: number; footer: number };
} {
  const pageResizeRef = useRef<PageResizeHandle | null>(null);
  const margins = projection.page.margins;
  const sheetWidthCm = toCm(projection.page.width);
  const sheetHeightCm = toCm(projection.page.height);
  // El cuerpo nunca queda por debajo de su contenido (ni a la izquierda).
  const sectionMinCm = useMemo(() => sectionContentMinCm(projection.page), [projection]);
  const bandMinCm = useMemo(
    () => ({
      header: bandContentMinCm(projection.page, 'header'),
      body: bandContentMinCm(projection.page, 'body'),
      footer: bandContentMinCm(projection.page, 'footer'),
    }),
    [projection],
  );

  /** Margen resultante de un arrastre y posición de su frontera. */
  const resolveMargin = useCallback(
    (side: MarginSide, pointerCm: number, shift: boolean): { margin: number; position: number } => {
      const horizontal = side === 'left' || side === 'right';
      const sheet = horizontal ? sheetWidthCm : sheetHeightCm;
      const opposite =
        side === 'left'
          ? toCm(margins.right)
          : side === 'right'
            ? toCm(margins.left)
            : side === 'top'
              ? toCm(margins.bottom)
              : toCm(margins.top);
      const start = side === 'left' || side === 'top';
      const raw = marginFromPointer(start ? 'start' : 'end', pointerCm, sheet, shift ? 0 : 0.1);
      const margin = clampMargin(raw, opposite, sheet);
      return { margin, position: start ? margin : sheet - margin };
    },
    [margins, sheetHeightCm, sheetWidthCm],
  );

  const commitMargin = useCallback(
    (side: MarginSide, pointerCm: number, shift: boolean): void => {
      if (!onSetPageMargins) return;
      const { margin } = resolveMargin(side, pointerCm, shift);
      onSetPageMargins({ ...margins, [side]: cm(margin) });
      pageResizeRef.current?.hidePreview();
    },
    [margins, onSetPageMargins, resolveMargin],
  );

  /** Marcadores de margen de una regla: previsualizan y confirman al soltar. */
  const rulerMarks = useCallback(
    (axis: 'x' | 'y'): RulerMark[] => {
      if (!onSetPageMargins) return [];
      const horizontal = axis === 'x';
      const sheet = horizontal ? sheetWidthCm : sheetHeightCm;
      const sides: MarginSide[] = horizontal ? ['left', 'right'] : ['top', 'bottom'];
      return sides.map((side) => ({
        key: `margin-${side}`,
        cm: side === 'left' || side === 'top' ? toCm(margins[side]) : sheet - toCm(margins[side]),
        label: MARGIN_LABELS[side],
        onPreview: (value, shift) => {
          const { margin, position } = resolveMargin(side, value, shift);
          // La etiqueta es solo el tamaño resultante, como en el resto de
          // previsualizaciones de página.
          pageResizeRef.current?.showMarginPreview(
            horizontal ? 'vertical' : 'horizontal',
            position,
            formatCm(margin),
          );
        },
        onCommit: (value, shift) => commitMargin(side, value, shift),
        onCancel: () => pageResizeRef.current?.hidePreview(),
      }));
    },
    [commitMargin, margins, onSetPageMargins, resolveMargin, sheetHeightCm, sheetWidthCm],
  );

  return { pageResizeRef, rulerMarks, sectionMinCm, bandMinCm };
}
