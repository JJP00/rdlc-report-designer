import type Konva from 'konva';
import { useEffect, useState, type RefObject } from 'react';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';
import type { SelectedCell } from '@/lib/tablix';

/**
 * Marco de selección medido del **nodo Konva real** (funciona con items
 * anidados y celdas) + publicación de los ganchos de QA. En un Tablix manda su
 * **borde** (la rejilla): medir el grupo incluiría el contenido que sobresale
 * de las celdas e inflaría el marco y los tiradores.
 */

export interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseSelectionMeasureOptions {
  stageRef: RefObject<Konva.Stage | null>;
  selectedId?: string | null;
  selectedCell?: SelectedCell | null;
  /** Cambia con la proyección: fuerza una remedición cuando algo se mueve. */
  projection: unknown;
  zoom: number;
}

export function useSelectionMeasure({
  stageRef,
  selectedId,
  selectedCell,
  projection,
  zoom,
}: UseSelectionMeasureOptions): RectPx | null {
  const [selectionRect, setSelectionRect] = useState<RectPx | null>(null);

  // QA: celda seleccionada (el marco de item no existe para celdas).
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcCell?: SelectedCell | null }).__rdlcCell = selectedCell ?? null;
  }, [selectedCell]);

  useEffect(() => {
    const stage = stageRef.current;
    const measuredId = selectedId ?? selectedCell?.id ?? null;
    const rect = stage && measuredId ? measureSelection(stage, measuredId) : null;
    // Sin guarda de igualdad este efecto (que depende de la proyección y del
    // zoom) publica un objeto nuevo en cada pasada; con un bucle de drag de
    // Konva podía encadenar renders («Maximum update depth exceeded», BUG-47).
    setSelectionRect((previous) => (sameRect(previous, rect) ? previous : rect));

    // QA/diagnóstico: los guiones (Playwright) leen id + rect del elemento
    // seleccionado. Las cabeceras del Tablix las publica `SelectionFrame`.
    if (TEST_HOOKS_ENABLED && measuredId) {
      (
        window as Window & {
          __rdlcSelection?: { id: string; rect: RectPx | null; zoom: number } | null;
        }
      ).__rdlcSelection = rect ? { id: measuredId, rect, zoom } : null;
    }
  }, [stageRef, selectedId, selectedCell, projection, zoom]);

  return selectionRect;
}

/** Comparación por valor: medidas repetidas no deben re-renderizar. */
function sameRect(a: RectPx | null, b: RectPx | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Marcos de la **multiselección** (U3): el rect medido de cada miembro y su
 * caja envolvente, para que los tiradores del bloque redimensionen todos a la
 * vez. Si un miembro no se puede medir (nodo sin montar) no hay bloque fiable:
 * se devuelve `null` y manda el marco normal del item primario.
 */
export interface GroupMeasure {
  rect: RectPx;
  members: { id: string; rect: RectPx }[];
}

export function useGroupSelectionMeasure(options: {
  stageRef: RefObject<Konva.Stage | null>;
  /** Ids separados por `|` (una sola prop estable, como en los marcos extra). */
  idsKey: string;
  /** Cambia con la proyección: fuerza una remedición cuando algo se mueve. */
  projection: unknown;
  zoom: number;
}): GroupMeasure | null {
  const { stageRef, idsKey, projection, zoom } = options;
  const [measure, setMeasure] = useState<GroupMeasure | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const ids = idsKey.length > 0 ? idsKey.split('|') : [];
    const clear = (): void => setMeasure((previous) => (previous === null ? previous : null));
    if (!stage || ids.length < 2) {
      clear();
      return;
    }

    const members = ids.flatMap((id) => {
      const rect = measureSelection(stage, id);
      return rect ? [{ id, rect }] : [];
    });
    if (members.length !== ids.length) {
      clear();
      return;
    }

    const left = Math.min(...members.map((member) => member.rect.x));
    const top = Math.min(...members.map((member) => member.rect.y));
    const right = Math.max(...members.map((member) => member.rect.x + member.rect.width));
    const bottom = Math.max(...members.map((member) => member.rect.y + member.rect.height));
    const next: GroupMeasure = {
      rect: { x: left, y: top, width: right - left, height: bottom - top },
      members,
    };
    setMeasure((previous) => (sameMeasure(previous, next) ? previous : next));
  }, [stageRef, idsKey, projection, zoom]);

  return measure;
}

/** Igualdad por valor de todo el bloque (rect + cada miembro). */
function sameMeasure(a: GroupMeasure | null, b: GroupMeasure): boolean {
  if (!a || !sameRect(a.rect, b.rect)) return false;
  if (a.members.length !== b.members.length) return false;
  return a.members.every(
    (member, index) =>
      member.id === b.members[index]?.id && sameRect(member.rect, b.members[index]?.rect ?? null),
  );
}

/** Mide el nodo seleccionado; en un Tablix, su borde (la rejilla). */
export function measureSelection(stage: Konva.Stage, measuredId: string): RectPx | null {
  const node = stage.findOne((candidate: Konva.Node) => candidate.id() === measuredId);
  if (!node) return null;
  // Se mide la **caja** del item (`item-box`) o el borde de la rejilla del
  // Tablix, no el grupo: `getClientRect` incluiría descendientes que sobresalen
  // (texto sin `width`, adornos) e inflaría el marco y los tiradores.
  const measured = findOwnAdornment(node, ['tablix-border', 'item-box']) ?? node;
  return measured.getClientRect({ relativeTo: stage });
}

/**
 * Busca un adorno **del propio item** (`tablix-border`/`item-box`), no el de un
 * item anidado: `find()` recorre en profundidad y devolvería el borde del
 * primer Tablix interno (el borde propio se dibuja al final, tras las celdas),
 * así que al seleccionar `Tablix2` el marco salía sobre `LinesTable2`.
 * Se recorre por **niveles**: el adorno propio siempre está más cerca de la
 * raíz que el de los items anidados.
 */
function findOwnAdornment(root: Konva.Node, names: string[]): Konva.Node | undefined {
  const wanted = new Set(names);
  let level: Konva.Node[] = (root as Konva.Container).getChildren?.() ?? [];
  while (level.length > 0) {
    const found = level.find((node) => wanted.has(node.name()));
    if (found) return found;
    const next: Konva.Node[] = [];
    for (const node of level) {
      const children = (node as Konva.Container).getChildren?.();
      if (children) next.push(...children);
    }
    level = next;
  }
  return undefined;
}
