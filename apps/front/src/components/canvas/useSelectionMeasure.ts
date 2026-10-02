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

  // El propio stage, para que los guiones de QA puedan consultar
  // `getIntersection` (hit-test de Konva, no del dominio).
  useEffect(() => {
    if (TEST_HOOKS_ENABLED) {
      (window as Window & { __rdlcStage?: Konva.Stage | null }).__rdlcStage = stageRef.current;
    }
  }, [stageRef]);

  // QA: celda seleccionada (el marco de item no existe para celdas).
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcCell?: SelectedCell | null }).__rdlcCell = selectedCell ?? null;
  }, [selectedCell]);

  useEffect(() => {
    const stage = stageRef.current;
    const measuredId = selectedId ?? selectedCell?.id ?? null;
    const rect = stage && measuredId ? measureSelection(stage, measuredId) : null;
    setSelectionRect(rect);

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
