import type { ItemDto, Length, ProjectionDto, StylePatch } from '@rdlc-designer/contracts';
import { findItem, patchItem } from './projection';
import { optimisticStylePatch } from './stylePatch';

/**
 * Vista previa de los campos numéricos mientras se arrastran (*scrub*): un
 * parche **local** sobre la proyección, sin comando al backend (ni entrada de
 * undo). Al soltar manda el commit real; al cancelar se restauran los valores
 * originales.
 */

/** Parche de un item: las claves tocadas y sus valores de la vista previa. */
export interface ItemPreview {
  id: string;
  patch: Partial<ItemDto>;
}

/** Calcula los parches contra la proyección vigente (para derivar del item actual). */
export type ItemPreviewBuilder = (projection: ProjectionDto) => ItemPreview[];

export interface ProjectionPreview {
  /** Aplica la vista previa; la primera vez recuerda el valor original de cada clave. */
  apply: (projection: ProjectionDto, build: ItemPreviewBuilder) => ProjectionDto;
  /** Restaura los originales (si la proyección ya no es la previsualizada, no toca nada). */
  revert: (projection: ProjectionDto) => ProjectionDto;
}

interface Touched {
  original: unknown;
  /** Valor que dejó la vista previa: si la proyección ya no lo tiene, algo lo sustituyó. */
  shown: unknown;
}

/**
 * Estado de una vista previa. Una sesión de arrastre termina al cancelar
 * (`revert`) o cuando el commit real sustituye lo previsualizado: se detecta
 * porque el valor de alguna clave ya no es el que dejó la vista previa (el
 * commit crea objetos nuevos), y el siguiente `apply` empieza una sesión limpia
 * en vez de «restaurar» valores de un arrastre anterior.
 */
export function createProjectionPreview(): ProjectionPreview {
  let session = new Map<string, Map<string, Touched>>();

  const read = (item: ItemDto, key: string): unknown =>
    (item as unknown as Record<string, unknown>)[key];

  const isStale = (projection: ProjectionDto): boolean => {
    for (const [id, keys] of session) {
      const item = findItem(projection, id);
      if (!item) continue;
      for (const [key, touched] of keys) {
        if (read(item, key) !== touched.shown) return true;
      }
    }
    return false;
  };

  return {
    apply(projection, build) {
      if (isStale(projection)) session = new Map();
      let next = projection;
      for (const { id, patch } of build(projection)) {
        const item = findItem(next, id);
        if (!item) continue;
        const keys = session.get(id) ?? new Map<string, Touched>();
        for (const key of Object.keys(patch)) {
          const shown = (patch as Record<string, unknown>)[key];
          const original = keys.has(key) ? keys.get(key)!.original : read(item, key);
          keys.set(key, { original, shown });
        }
        session.set(id, keys);
        next = patchItem(next, id, patch);
      }
      return next;
    },

    revert(projection) {
      const stale = isStale(projection);
      const touchedSession = session;
      session = new Map();
      if (stale) return projection;
      let next = projection;
      for (const [id, keys] of touchedSession) {
        const original: Record<string, unknown> = {};
        for (const [key, touched] of keys) original[key] = touched.original;
        next = patchItem(next, id, original as Partial<ItemDto>);
      }
      return next;
    },
  };
}

/* -------------------------------- constructores ------------------------------- */

/** Parche directo de claves del item (posición, tamaño…). */
export function itemPreview(id: string, patch: Partial<ItemDto>): ItemPreviewBuilder {
  return () => [{ id, patch }];
}

/** Un `StylePatch` (tamaño de fuente, padding, borde…) sobre varios items, como el camino optimista de `setStyle`. */
export function stylePreview(ids: readonly string[], patch: StylePatch): ItemPreviewBuilder {
  return (projection) =>
    ids.flatMap((id) => {
      const item = findItem(projection, id);
      return item ? [{ id, patch: optimisticStylePatch(item, patch) }] : [];
    });
}

/**
 * Ancho de una columna o alto de una fila de la rejilla de un Tablix (índice de
 * `body`). El backend además propaga el tamaño al contenido de la celda: aquí
 * solo se previsualiza la rejilla, que es lo que se pinta.
 */
export function tablixTrackPreview(
  id: string,
  axis: 'row' | 'column',
  index: number,
  size: Length,
): ItemPreviewBuilder {
  return (projection) => {
    const item = findItem(projection, id);
    if (item?.kind !== 'tablix') return [];
    if (axis === 'column') {
      if (index < 0 || index >= item.body.columns.length) return [];
      const columns = item.body.columns.map((column, i) => (i === index ? size : column));
      return [{ id, patch: { body: { ...item.body, columns } } as Partial<ItemDto> }];
    }
    if (index < 0 || index >= item.body.rows.length) return [];
    const rows = item.body.rows.map((row, i) => (i === index ? { ...row, height: size } : row));
    return [{ id, patch: { body: { ...item.body, rows } } as Partial<ItemDto> }];
  };
}
