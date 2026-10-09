import type { SelectedCell } from './tablix';
import { createTabUiState, type TabUiState } from './workspace';
import { ZOOM_MAX, ZOOM_MIN } from './zoom';

/**
 * Persistencia del estado de UI por pestaña (selección, zoom, paneles) en
 * `sessionStorage`, con clave por `sessionId`: sobrevive a recargar la interfaz
 * (el backend conserva las sesiones y el front las re-adopta) y muere con la
 * ventana. Todo es puro salvo el acceso al `Storage`, que se inyecta y está
 * envuelto en try/catch (puede no existir o lanzar: modo privado, cuota…).
 */

const KEY_PREFIX = 'rdlc.tabUi.';

/** Subconjunto mínimo de `Storage` que se usa (inyectable en tests). */
export interface TabUiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function tabUiStorageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** `sessionStorage` si existe y es accesible; si no, `undefined`. */
export function defaultTabUiStorage(): TabUiStorage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSelectedCell(value: unknown): SelectedCell | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !isFiniteNumber(value.row) || !isFiniteNumber(value.col)) {
    return null;
  }
  const cell: SelectedCell = { id: value.id, row: value.row, col: value.col };
  if (isFiniteNumber(value.endRow)) cell.endRow = value.endRow;
  if (isFiniteNumber(value.endCol)) cell.endCol = value.endCol;
  if (Array.isArray(value.extra)) {
    cell.extra = value.extra.flatMap((entry: unknown) =>
      isRecord(entry) && isFiniteNumber(entry.row) && isFiniteNumber(entry.col)
        ? [{ row: entry.row, col: entry.col }]
        : [],
    );
  }
  return cell;
}

/**
 * Valida un valor leído (JSON ya parseado) campo a campo: lo que no es válido
 * se sustituye por el valor por defecto, nunca se confía en el contenido.
 */
export function sanitizeTabUi(raw: unknown): TabUiState {
  const base = createTabUiState();
  if (!isRecord(raw)) return base;
  return {
    selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : null,
    selectedIds: Array.isArray(raw.selectedIds)
      ? raw.selectedIds.filter((id): id is string => typeof id === 'string')
      : [],
    selectedCell: parseSelectedCell(raw.selectedCell),
    zoom: isFiniteNumber(raw.zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw.zoom)) : base.zoom,
    showVariables: raw.showVariables === true,
    showHierarchy: raw.showHierarchy === true,
  };
}

/** Serializa solo los campos serializables y conocidos del `ui`. */
export function serializeTabUi(ui: TabUiState): string {
  return JSON.stringify({
    selectedId: ui.selectedId,
    selectedIds: ui.selectedIds,
    selectedCell: ui.selectedCell,
    zoom: ui.zoom,
    showVariables: ui.showVariables,
    showHierarchy: ui.showHierarchy,
  });
}

/** Lee el `ui` guardado de una sesión; `undefined` si no hay nada utilizable. */
export function loadTabUi(
  sessionId: string,
  storage: TabUiStorage | undefined = defaultTabUiStorage(),
): TabUiState | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(tabUiStorageKey(sessionId));
    if (raw === null) return undefined;
    return sanitizeTabUi(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function saveTabUi(
  sessionId: string,
  ui: TabUiState,
  storage: TabUiStorage | undefined = defaultTabUiStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(tabUiStorageKey(sessionId), serializeTabUi(ui));
  } catch {
    // Sin cuota o sin acceso: el estado de UI es una comodidad, no un dato.
  }
}

export function removeTabUi(
  sessionId: string,
  storage: TabUiStorage | undefined = defaultTabUiStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(tabUiStorageKey(sessionId));
  } catch {
    // Ídem.
  }
}
