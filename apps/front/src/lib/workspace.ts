import type {
  ConflictDetectedEvent,
  DirtyChangedEvent,
  DocumentChangedEvent,
  ExternalReloadFailedEvent,
  FileMissingChangedEvent,
  ListedSession,
  ProjectionDto,
  SavedEvent,
  SessionClosedEvent,
} from '@rdlc-designer/contracts';
import type { SelectedCell } from './tablix';

/**
 * Modelo puro del workspace de pestañas (fase MVP de pestañas, bloque A): una
 * pestaña por sesión del backend, con su proyección, `dirty`, conflicto,
 * estado y errores **independientes**. Los hooks (`useWorkspace`) son la
 * autoridad de React; aquí viven las transiciones puras para poder probarlas
 * sin DOM.
 *
 * Las actualizaciones son inmutables (Map nuevo en cada cambio) para que React
 * detecte el estado nuevo; el coste es despreciable con puñados de pestañas.
 */

/** Estado de UI de una pestaña: selección, zoom y paneles sobreviven al cambio. */
export interface TabUiState {
  selectedId: string | null;
  selectedIds: string[];
  selectedCell: SelectedCell | null;
  zoom: number;
  showVariables: boolean;
  showHierarchy: boolean;
}

export interface TabState {
  sessionId: string;
  /** Ruta abierta (clave del anti-duplicados; `saveAs` la actualiza). */
  path: string;
  projection: ProjectionDto;
  dirty: boolean;
  /** Ruta del fichero que cambió por fuera mientras había cambios locales. */
  conflict: string | null;
  /** Ruta del fichero de la sesión que ya no existe en disco (null si existe). */
  fileMissing: string | null;
  /** Línea de estado de ESA pestaña. */
  status: string;
  error: string | null;
  /** Recargas externas de ESA pestaña. */
  reloads: number;
  /**
   * La sesión ya tiene algo en su portapapeles (copiar/cortar). El portapapeles
   * del backend es **por sesión**: este flag decide si «Pegar» está disponible
   * en ESA pestaña (bloque E).
   */
  hasClipboard: boolean;
  ui: TabUiState;
}

export interface WorkspaceState {
  tabs: Map<string, TabState>;
  /** Orden de las pestañas (izquierda → derecha). */
  order: string[];
  activeSessionId: string | null;
}

/** Estado del pie sin ninguna pestaña abierta. */
export const IDLE_STATUS = 'Listo. Abre un informe .rdlc de Business Central o un .rdl 2016.';
/** Pie tras cerrar la última pestaña (no se cierra la ventana). */
export const CLOSED_STATUS = 'Documento cerrado.';
/** Aviso al detectar un cambio externo con cambios locales (conflicto). */
export const CONFLICT_STATUS = 'El fichero cambió en disco. Tus cambios siguen en el editor.';
/** Recarga externa aplicada (evento `documentChanged` con `reason: 'external'`). */
export const RELOADED_STATUS = 'Recargado desde disco';

/** Estado de UI por defecto de una pestaña nueva. */
export function createTabUiState(): TabUiState {
  return {
    selectedId: null,
    selectedIds: [],
    selectedCell: null,
    zoom: 0.6,
    showVariables: false,
    showHierarchy: false,
  };
}

/**
 * UI de la pestaña activa cuando no hay ninguna: referencia **estable** (no se
 * re-crea en cada render) y nunca se muta, solo se lee.
 */
export const EMPTY_TAB_UI: TabUiState = Object.freeze(createTabUiState());

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameExtras(
  a: readonly { row: number; col: number }[] | undefined,
  b: readonly { row: number; col: number }[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every((cell, index) => cell.row === right[index]?.row && cell.col === right[index]?.col)
  );
}

/** Igualdad por valor del estado de UI (evita updates que no cambian nada). */
export function sameTabUi(a: TabUiState, b: TabUiState): boolean {
  if (a === b) return true;
  return (
    a.selectedId === b.selectedId &&
    sameStringList(a.selectedIds, b.selectedIds) &&
    sameSelectedCell(a.selectedCell, b.selectedCell) &&
    a.zoom === b.zoom &&
    a.showVariables === b.showVariables &&
    a.showHierarchy === b.showHierarchy
  );
}

