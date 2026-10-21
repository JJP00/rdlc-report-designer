import type Konva from 'konva';
import { useT } from '@rdlc-designer/i18n/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { makeProjection, summarize, type BenchResult } from '@/lib/bench';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';

const MEASURE_MS = 3000;
const ZOOM = 0.45;
/** Amplitud del vaivén vertical del item arrastrado (px de papel). */
const DRAG_AMPLITUDE_PX = 20;

/**
 * Página de benchmark (dev/QA, `?bench=972`).
 *
 * Mide el **camino real de arrastre**: se mueve el nodo Konva del primer item
 * (`node.y()` + `batchDraw()`, como `ItemView.onDragMove`) sin re-renderizar
 * React. El montaje también se mide. Criterio de aceptación de F1/T3: 60 fps
 * p50 en el escenario de 972 textboxes.
 */
export function BenchPage({ count }: { count: number }): ReactNode {
  const t = useT();
  const base = useMemo(() => makeProjection(count), [count]);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [phase, setPhase] = useState<'montando' | 'midiendo' | 'hecho'>('montando');
  const [result, setResult] = useState<BenchResult | null>(null);
  // Momento de montaje: se toma en un efecto (no en render) para no escribir
  // refs durante el render; el efecto que mide corre después.
  const mountAt = useRef<number>(0);
  const firstPaintAt = useRef<number>(0);

  useEffect(() => {
    mountAt.current = performance.now();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        firstPaintAt.current = performance.now();
        setPhase('midiendo');
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const movedId = base.page.body.items[0]?.id ?? '';

  useEffect(() => {
    if (phase !== 'midiendo') return;

    const frames: number[] = [];
    let raf = 0;
    let started = false;
    let start = 0;
    let last = 0;
    let baseY = 0;
    let node: Konva.Node | null = null;

    const loop = (now: number): void => {
      if (!started) {
        // El stage puede tardar un frame en montar: se espera sin medir.
        node = stageRef.current?.findOne(`#${movedId}`) ?? null;
        if (node === null) {
          raf = requestAnimationFrame(loop);
          return;
        }
        baseY = node.y();
        started = true;
        start = now;
        last = now;
        raf = requestAnimationFrame(loop);
        return;
      }

      frames.push(now - last);
      last = now;

      const t = (now - start) / 1000;
      node?.y(baseY + Math.sin(t * Math.PI * 2) * DRAG_AMPLITUDE_PX);
      node?.getLayer()?.batchDraw();

      if (now - start < MEASURE_MS) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const summary = summarize(frames, count, firstPaintAt.current - mountAt.current);
      (window as Window & { __benchResult?: BenchResult }).__benchResult = summary;
      console.log('[bench]', JSON.stringify(summary));

      // Diagnóstico T3: coste de un draw completo y nodos visibles/ocultos.
      const layer = node?.getLayer() ?? null;
      const drawStart = performance.now();
      layer?.draw();
      const drawMs = performance.now() - drawStart;
      const groups = layer?.find('Group') ?? [];
      const debug = {
        drawMs: Math.round(drawMs * 10) / 10,
        groups: groups.length,
        hiddenGroups: groups.filter((group) => !group.visible()).length,
      };
      (window as Window & { __benchDebug?: unknown }).__benchDebug = debug;
      console.log('[bench-debug]', JSON.stringify(debug));

      node?.y(baseY);
      node?.getLayer()?.batchDraw();
      setResult(summary);
      setPhase('hecho');
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, count, movedId]);

  const restart = (): void => {
    setResult(null);
    mountAt.current = performance.now();
    setPhase('montando');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        firstPaintAt.current = performance.now();
        setPhase('midiendo');
      }),
    );
  };

  // QA: el runner repite el benchmark varias veces para promediar.
  useEffect(() => {
    const holder = window as Window & { __benchRestart?: () => void };
    holder.__benchRestart = restart;
    return () => {
      delete holder.__benchRestart;
    };
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-sm font-semibold">{t('lib.bench.title', { count })}</span>
        <div className="flex-1" />
        {phase === 'hecho' ? (
          <Button variant="outline" size="sm" onClick={restart}>
            {t('lib.bench.repeat')}
          </Button>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="border-b bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          {result ? (
            <span>
              {t('lib.bench.stats', {
                p50: result.fpsP50,
                p95: result.fpsP95,
                min: result.minFps,
                frames: result.frames,
                mount: result.mountMs,
                heap: result.heapMB === null ? t('lib.bench.notAvailable') : `${result.heapMB} MB`,
              })}
            </span>
          ) : (
            <span>{t(phase === 'montando' ? 'lib.bench.mounting' : 'lib.bench.measuring')}</span>
          )}
        </div>
        <CanvasPreview projection={base} zoom={ZOOM} stageRef={stageRef} />
      </main>

      <footer className="border-t px-3 py-1 text-xs text-muted-foreground">
        {t('lib.bench.hint')}
      </footer>
    </div>
  );
}
