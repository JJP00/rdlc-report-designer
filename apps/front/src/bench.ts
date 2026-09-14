import type { ProjectionDto, TextboxDto } from '@rdlc-designer/contracts';

/** F0 — Benchmark del lienzo: proyección sintética con N textboxes. */

export interface BenchResult {
  items: number;
  frames: number;
  /** FPS mediana (p50 de los frames). */
  fpsP50: number;
  /** FPS del percentil 95 de tiempo de frame (lo peor sostenido). */
  fpsP95: number;
  minFps: number;
  heapMB: number | null;
  /** Tiempo desde el montaje hasta el primer paint estable. */
  mountMs: number;
}

export function makeProjection(count: number): ProjectionDto {
  const columns = Math.ceil(Math.sqrt(count));
  const cellWidth = 2.9;
  const cellHeight = 0.55;
  const items: TextboxDto[] = [];

  for (let index = 0; index < count; index += 1) {
    items.push({
      kind: 'textbox',
      id: `Textbox${index + 1}`,
      top: { value: 1 + Math.floor(index / columns) * cellHeight, unit: 'cm' },
      left: { value: 1 + (index % columns) * cellWidth, unit: 'cm' },
      width: { value: cellWidth - 0.1, unit: 'cm' },
      height: { value: cellHeight - 0.05, unit: 'cm' },
      paragraphs: [{ runs: [{ value: `=Fields!Item_No_${index}.Value` }] }],
      style: {
        fontSize: { value: 9, unit: 'pt' },
        fontFamily: 'Segoe UI',
      },
    });
  }

  return {
    sessionId: 'bench',
    version: 1,
    reportName: 'Bench',
    meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
    page: {
      width: { value: 21, unit: 'cm' },
      height: { value: 29.7, unit: 'cm' },
      margins: {
        top: { value: 2.5, unit: 'cm' },
        bottom: { value: 2.5, unit: 'cm' },
        left: { value: 1.9, unit: 'cm' },
        right: { value: 1.9, unit: 'cm' },
      },
      header: { height: { value: 0, unit: 'cm' }, items: [] },
      body: { height: { value: 29.7, unit: 'cm' }, items },
      footer: { height: { value: 0, unit: 'cm' }, items: [] },
    },
  };
}

export function summarize(frames: number[], items: number, mountMs: number): BenchResult {
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (quantile: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 16.7;
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  return {
    items,
    frames: frames.length,
    fpsP50: round(1000 / at(0.5)),
    fpsP95: round(1000 / at(0.95)),
    minFps: round(1000 / Math.max(...frames, 1)),
    heapMB: memory ? round(memory.usedJSHeapSize / 1024 / 1024) : null,
    mountMs: round(mountMs),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