function sameSelectedCell(a: SelectedCell | null, b: SelectedCell | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.row === b.row &&
    a.col === b.col &&
    a.endRow === b.endRow &&
    a.endCol === b.endCol &&
    sameExtras(a.extra, b.extra)
  );
}

/**
 * Aplica un parche al `ui` de UNA pestaña (selección, zoom, paneles). Si el
 * parche no cambia nada devuelve el estado tal cual: iterar sobre el store no
 * provoca renders y no puede realimentar un bucle `setState` ↔ store.
 */
export function updateTabUi(
  state: WorkspaceState,
  sessionId: string,
  patch: Partial<TabUiState>,
): WorkspaceState {
  const tab = state.tabs.get(sessionId);
  if (!tab) return state;
  const ui: TabUiState = { ...tab.ui, ...patch };
  if (sameTabUi(tab.ui, ui)) return state;
  return updateTab(state, sessionId, { ui });
}

/**
 * Parche al `ui` de una pestaña: un objeto, o una función que lo deriva del
 * estado actual (para lecturas-modificación-escrituras —p. ej. alternar una
 * selección— que no deben perderse si hay más de un cambio en vuelo).
 */
export type TabUiPatch = Partial<TabUiState> | ((ui: TabUiState) => Partial<TabUiState>);

/** Resuelve un parche funcional contra el `ui` actual; un objeto pasa tal cual. */
export function resolveTabUiPatch(ui: TabUiState, patch: TabUiPatch): Partial<TabUiState> {
  return typeof patch === 'function' ? patch(ui) : patch;
}

export function openedStatus(path: string): string {
  return `Abierto: ${path}`;
}

export function createdStatus(path: string): string {
  return `Nuevo informe: ${path}`;
}

export function recoveredStatus(path: string): string {
  return `Sesión recuperada: ${path}`;
}

export interface CreateTabInput {
  sessionId: string;
  path: string;
  projection: ProjectionDto;
  dirty?: boolean;
  status?: string;
}

export function createTab(input: CreateTabInput): TabState {
  return {
    sessionId: input.sessionId,
    path: input.path,
    projection: input.projection,
    dirty: input.dirty ?? false,
    conflict: null,
    fileMissing: null,
    status: input.status ?? IDLE_STATUS,
    error: null,
    reloads: 0,
    hasClipboard: false,
    ui: createTabUiState(),
  };
}

export function createWorkspace(): WorkspaceState {
  return { tabs: new Map(), order: [], activeSessionId: null };
}

/** true en plataformas con rutas case-insensitive (Windows). */
export function isCaseInsensitivePathPlatform(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') return true;
  const userAgent = navigator.userAgent;
  if (userAgent === '') return true;
  // El entorno de tests (vitest/Node) no es un navegador real: se asume
  // Windows, la plataforma objetivo de la app.
  if (/node\.js/i.test(userAgent)) return true;
  return /windows/i.test(userAgent);
}

/**
 * Normaliza una ruta para comparar (anti-duplicados): separadores unificados,
 * barras repetidas y barra final fuera; en Windows además sin distinguir
 * mayúsculas.
 */
export function normalizePath(path: string, caseInsensitive = isCaseInsensitivePathPlatform()): string {
  const collapsed = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  return caseInsensitive ? trimmed.toLowerCase() : trimmed;
}

/** Pestaña abierta con esa ruta (comparación normalizada), si la hay. */
export function findTabByPath(
  state: WorkspaceState,
  path: string,
  caseInsensitive = isCaseInsensitivePathPlatform(),
): string | undefined {
  const wanted = normalizePath(path, caseInsensitive);
  return state.order.find((sessionId) => {
    const tab = state.tabs.get(sessionId);
    return tab !== undefined && normalizePath(tab.path, caseInsensitive) === wanted;
  });
}

/**
 * Añade una pestaña y la activa. Anti-duplicados: si la ruta ya está abierta
 * se activa la existente (nunca se reabre); si la sesión ya está en el
 * workspace se actualiza y se activa.
 */
export function openTab(state: WorkspaceState, tab: TabState): WorkspaceState {
  const existingSession = state.tabs.get(tab.sessionId);
  if (existingSession) {
    return activateTab(
      updateTab(state, tab.sessionId, {
        path: tab.path,
        projection: tab.projection,
        dirty: tab.dirty,
      }),
      tab.sessionId,
    );
  }
  const existingPath = findTabByPath(state, tab.path);
  if (existingPath !== undefined) return activateTab(state, existingPath);

  const tabs = new Map(state.tabs);
  tabs.set(tab.sessionId, tab);
  return {
    tabs,
    order: [...state.order, tab.sessionId],
    activeSessionId: tab.sessionId,
  };
}

