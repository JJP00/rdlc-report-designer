import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Callback de identidad estable que siempre llama a la **última** versión de
 * `fn`. Los handlers del editor cambian con cada mutación del documento; si
 * llegaran tal cual a los `ItemView` (`React.memo`) los re-renderizarían todos
 * en cada movimiento. `undefined` se conserva (algunos props son opcionales y
 * su ausencia cambia el comportamiento, p. ej. `draggable`).
 */
export function useStableCallback<A extends unknown[], R>(
  fn: ((...args: A) => R) | undefined,
): ((...args: A) => R) | undefined {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  const stable = useCallback((...args: A): R => latest.current!(...args), []);
  return fn ? stable : undefined;
}
