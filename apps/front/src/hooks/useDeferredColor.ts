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
 * el último color.
 */
export function useDeferredColor(
  value: string | undefined,
  fallback: string,
  commit: (color: string) => void,
  delay = 250,
): DeferredColor {
  const [draft, setDraft] = useState<string | null>(null);
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  });

  const scheduler = useMemo(
    () =>
      createDeferredCommit(delay, (next) => {
        setDraft(null);
        commitRef.current(next);
      }),
    [delay],
  );

  useEffect(() => () => scheduler.flush(), [scheduler]);

  const change = useCallback(
    (next: string): void => {
      setDraft(next);
      scheduler.schedule(next.toUpperCase());
    },
    [scheduler],
  );

  return { color: draft ?? toHexColor(value, fallback), change };
}