export function activateTab(state: WorkspaceState, sessionId: string): WorkspaceState {
  if (state.activeSessionId === sessionId || !state.tabs.has(sessionId)) return state;
  return { tabs: state.tabs, order: state.order, activeSessionId: sessionId };
}

/**
 * Elimina la pestaña (idempotente: el `sessionClosed` puede llegar después de
 * que el front la quitara). Si era la activa, la nueva activa es la **vecina
 * de la derecha**; si no la hay, la de la izquierda.
 */
export function removeTab(state: WorkspaceState, sessionId: string): WorkspaceState {
  const index = state.order.indexOf(sessionId);
  if (index < 0) return state;

  const order = state.order.filter((id) => id !== sessionId);
  const tabs = new Map(state.tabs);
  tabs.delete(sessionId);

  let activeSessionId = state.activeSessionId;
  if (activeSessionId === sessionId) {
    activeSessionId = order[index] ?? order[index - 1] ?? null;
  }
  return { tabs, order, activeSessionId };
}

export function updateTab(
  state: WorkspaceState,
  sessionId: string,
  patch: Partial<TabState>,
): WorkspaceState {
  const tab = state.tabs.get(sessionId);
  if (!tab) return state;
  const tabs = new Map(state.tabs);
  tabs.set(sessionId, { ...tab, ...patch });
  return { tabs, order: state.order, activeSessionId: state.activeSessionId };
}

/**
 * El usuario copió/cortó en esa sesión: su pestaña ya puede pegar. El
 * portapapeles del backend es por sesión, así que el flag vive en `TabState`.
 */
export function markClipboard(state: WorkspaceState, sessionId: string): WorkspaceState {
  return updateTab(state, sessionId, { hasClipboard: true });
}

/** Aplica un parche a la proyección de una pestaña concreta. */
export function patchTabProjection(
  state: WorkspaceState,
  sessionId: string,
  patch: (projection: ProjectionDto) => ProjectionDto,
): WorkspaceState {
  const tab = state.tabs.get(sessionId);
  if (!tab) return state;
  return updateTab(state, sessionId, { projection: patch(tab.projection) });
}

/** Rota la pestaña activa (Ctrl+Tab / Ctrl+Shift+Tab) con vuelta circular. */
export function cycleTab(state: WorkspaceState, direction: 1 | -1): WorkspaceState {
  if (state.activeSessionId === null || state.order.length === 0) return state;
  const index = state.order.indexOf(state.activeSessionId);
  if (index < 0) return state;
  const next = (index + direction + state.order.length) % state.order.length;
  const nextId = state.order[next];
  return nextId === undefined ? state : activateTab(state, nextId);
}

/** Qué pestañas cierra una orden del menú contextual de la tira. */
export type CloseScope = 'self' | 'saved' | 'all' | 'others' | 'right';

/**
 * Pestañas que cierra `scope` desde la pestaña `anchorId` (en orden de la
 * tira): ella misma, las que no tienen cambios, todas, todas menos ella o las
 * de su derecha. Una ancla inexistente no cierra nada (salvo `all`/`saved`).
 */
export function closeTargets(
  state: WorkspaceState,
  scope: CloseScope,
  anchorId: string,
): string[] {
  const index = state.order.indexOf(anchorId);
  switch (scope) {
    case 'self':
      return index < 0 ? [] : [anchorId];
    case 'saved':
      return state.order.filter((id) => state.tabs.get(id)?.dirty === false);
    case 'all':
      return [...state.order];
    case 'others':
      return index < 0 ? [] : state.order.filter((id) => id !== anchorId);
    case 'right':
      return index < 0 ? [] : state.order.slice(index + 1);
  }
}

/**
 * Mueve una pestaña a la posición `toIndex` de la tira (reordenar por arrastre
 * o con Ctrl+Shift+RePág/AvPág). El índice se acota al rango; no cambia la
 * pestaña activa ni toca ninguna sesión. Sin efecto (mismo estado) si la
 * pestaña no existe o ya está en esa posición.
 */
