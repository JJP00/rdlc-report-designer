import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import type { PageRulerSegment } from '@/lib/pageResize';
import { RULER_PX, PX_PER_CM } from './geometry';
import type { ZoomPreviewSource } from './useWheelZoom';

/**
 * Reglas en cm/mm del lienzo (una horizontal y otra vertical) con **marcadores
 * arrastrables** estilo Word (márgenes) y **tramos resaltados** (área imprimible
 * y bandas de encabezado/pie, como el Report Builder).
 *
 * La regla mide `lengthPx` con su 0 en el borde inicial de su caja; quien la
 * monta la coloca alineada con el papel (`CanvasRulers`, que la mantiene a la
 * vista con el scroll).
 */

export interface RulerMark {
  key: string;
  /** Posición del marcador en cm sobre el papel (eje de la regla). */
  cm: number;
  /** Etiqueta accesible (p. ej. «Margen izquierdo»). */
  label: string;
  /** Durante el arrastre, con el cm del puntero (`shift` = sin imán). */
  onPreview: (cm: number, shift: boolean) => void;
  /** Al soltar, con el cm final. */
  onCommit: (cm: number, shift: boolean) => void;
  /** Al cancelar el arrastre (Escape / pointercancel). */
  onCancel: () => void;
}

export function Ruler({
  orientation,
  zoom,
  lengthPx,
  marks = [],
  segments = [],
  preview,
  viewportRef,
}: {
  orientation: 'horizontal' | 'vertical';
  zoom: number;
  lengthPx: number;
  marks?: RulerMark[];
  /** Tramos resaltados: área imprimible y bandas (encabezado/pie). */
  segments?: PageRulerSegment[];
  /** Zoom provisional de la rueda: la regla lo sigue sin re-render de React. */
  preview?: ZoomPreviewSource;
  /** Hueco con scroll: durante el gesto solo se pinta lo que se ve. */
  viewportRef?: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmentsLayerRef = useRef<HTMLDivElement | null>(null);
  const marksLayerRef = useRef<HTMLDivElement | null>(null);
  const cmPx = PX_PER_CM * zoom;
  const maxCm = lengthPx / cmPx;

  /**
   * Pinta las marcas (canvas) y coloca las capas de tramos y marcadores. Sin
   * gesto, con el zoom confirmado; durante la rueda, con el provisional y el 0
   * desplazado como el del papel (que escala sobre el cursor).
   */
  const paint = (): void => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const horizontal = orientation === 'horizontal';
    const current = preview?.get() ?? null;
    const shift = current ? (horizontal ? current.shiftX : current.shiftY) : 0;
    const liveZoom = current?.zoom ?? zoom;
    const scale = liveZoom / zoom;

    // Tramos y marcadores acompañan al papel con un transform (barato).
    const transform = current
      ? horizontal
        ? `translateX(${shift}px) scaleX(${scale})`
        : `translateY(${shift}px) scaleY(${scale})`
      : '';
    for (const layer of [segmentsLayerRef.current, marksLayerRef.current]) {
      if (layer) layer.style.transform = transform;
    }
    // El fondo lo pone la capa de tramos, que escala con el papel.
    container.style.backgroundColor = current ? 'transparent' : '';

    let from = shift;
    let to = shift + lengthPx * scale;
    const viewport = current ? viewportRef?.current : null;
    if (viewport) {
      const box = container.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      from = Math.max(from, horizontal ? view.left - box.left : view.top - box.top);
      to = Math.min(to, horizontal ? view.right - box.left : view.bottom - box.top);
    }
    from = Math.floor(from);
    paintTicks(canvas, {
      horizontal,
      cmPx: PX_PER_CM * liveZoom,
      maxCm,
      from,
      length: Math.max(Math.ceil(to) - from, 0),
      shift,
      labelStep: labelStepFor(liveZoom),
    });
  };
  const paintRef = useRef(paint);
  useLayoutEffect(() => {
    paintRef.current = paint;
    paint();
  });

  useEffect(() => {
    const repaint = (): void => paintRef.current();
    const unsubscribe = preview?.subscribe(repaint);
    // El tema (claro/oscuro) cambia los colores de las marcas.
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => {
      unsubscribe?.();
      observer.disconnect();
    };
  }, [preview]);

  /** cm de papel correspondientes a la posición del puntero en la regla. */
  const cmFromPointer = (event: PointerEvent<HTMLDivElement>): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const offset =
      orientation === 'horizontal' ? event.clientX - rect.left : event.clientY - rect.top;
    return Math.min(Math.max(offset / cmPx, 0), maxCm);
  };

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-b border-r border-ruler-edge bg-ruler"
      style={
        orientation === 'horizontal'
          ? { width: lengthPx, height: RULER_PX }
          : { width: RULER_PX, height: lengthPx }
      }
    >
      {/* Tramos resaltados (debajo de las marcas y los números). */}
      <div
        ref={segmentsLayerRef}
        className="pointer-events-none absolute inset-0 origin-top-left bg-ruler"
      >
        {segments.map((segment) => (
          <RulerSegmentView
            key={segment.key}
            orientation={orientation}
            segment={segment}
            cmPx={cmPx}
          />
        ))}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute text-foreground"
      />
      {/* Sin eventos la capa (cubre la regla); los marcadores los reactivan. */}
      <div ref={marksLayerRef} className="pointer-events-none absolute inset-0 origin-top-left">
        {marks.map((mark) => (
          <RulerMarkHandle
            key={mark.key}
            orientation={orientation}
            mark={mark}
            offset={mark.cm * cmPx}
            maxCm={maxCm}
            cmFromPointer={cmFromPointer}
          />
        ))}
      </div>
    </div>
  );
}

