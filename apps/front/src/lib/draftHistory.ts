import type { ParagraphDto } from '@rdlc-designer/contracts';

/**
 * Historial de deshacer/rehacer del **borrador** del editor de texto.
 *
 * El diálogo muestra un mismo documento en dos vistas (el textarea y los bloques
 * con Monaco) y además tiene botones que lo cambian. Cada control trae su propio
 * deshacer (nativo o de Monaco), pero el otro lo pisa al reescribirle el valor:
 * se pierde el historial y el orden no es el cronológico. Aquí vive **uno solo**
 * para todo el diálogo. Puro (sin DOM ni React): el reloj entra por parámetro.
 */

/** Las dos vistas del mismo borrador: se guardan juntas porque no son inversas exactas. */
export interface DraftSnapshot {
  paragraphs: ParagraphDto[];
  text: string;
}

export interface DraftHistory {
  past: readonly DraftSnapshot[];
  present: DraftSnapshot;
  future: readonly DraftSnapshot[];
  /** Ráfaga de la última edición (teclas seguidas en un mismo campo); `null` = no fusiona. */
  burstKey: string | null;
  burstAt: number;
}

/** Pasos de deshacer que se recuerdan. */
export const MAX_UNDO_STEPS = 200;
/** Pausa que corta una ráfaga: teclear seguido en un campo es **un** paso. */
export const COALESCE_MS = 1000;

export function createHistory(initial: DraftSnapshot): DraftHistory {
  return { past: [], present: initial, future: [], burstKey: null, burstAt: 0 };
}

function sameSnapshot(a: DraftSnapshot, b: DraftSnapshot): boolean {
  if (a.text !== b.text) return false;
  return (
    a.paragraphs === b.paragraphs || JSON.stringify(a.paragraphs) === JSON.stringify(b.paragraphs)
  );
}

/**
 * Registra un cambio. Con `key`, las ediciones seguidas con la misma clave (y sin
 * pausa larga) se fusionan en un solo paso; sin `key` cada cambio es un paso
 * (botones: duplicar, mover, quitar…). Un cambio nuevo descarta el «rehacer».
 */
export function commit(
  history: DraftHistory,
  next: DraftSnapshot,
  options: { key?: string; now: number },
): DraftHistory {
  if (sameSnapshot(history.present, next)) return history;

  const key = options.key ?? null;
  const merges =
    key !== null &&
    key === history.burstKey &&
    options.now - history.burstAt <= COALESCE_MS &&
    history.past.length > 0;

  return {
    past: merges ? history.past : [...history.past, history.present].slice(-MAX_UNDO_STEPS),
    present: next,
    future: [],
    burstKey: key,
    burstAt: options.now,
  };
}

/** Vuelve al paso anterior; sin pasos devuelve el mismo objeto. */
export function undo(history: DraftHistory): DraftHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    burstKey: null,
    burstAt: 0,
  };
}

/** Rehace el paso deshecho; sin pasos devuelve el mismo objeto. */
export function redo(history: DraftHistory): DraftHistory {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    burstKey: null,
    burstAt: 0,
  };
}

/**
 * Dónde queda el cursor cuando el texto pasa de `oldValue` a `newValue` por un
 * cambio externo (deshacer/rehacer): junto a lo que cambió, no al principio ni
 * al final. Se busca el tramo que difiere (prefijo y sufijo comunes) y el cursor
 * se recoloca respecto a él: tras el tramo sigue tras el tramo, dentro o al
 * inicio del tramo acaba al final del tramo nuevo (un rehacer deja el cursor
 * detrás de lo reinsertado), antes del tramo no se mueve.
 */
export function mapCaret(oldValue: string, newValue: string, caret: number): number {
  const at = Math.max(0, Math.min(caret, oldValue.length));
  const shortest = Math.min(oldValue.length, newValue.length);

  let prefix = 0;
  while (prefix < shortest && oldValue[prefix] === newValue[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
  ) {
    suffix++;
  }

  if (at < prefix) return at;
  if (at >= oldValue.length - suffix) return newValue.length - (oldValue.length - at);
  return newValue.length - suffix;
}