export function moveTab(
  state: WorkspaceState,
  sessionId: string,
  toIndex: number,
): WorkspaceState {
  const from = state.order.indexOf(sessionId);
  if (from < 0) return state;
  const target = Math.max(0, Math.min(state.order.length - 1, toIndex));
  if (target === from) return state;
  const order = [...state.order];
  order.splice(from, 1);
  order.splice(target, 0, sessionId);
  return { ...state, order };
}

/**
 * Re-adopta las sesiones vivas del backend tras recargar la interfaz: todas
 * como pestañas en orden de apertura, activa la última (BUG-51). Propaga
 * `missing` a `fileMissing` y, si se da `restoreUi`, recupera el estado de UI
 * guardado de cada sesión (selección, zoom, paneles).
 */
export function adoptSessions(
  state: WorkspaceState,
  sessions: readonly ListedSession[],
  restoreUi?: (sessionId: string) => TabUiState | undefined,
): WorkspaceState {
  if (sessions.length === 0) return state;
  const tabs = new Map(state.tabs);
  const order = [...state.order];
  for (const session of sessions) {
    if (tabs.has(session.sessionId)) continue;
    const created = createTab({
      sessionId: session.sessionId,
      path: session.filePath,
      projection: session.projection,
      dirty: session.dirty,
      status: recoveredStatus(session.filePath),
    });
    tabs.set(session.sessionId, {
      ...created,
      fileMissing: session.missing ? session.filePath : null,
      ui: restoreUi?.(session.sessionId) ?? created.ui,
    });
    order.push(session.sessionId);
  }
  const last = sessions[sessions.length - 1];
  return {
    tabs,
    order,
    activeSessionId: last ? last.sessionId : state.activeSessionId,
  };
}

/* ------------------------- eventos (backend → front) ---------------------- */

/**
 * `documentChanged` de UNA pestaña: la proyección solo avanza (un snapshot
 * viejo no pisa uno nuevo); las recargas externas cuentan y además resuelven el
 * conflicto pendiente (BUG-53).
 */
export function applyDocumentChanged(
  state: WorkspaceState,
  event: DocumentChangedEvent,
): WorkspaceState {
  const tab = state.tabs.get(event.sessionId);
  if (!tab) return state;

  let next = state;
  if (event.projection.version >= tab.projection.version) {
    next = updateTab(next, event.sessionId, { projection: event.projection });
  }
  if (event.reason === 'external') {
    next = updateTab(next, event.sessionId, {
      conflict: null,
      reloads: tab.reloads + 1,
      status: RELOADED_STATUS,
      // La recarga externa descarta el documento anterior: su portapapeles
      // (nodos del árbol viejo) también se va en el backend.
      hasClipboard: false,
    });
  }
  return next;
}

export function applyDirtyChanged(state: WorkspaceState, event: DirtyChangedEvent): WorkspaceState {
  return updateTab(state, event.sessionId, { dirty: event.dirty });
}

export function applyConflictDetected(
  state: WorkspaceState,
  event: ConflictDetectedEvent,
): WorkspaceState {
  return updateTab(state, event.sessionId, {
    conflict: event.filePath,
    status: CONFLICT_STATUS,
  });
}

/** Guardado consumado en el backend: limpia el conflicto (robustez). */
export function applySavedEvent(state: WorkspaceState, event: SavedEvent): WorkspaceState {
  return updateTab(state, event.sessionId, {
    path: event.path,
    conflict: null,
    fileMissing: null,
  });
}

export function applyFileMissingChanged(
  state: WorkspaceState,
  event: FileMissingChangedEvent,
): WorkspaceState {
  return updateTab(state, event.sessionId, {
    fileMissing: event.missing ? event.filePath : null,
  });
}

export function applyExternalReloadFailed(
  state: WorkspaceState,
  event: ExternalReloadFailedEvent,
): WorkspaceState {
  return updateTab(state, event.sessionId, {
    conflict: null,
    status:
      event.reason === 'unsupportedSchema'
        ? 'El fichero cambió en disco a un RDL anterior a 2016; no se recargó.'
        : 'El fichero cambió en disco, pero no se pudo leer (puede estar a medias). Se mantiene la copia en memoria.',
  });
}

export function applySessionClosed(
  state: WorkspaceState,
  event: SessionClosedEvent,
): WorkspaceState {
  return removeTab(state, event.sessionId);
}
