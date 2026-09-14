import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeProjection, summarize, type BenchResult } from './bench';
import { CanvasPreview } from './CanvasPreview';

const MEASURE_MS = 3000;
const ZOOM = 0.45;

/**
 * Página de benchmark (dev-only, `?bench=972`).
 * Renderiza N textboxes y simula un drag de 3 s moviendo un item por frame,
 * midiendo los intervalos entre frames (React + Konva, sin optimizar todavía:
 * es la línea base de F0 para F1).
 */
export function BenchPage({ count }: { count: number }): ReactNode {
  const base = useMemo(() => makeProjection(count), [count]);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<'montando' | 'midiendo' | 'hecho'>('montando');
  const [result, setResult] = useState<BenchResult | null>(null);
  const mountAt = useRef(performance.now());
  const firstPaintAt = useRef<number>(0);

  const movedId = base.page.body.items[0]?.id ?? '';
  const projection = useMemo(() => {
    if (offset === 0) return base;
    const items = base.page.body.items.map((item) =>
      item.id === movedId
        ? { ...item, top: { ...item.top, value: item.top.value + 0.02 * (offset % 8) } }
        : item,
    );
    return { ...base, page: { ...base.page, body: { ...base.page.body, items } } };
  }, [base, movedId, offset]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        firstPaintAt.current = performance.now();
        setPhase('midiendo');
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (phase !== 'midiendo') return;

    const frames: number[] = [];
    let last = performance.now();
    const start = last;
    let raf = 0;

    const loop = (now: number): void => {
      frames.push(now - last);
      last = now;
      setOffset((value) => value + 1);

      if (now - start < MEASURE_MS) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const summary = summarize(frames, count, firstPaintAt.current - mountAt.current);
      (window as Window & { __benchResult?: BenchResult }).__benchResult = summary;
      console.log('[bench]', JSON.stringify(summary));
      setResult(summary);
      setPhase('hecho');
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, count]);

  const restart = (): void => {
    setResult(null);
    setOffset(0);
    mountAt.current = performance.now();
    setPhase('montando');
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('midiendo')));
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">Benchmark de lienzo — {count} textboxes</strong>
        <span className="spacer" />
        {phase === 'hecho' ? <button onClick={restart}>Repetir</button> : null}
      </header>

      <main className="content">
        <div className="docinfo">
          {result ? (
            <span className="stats">
              p50 {result.fpsP50} fps · p95 {result.fpsP95} fps · min {result.minFps} fps ·{' '}
              {result.frames} frames · montaje {result.mountMs} ms · heap{' '}
              {result.heapMB === null ? 'n/d' : `${result.heapMB} MB`}
            </span>
          ) : (
            <span>{phase === 'montando' ? 'Montando…' : 'Midiendo drag simulado (3 s)…'}</span>
          )}
        </div>
        <CanvasPreview projection={projection} zoom={ZOOM} />
      </main>

      <footer className="statusbar">
        Abre esta página en Electron/Chromium para medir el coste real del lienzo.
      </footer>
    </div>
  );
}