/** Cada cuántos cm se numera: a pasos mayores con zoom bajo para no solaparse. */
function labelStepFor(zoom: number): number {
  return zoom >= 0.5 ? 1 : zoom >= 0.3 ? 2 : 5;
}

/** Tramo resaltado de la regla (área imprimible o banda de encabezado/pie). */
function RulerSegmentView({
  orientation,
  segment,
  cmPx,
}: {
  orientation: 'horizontal' | 'vertical';
  segment: PageRulerSegment;
  cmPx: number;
}): ReactNode {
  const horizontal = orientation === 'horizontal';
  const from = segment.from * cmPx;
  const length = Math.max(segment.to * cmPx - from, 0);
  const band = segment.kind === 'band';
  // Las bandas se delimitan con línea oscura (como Report Builder); el área
  // imprimible, con una línea suave.
  const line = band ? 'var(--foreground)' : 'var(--muted-foreground)';
  return (
    <div
      aria-hidden
      title={segment.label}
      className="pointer-events-none absolute bg-ruler-printable"
      style={
        horizontal
          ? {
              left: from,
              top: 0,
              width: length,
              height: RULER_PX,
              boxShadow: `inset 1px 0 0 ${line}, inset -1px 0 0 ${line}`,
            }
          : {
              top: from,
              left: 0,
              height: length,
              width: RULER_PX,
              boxShadow: `inset 0 1px 0 ${line}, inset 0 -1px 0 ${line}`,
            }
      }
    />
  );
}

/** Marcador arrastrable de la regla (un margen); se pinta como una guía. */
function RulerMarkHandle({
  orientation,
  mark,
  offset,
  maxCm,
  cmFromPointer,
}: {
  orientation: 'horizontal' | 'vertical';
  mark: RulerMark;
  /** Posición del marcador en px de pantalla dentro de la regla. */
  offset: number;
  maxCm: number;
  cmFromPointer: (event: PointerEvent<HTMLDivElement>) => number;
}): ReactNode {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const size = 12;
  const horizontal = orientation === 'horizontal';

  const style = horizontal
    ? { left: offset - size / 2, top: 0, width: size, height: RULER_PX }
    : { top: offset - size / 2, left: 0, width: RULER_PX, height: size };

  return (
    // Área de acierto ≥ 24 px con un ::before invisible que crece hacia fuera
    // del asa (12 × 20). No toca `style` ni el cuerpo del arrastre: la posición
    // sigue calculándose con el puntero sobre el contenedor de la regla.
    <div
      role="slider"
      aria-label={mark.label}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuemin={0}
      aria-valuemax={Math.round(maxCm * 100) / 100}
      aria-valuenow={Math.round(mark.cm * 100) / 100}
      tabIndex={0}
      title={t('canvas.ruler.dragHint', { label: mark.label })}
      className={`pointer-events-auto absolute z-10 outline-none before:absolute before:content-[''] focus-visible:ring-2 focus-visible:ring-ring ${
        horizontal
          ? 'cursor-ew-resize before:-inset-x-1.5 before:-inset-y-0.5'
          : 'cursor-ns-resize before:-inset-y-1.5 before:-inset-x-0.5'
      } ${dragging ? 'bg-primary/30' : 'hover:bg-primary/20'}`}
      style={style}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        mark.onPreview(cmFromPointer(event), event.shiftKey);
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        setDragging(false);
        mark.onCommit(cmFromPointer(event), event.shiftKey);
      }}
      onPointerCancel={() => {
        setDragging(false);
        mark.onCancel();
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 1 : 0.1;
        let next: number | null = null;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = mark.cm - step;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = mark.cm + step;
        if (event.key === 'Escape') {
          event.preventDefault();
          mark.onCancel();
          return;
        }
        if (next === null) return;
        event.preventDefault();
        mark.onCommit(Math.min(Math.max(next, 0), maxCm), false);
      }}
    >
      {/* Guía central del marcador (la línea que marca el margen). */}
      <div
        className="pointer-events-none absolute bg-primary"
        style={
          horizontal
            ? { left: size / 2 - 1, top: 0, width: 2, height: RULER_PX }
            : { top: size / 2 - 1, left: 0, height: 2, width: RULER_PX }
        }
      />
      {/* Cabeza del marcador (rombo) en el borde interior de la regla. */}
      <div
        className="pointer-events-none absolute size-[7px] rotate-45 bg-primary"
        style={horizontal ? { left: size / 2 - 3.5, bottom: 1 } : { top: size / 2 - 3.5, right: 1 }}
      />
    </div>
  );
}

