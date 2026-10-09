import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { PageRulerSegment } from '@/lib/pageResize';
import { RULER_PX, PX_PER_CM } from './geometry';

/**
 * Reglas en cm/mm del lienzo (una horizontal y otra vertical) con **marcadores
 * arrastrables** estilo Word (márgenes) y **tramos resaltados** (área imprimible
 * y bandas de encabezado/pie, como el Report Builder).
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
}: {
  orientation: 'horizontal' | 'vertical';
  zoom: number;
  lengthPx: number;
  marks?: RulerMark[];
  /** Tramos resaltados: área imprimible y bandas (encabezado/pie). */
  segments?: PageRulerSegment[];
}): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cmPx = PX_PER_CM * zoom;
  const maxCm = lengthPx / cmPx;
  const labelStep = zoom >= 0.5 ? 1 : zoom >= 0.3 ? 2 : 5;

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
      className="absolute border-b border-r bg-muted"
      style={
        orientation === 'horizontal'
          ? { left: RULER_PX, top: 0, width: lengthPx, height: RULER_PX }
          : { left: 0, top: RULER_PX, width: RULER_PX, height: lengthPx }
      }
    >
      {/* Tramos resaltados (debajo de las marcas y los números). */}
      {segments.map((segment) => (
        <RulerSegmentView
          key={segment.key}
          orientation={orientation}
          segment={segment}
          cmPx={cmPx}
        />
      ))}
      {buildTicks({ orientation, maxCm, cmPx, labelStep })}
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
  );
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
      className="pointer-events-none absolute bg-background"
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
      title={`${mark.label} (arrastra en la regla)`}
      className={`absolute z-10 outline-none before:absolute before:content-[''] focus-visible:ring-2 focus-visible:ring-ring ${
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
 * Marcas de la regla: milímetro a milímetro; la etiqueta (en negrita) manda en
 * grosor y se agrupa a pasos mayores si el zoom es bajo para no solaparse.
 */
function buildTicks({
  orientation,
  maxCm,
  cmPx,
  labelStep,
}: {
  orientation: 'horizontal' | 'vertical';
  maxCm: number;
  cmPx: number;
  labelStep: number;
}): ReactNode[] {
  const ticks: ReactNode[] = [];
  const tickStep = 0.1;
  const count = Math.floor(maxCm / tickStep + 1e-9);

  for (let index = 0; index <= count; index += 1) {
    const cm = index * tickStep;
    const offset = cm * cmPx;
    const isLabel = isMultiple(cm, labelStep);
    const isCm = isMultiple(cm, 1);

    // Longitud de la marca: etiqueta > centímetro > milímetro.
    const ratio = isLabel ? 1 : isCm ? 0.75 : 0.35;
    const thickness = 1;
    const style = {
      ...(orientation === 'horizontal'
        ? {
            left: offset,
            top: RULER_PX * (1 - ratio),
            height: RULER_PX * ratio,
            width: thickness,
          }
        : {
            top: offset,
            left: RULER_PX * (1 - ratio),
            width: RULER_PX * ratio,
            height: thickness,
          }),
      backgroundColor: isCm ? 'var(--muted-foreground)' : 'var(--border)',
    } as const;

    ticks.push(<div key={`t${index}`} className="absolute" style={style} />);

    if (isLabel && index > 0) {
      ticks.push(
        <span
          key={`l${index}`}
          className="absolute select-none text-[9px] font-semibold leading-none text-foreground"
          style={
            orientation === 'horizontal'
              ? { left: offset + 2, top: 1 }
              : { top: offset + 2, left: 1 }
          }
        >
          {formatCm(cm, labelStep)}
        </span>,
      );
    }
  }

  return ticks;
}

function isMultiple(value: number, step: number): boolean {
  return Math.abs(value / step - Math.round(value / step)) < 1e-6;
}

function formatCm(value: number, step: number): string {
  if (step < 1) return value.toFixed(1);
  return String(Math.round(value));
}
