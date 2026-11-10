/**
 * Tamaño de los paneles de la ventana (Jerarquía, Variables, Propiedades y
 * Problemas) y si Propiedades está plegado. Es una preferencia **de la app**,
 * no de cada informe: la comparten todas las pestañas y se guarda entre
 * sesiones (`localStorage`, best-effort).
 */

export type PanelKey = 'hierarchy' | 'variables' | 'inspector' | 'problems';

/**
 * Límites en px. El inicial es el ancho fijo que tenían. Los mínimos dejan
 * sitio al lienzo en la ventana mínima (960 px): 200 + 220 + 280 + lienzo.
 */
export const PANEL_LIMITS: Record<PanelKey, { min: number; max: number; initial: number }> = {
  hierarchy: { min: 200, max: 560, initial: 256 },
  variables: { min: 220, max: 560, initial: 288 },
  inspector: { min: 280, max: 720, initial: 320 },
  problems: { min: 96, max: 640, initial: 224 },
};

/** Ancho mínimo que los paneles le dejan siempre al lienzo (px). */
export const CANVAS_MIN_PX = 320;

export interface PanelLayout {
  /** Tamaño de cada panel (ancho; alto en Problemas). */
  sizes: Record<PanelKey, number>;
  /**
   * Problemas: `false` = alto según su contenido (hasta el inicial); `true` =
   * el usuario fijó un alto (`sizes.problems`).
   */
  problemsSized: boolean;
  inspectorCollapsed: boolean;
}

export const INITIAL_PANEL_LAYOUT: PanelLayout = {
  sizes: {
    hierarchy: PANEL_LIMITS.hierarchy.initial,
    variables: PANEL_LIMITS.variables.initial,
    inspector: PANEL_LIMITS.inspector.initial,
    problems: PANEL_LIMITS.problems.initial,
  },
  problemsSized: false,
  inspectorCollapsed: false,
};

/**
 * Tamaño dentro de los límites del panel. `room` = cuánto puede crecer como
 * mucho sin dejar el lienzo por debajo de su mínimo (sin medir: sin tope extra).
 */
export function clampPanelSize(
  key: PanelKey,
  px: number,
  current: number,
  room = Number.POSITIVE_INFINITY,
): number {
  const { min, max } = PANEL_LIMITS[key];
  const top = Math.max(min, Math.min(max, current + Math.max(0, room)));
  return Math.round(Math.min(Math.max(px, min), top));
}

/** Lee lo guardado; lo que falte o no valga, al valor inicial. */
export function parsePanelLayout(raw: string | null): PanelLayout {
  if (!raw) return INITIAL_PANEL_LAYOUT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return INITIAL_PANEL_LAYOUT;
  }
  if (!data || typeof data !== 'object') return INITIAL_PANEL_LAYOUT;
  const record = data as Record<string, unknown>;
  const stored = (record['sizes'] ?? {}) as Record<string, unknown>;
  const size = (key: PanelKey): number => {
    const value = stored[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return PANEL_LIMITS[key].initial;
    const { min, max } = PANEL_LIMITS[key];
    return Math.round(Math.min(Math.max(value, min), max));
  };
  return {
    sizes: {
      hierarchy: size('hierarchy'),
      variables: size('variables'),
      inspector: size('inspector'),
      problems: size('problems'),
    },
    problemsSized: record['problemsSized'] === true,
    inspectorCollapsed: record['inspectorCollapsed'] === true,
  };
}

export function serializePanelLayout(layout: PanelLayout): string {
  return JSON.stringify(layout);
}