/**
 * Marcas de la regla en un canvas: milímetro a milímetro; la etiqueta (en
 * negrita) manda en grosor y se agrupa a pasos mayores si el zoom es bajo para
 * no solaparse. Un solo canvas (y no cientos de nodos) permite repintarla en
 * cada paso de la rueda. Solo se pinta el tramo `[from, from + length)` (px de
 * regla); `shift` es dónde cae su 0.
 */
function paintTicks(
  canvas: HTMLCanvasElement,
  {
    horizontal,
    cmPx,
    maxCm,
    from,
    length,
    shift,
    labelStep,
  }: {
    horizontal: boolean;
    cmPx: number;
    maxCm: number;
    from: number;
    length: number;
    shift: number;
    labelStep: number;
  },
): void {
  const dpr = window.devicePixelRatio || 1;
  const along = Math.round(length * dpr);
  const across = Math.round(RULER_PX * dpr);
  const width = horizontal ? along : across;
  const height = horizontal ? across : along;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${width / dpr}px`;
  canvas.style.height = `${height / dpr}px`;
  canvas.style.left = horizontal ? `${from}px` : '0px';
  canvas.style.top = horizontal ? '0px' : `${from}px`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (along === 0) return;

  const styles = getComputedStyle(canvas);
  const major = styles.getPropertyValue('--ruler-tick').trim() || styles.color;
  const minor = styles.getPropertyValue('--ruler-tick-minor').trim() || styles.color;
  context.font = `600 ${9 * dpr}px ${styles.fontFamily}`;
  context.textBaseline = 'top';

  // Marcas cada mm (índice = décimas de cm); con zoom muy bajo los mm se
  // juntan en una mancha y solo quedan los cm.
  const tickPx = cmPx / 10;
  const showMillimetres = tickPx >= 3;
  const labelEvery = Math.round(labelStep * 10);
  const count = Math.floor(maxCm * 10 + 1e-6);
  const first = Math.max(0, Math.floor((from - shift) / tickPx) - 1);
  const last = Math.min(count, Math.ceil((from + length - shift) / tickPx) + 1);
  const thickness = Math.max(1, Math.round(dpr));

  for (let index = first; index <= last; index += 1) {
    const isLabel = index % labelEvery === 0;
    const isCm = index % 10 === 0;
    if (!isCm && !showMillimetres) continue;
    const offset = shift + (index / 10) * cmPx - from;
    const position = Math.round(offset * dpr);
    // Longitud de la marca: etiqueta > centímetro > milímetro.
    const tick = Math.round(across * (isLabel ? 1 : isCm ? 0.75 : 0.35));
    context.fillStyle = isCm ? major : minor;
    if (horizontal) context.fillRect(position, across - tick, thickness, tick);
    else context.fillRect(across - tick, position, tick, thickness);

    if (isLabel && index > 0) {
      context.fillStyle = styles.color;
      const text = formatCm(index / 10, labelStep);
      if (horizontal) context.fillText(text, (offset + 2) * dpr, dpr);
      else context.fillText(text, dpr, (offset + 2) * dpr);
    }
  }
}

function formatCm(value: number, step: number): string {
  if (step < 1) return value.toFixed(1);
  return String(Math.round(value));
}
