import { useT } from '@rdlc-designer/i18n/react';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { PANEL_LIMITS, clampPanelSize, type PanelKey } from '@/lib/panelLayout';
import { cn } from '@/lib/utils';

export interface PanelResizerProps {
  panel: PanelKey;
  /**
   * Borde del panel en el que va: `right` (paneles de la izquierda), `left`
   * (Propiedades, a la derecha) o `top` (Problemas, abajo).
   */
  edge: 'left' | 'right' | 'top';
  /** Tamaño actual del panel (px). */
  size: number;
  /**
   * Tamaño real al empezar (px), si puede diferir de `size` (Problemas sin alto
   * fijo mide lo que su contenido): el arrastre parte de ahí, sin saltos.
   */
  measure?: () => number;
  /** Tamaño nuevo, ya dentro de los límites. */
  onResize: (px: number) => void;
  /** Doble clic: tamaño original. */
  onReset: () => void;
  /** Cuánto puede crecer el panel sin dejar el lienzo por debajo de su mínimo (px). */
  room: () => number;
  /** Nombre accesible («Ancho de Jerarquía»). */
  label: string;
}

/**
 * Asidero del borde de un panel (patrón *window splitter* de WAI-ARIA): se
 * arrastra, se mueve con las flechas (Mayús: pasos largos), Inicio/Fin lo
 * llevan al mínimo/máximo y el doble clic devuelve el tamaño original.
 *
 * El panel que lo monta es `relative`; el asidero se centra sobre su borde y
 * pinta una línea al pasar por encima, con el foco o arrastrando.
 */
export function PanelResizer({
  panel,
  edge,
  size,
  onResize,
  onReset,
  room,
  label,
  measure,
}: PanelResizerProps): ReactNode {
  const t = useT();
  const dragRef = useRef<{ start: number; size: number; room: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const columns = edge !== 'top';
  /** Signo del crecimiento: hacia la derecha crece un panel de la izquierda; el resto, al revés. */
  const grow = edge === 'right' ? 1 : -1;
  const { min, max } = PANEL_LIMITS[panel];

  const position = (event: PointerEvent<HTMLDivElement>): number =>
    columns ? event.clientX : event.clientY;

  const endDrag = (): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    // Durante el arrastre el cursor y la selección de texto son de toda la ventana.
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16;
    // El separador se mueve con la flecha de su eje; crecer depende del borde.
    const moves: Record<string, number | undefined> = columns
      ? { ArrowRight: step, ArrowLeft: -step }
      : { ArrowDown: step, ArrowUp: -step };
    const move = moves[event.key];
    const current = measure?.() ?? size;
    let next: number | null = move === undefined ? null : current + move * grow;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    onResize(clampPanelSize(panel, next, current, room()));
  };

  return (
    <div
      role="separator"
      aria-orientation={columns ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t('lib.panel.resizeTitle')}
      data-rdlc-panel-resizer={panel}
      className={cn(
        'group absolute z-30 touch-none outline-none',
        columns ? 'inset-y-0 w-2 cursor-col-resize' : 'inset-x-0 h-2 cursor-row-resize',
        edge === 'right' && '-right-1',
        edge === 'left' && '-left-1',
        edge === 'top' && '-top-1',
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = measure?.() ?? size;
        dragRef.current = { start: position(event), size: start, room: room() };
        setDragging(true);
        document.body.style.cursor = columns ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const next = drag.size + (position(event) - drag.start) * grow;
        onResize(clampPanelSize(panel, next, drag.size, drag.room));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute bg-ring opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          dragging && 'opacity-100',
          columns
            ? 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'
            : 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2',
        )}
      />
    </div>
  );
}

/** Hueco que le sobra al lienzo por encima de su mínimo (px); sin lienzo, sin tope. */
export function canvasRoom(minPx: number): number {
  const canvas = document.querySelector('[data-rdlc-canvas-column]');
  if (!canvas) return Number.POSITIVE_INFINITY;
  return canvas.getBoundingClientRect().width - minPx;
}
