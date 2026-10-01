import type { PageMarginsDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useCallback, useRef, type RefObject } from 'react';
import { clampMargin, formatCm, marginFromPointer } from '@/lib/pageResize';
import { cm, toCm } from '@/lib/projection';
import type { PageResizeHandle } from './PageResizeLayer';
import type { RulerMark } from './Ruler';

/** Etiquetas de los márgenes (accesibles y de la previsualización). */
const MARGIN_LABELS = {
  left: 'Margen izquierdo',
  right: 'Margen derecho',
  top: 'Margen superior',
  bottom: 'Margen inferior',
} as const;
const MARGIN_SHORT = {
  left: 'Margen izq.',
  right: 'Margen der.',
  top: 'Margen sup.',
  bottom: 'Margen inf.',
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
} {
  const pageResizeRef = useRef<PageResizeHandle | null>(null);
  const margins = projection.page.margins;
  const sheetWidthCm = toCm(projection.page.width);
  const sheetHeightCm = toCm(projection.page.height);

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
          pageResizeRef.current?.showMarginPreview(
            horizontal ? 'vertical' : 'horizontal',
            position,
            `${MARGIN_SHORT[side]} ${formatCm(margin)}`,
          );
        },
        onCommit: (value, shift) => commitMargin(side, value, shift),
        onCancel: () => pageResizeRef.current?.hidePreview(),
      }));
    },
    [commitMargin, margins, onSetPageMargins, resolveMargin, sheetHeightCm, sheetWidthCm],
  );

  return { pageResizeRef, rulerMarks };
}
