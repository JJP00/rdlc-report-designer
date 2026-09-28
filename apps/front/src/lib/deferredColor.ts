/**
 * Commit diferido para valores que cambian a ráfagas: el `<input type=color>`
 * dispara `input` en **cada paso** del arrastre del selector y, si cada paso
 * enviara un comando, la app se ralentiza (IPC + proyección + re-render del
 * lienzo) y el undo tendría decenas de pasos.
 *
 * Agrupa: el valor se entrega **una sola vez** cuando pasa `delay` sin cambios
 * nuevos. `flush()` fuerza el pendiente (p. ej. al desmontar, para no perder el
 * último color) y `cancel()` lo descarta.
 */

export interface DeferredCommit {
  /** Programa el commit del valor (reinicia el temporizador). */
  schedule(value: string): void;
  /** Entrega ya el valor pendiente (si lo hay). */
  flush(): void;
  /** Descarta el valor pendiente. */
  cancel(): void;
}

export function createDeferredCommit(
  delay: number,
  commit: (value: string) => void,
): DeferredCommit {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const deliver = (): void => {
    const next = pending;
    pending = null;
    if (next !== null) commit(next);
  };

  return {
    schedule(value) {
      pending = value;
      stop();
      timer = setTimeout(() => {
        timer = null;
        deliver();
      }, delay);
    },
    flush() {
      stop();
      deliver();
    },
    cancel() {
      stop();
      pending = null;
    },
  };
}
