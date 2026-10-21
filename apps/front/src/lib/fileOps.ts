/**
 * Guardas de las operaciones de fichero del workspace, puras (sin React):
 *
 * - `createSessionOps`: operaciones **por sesión** (guardar / guardar como). Una
 *   operación en la pestaña A no bloquea la B; dentro de una misma pestaña, un
 *   «guardar» que llega con otra operación en vuelo **se une a ella** (espera
 *   su resultado) y un «guardar como» se encadena detrás. Nunca se ignora en
 *   silencio.
 * - `createSerialQueue`: cola secuencial para abrir/crear (operaciones del
 *   workspace, sin pestaña): lo que llega mientras hay una en curso se encola.
 * - `visibleBusyLabel`: el «Guardando…/Abriendo…» solo se muestra en la pestaña
 *   a la que pertenece la operación.
 */

/* ------------------------------ por sesión -------------------------------- */

interface InFlight {
  kind: string;
  promise: Promise<boolean>;
}

export interface SessionOps {
  /** Hay una operación en vuelo en esa sesión. */
  isBusy(sessionId: string): boolean;
  /** Sesiones con operación en vuelo. */
  busyIds(): string[];
  /** Promesa de la última operación en vuelo de la sesión (resultado: ¿escribió?). */
  pending(sessionId: string): Promise<boolean> | undefined;
  /**
   * Ejecuta `task` para la sesión. Con `join: true` y otra operación en vuelo,
   * devuelve el resultado de **esa** (esperar y continuar, p. ej. cierre de
   * ventana); sin `join`, se encadena tras ella (se ejecuta al terminar, aunque
   * la anterior fallara).
   */
  run(
    sessionId: string,
    kind: string,
    task: () => Promise<boolean>,
    options?: { join?: boolean },
  ): Promise<boolean>;
}

export function createSessionOps(): SessionOps {
  const inFlight = new Map<string, InFlight>();
  return {
    isBusy: (sessionId) => inFlight.has(sessionId),
    busyIds: () => [...inFlight.keys()],
    pending: (sessionId) => inFlight.get(sessionId)?.promise,
    run(sessionId, kind, task, options) {
      const current = inFlight.get(sessionId);
      if (current && options?.join) return current.promise;
      const started = current
        ? current.promise.then(
            () => task(),
            () => task(),
          )
        : task();
      const entry: InFlight = { kind, promise: started };
      // Si `task` lanza, la sesión se libera igualmente.
      const settled = started.finally(() => {
        if (inFlight.get(sessionId) === entry) inFlight.delete(sessionId);
      });
      // `finally` crea otra promesa: se absorbe su rechazo (el llamador ya
      // recibe el original por `started`).
      settled.catch(() => {});
      inFlight.set(sessionId, entry);
      return started;
    },
  };
}

/* ------------------------------ cola serie -------------------------------- */

export interface SerialQueue {
  /**
   * Añade un trabajo. Devuelve `true` si **empieza ya** y `false` si queda
   * encolado tras otro en curso (el llamador debe avisar al usuario).
   */
  enqueue(job: () => Promise<void>): boolean;
  /** Hay un trabajo en curso o pendiente. */
  isBusy(): boolean;
  /** Trabajos esperando (sin contar el que corre). */
  pending(): number;
}

export function createSerialQueue(): SerialQueue {
  const jobs: Array<() => Promise<void>> = [];
  let running = false;

  async function drain(): Promise<void> {
    running = true;
    try {
      for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
        try {
          await job();
        } catch {
          // Un trabajo fallido no debe bloquear los siguientes.
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(job) {
      const startsNow = !running;
      jobs.push(job);
      if (startsNow) void drain();
      return startsNow;
    },
    isBusy: () => running,
    pending: () => jobs.length,
  };
}

/* --------------------------- etiqueta «ocupado» --------------------------- */

/** Operación en curso con etiqueta; `sessionId` null = del workspace (abrir/crear). */
export interface BusyOperation {
  id: number;
  sessionId: string | null;
  label: string;
}

/**
 * Etiqueta a mostrar en el pie: la de una operación de la pestaña activa o, si
 * no, la de una operación del workspace (sin pestaña); nunca la de otra pestaña.
 */
export function visibleBusyLabel(
  operations: readonly BusyOperation[],
  activeSessionId: string | null,
): string | null {
  const own = operations.find((op) => op.sessionId !== null && op.sessionId === activeSessionId);
  if (own) return own.label;
  return operations.find((op) => op.sessionId === null)?.label ?? null;
}
