import type { TabState } from './workspace';

/**
 * Guarda de cierre de la **ventana** (fase MVP de pestañas, bloque C): decide
 * qué diálogo hace falta y resuelve el «Guardar todas» en orden, abortando al
 * primer fallo. La lógica es pura (sin React) para poder probarla con dobles y
 * para que `useWorkspace` solo se encargue del cableado.
 */

/** Pestaña afectada por una guarda de cierre. */
export interface ClosingTab {
  sessionId: string;
  path: string;
}

/** Acción que perdería cambios sin guardar y exige confirmación. */
export type PendingIntent =
  | { kind: 'close'; sessionId: string; path: string }
  | { kind: 'windowClose'; sessionId: string; path: string }
  | { kind: 'windowCloseAll'; tabs: readonly ClosingTab[] };

/** Resolución del diálogo de cambios sin guardar. */
export type PendingResolution = 'save' | 'discard' | 'cancel';

/** Qué hacer cuando el SO pide cerrar la ventana. */
export type WindowClosePlan =
  | { kind: 'confirm' }
  | { kind: 'intent'; intent: PendingIntent };

/** Pestañas sucias, en orden, como intención de cierre. */
export function dirtyClosingTabs(tabs: readonly TabState[]): ClosingTab[] {
  return tabs
    .filter((tab) => tab.dirty)
    .map((tab) => ({ sessionId: tab.sessionId, path: tab.path }));
}

/**
 * Plan del cierre de ventana: sin sucias se confirma directamente; con una se
 * usa la guarda de una pestaña (diálogo actual); con varias, el «Guardar todas
 * / Descartar todas / Cancelar».
 */
export function planWindowClose(tabs: readonly TabState[]): WindowClosePlan {
  const dirty = dirtyClosingTabs(tabs);
  if (dirty.length === 0) return { kind: 'confirm' };
  if (dirty.length === 1) {
    const only = dirty[0]!;
    return {
      kind: 'intent',
      intent: { kind: 'windowClose', sessionId: only.sessionId, path: only.path },
    };
  }
  return { kind: 'intent', intent: { kind: 'windowCloseAll', tabs: dirty } };
}

/** Resultado de guardar todas: todo bien o la pestaña que falló (la primera). */
export type SaveAllOutcome = { ok: true } | { ok: false; failed: ClosingTab };

/**
 * Guarda las pestañas indicadas **en orden**. Al primer fallo se detiene y
 * devuelve la pestaña que falló: el cierre se cancela y el usuario la verá
 * activa con su error. Las pestañas que ya no están abiertas se saltan
 * (`sessionClosed` pudo llegar mientras el diálogo estaba en pantalla).
 */
export async function saveTabsInOrder(
  tabs: readonly ClosingTab[],
  isOpen: (sessionId: string) => boolean,
  saveOne: (sessionId: string) => Promise<boolean>,
): Promise<SaveAllOutcome> {
  for (const tab of tabs) {
    if (!isOpen(tab.sessionId)) continue;
    const saved = await saveOne(tab.sessionId);
    if (!saved) return { ok: false, failed: tab };
  }
  return { ok: true };
}
