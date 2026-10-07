import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDeferredCommit } from '@/lib/deferredColor';
import { toHexColor } from '@/lib/style';

export interface DeferredColor {
  /** Color a pintar (borrador al momento mientras se elige). */
  color: string;
  /** Llamar en cada `input` del selector de color. */
  change: (value: string) => void;
}

/**
 * Selector de color con **commit diferido**: el borrador se pinta al momento
 * (feedback inmediato) y el comando se envía una sola vez al parar el arrastre
 * (~250 ms), así el selector no ralentiza la app y el undo tiene un solo paso.
 * Al desmontar (cambio de selección) se **entrega lo pendiente** para no perder
 * el último color, y el pendiente queda atado al item para el que se eligió
 * aunque la selección cambie antes del commit (BUG-38).
 */
export function useDeferredColor(
  value: string | undefined,
  fallback: string,
  commit: (color: string) => void,
  delay = 250,
): DeferredColor {
  const [draft, setDraft] = useState<string | null>(null);
  const commitRef = useRef(commit);
  /**
   * Commit **capturado al programar**: si la selección cambia antes de que el
   * temporizador dispare, el color pendiente se entrega al item para el que se
   * eligió, no al recién seleccionado (BUG-38). `commitRef` se refresca en cada
   * render con el commit del item actual; el capturado no.
   */
  const scheduledCommitRef = useRef<((color: string) => void) | null>(null);

  useEffect(() => {
    commitRef.current = commit;
  });

  const scheduler = useMemo(
    () =>
      createDeferredCommit(delay, (next) => {
        setDraft(null);
        const target = scheduledCommitRef.current ?? commitRef.current;
        scheduledCommitRef.current = null;
        target(next);
      }),
    [delay],
  );

  useEffect(() => () => scheduler.flush(), [scheduler]);

  const change = useCallback(
    (next: string): void => {
      scheduledCommitRef.current = commitRef.current;
      setDraft(next);
      scheduler.schedule(next.toUpperCase());
    },
    [scheduler],
  );

  return { color: draft ?? toHexColor(value, fallback), change };
}
