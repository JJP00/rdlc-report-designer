import type { ReactNode } from 'react';
import { RULER_PX, PX_PER_CM } from './geometry';

/** Reglas en cm/mm del lienzo (una horizontal y otra vertical). */

export function Ruler({
  orientation,
  zoom,
  lengthPx,
}: {
  orientation: 'horizontal' | 'vertical';
  zoom: number;
  lengthPx: number;
}): ReactNode {
  const cmPx = PX_PER_CM * zoom;
  const maxCm = lengthPx / cmPx;
  const labelStep = zoom >= 0.5 ? 1 : zoom >= 0.3 ? 2 : 5;

  return (
    <div
      className="absolute border-b border-r bg-muted"
      style={
        orientation === 'horizontal'
          ? { left: RULER_PX, top: 0, width: lengthPx, height: RULER_PX }
          : { left: 0, top: RULER_PX, width: RULER_PX, height: lengthPx }
      }
    >
      {buildTicks({ orientation, maxCm, cmPx, labelStep })}
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
