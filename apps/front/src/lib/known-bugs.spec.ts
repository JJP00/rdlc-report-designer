import type { ItemDto, RectangleDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { alignBoxes, alignCommands } from './align';
import { cm } from './projection';
import { computeResize } from './resize';

/**
 * Regresiones de bugs conocidos del front reproducibles con funciones puras.
 * Cada `it.fails` describe el comportamiento CORRECTO y hoy falla: al
 * arreglar el bug, quitar `.fails` (el test debe pasar entonces).
 * Los bugs que solo se alcanzan desde hooks/componentes están en
 * `apps/back/e2e/known-bugs.spec.ts`.
 */

/**
 * BUG-35 — Alinear una selección que contiene un rectángulo **y** uno de sus
 * hijos mezcla espacios de coordenadas: `alignBoxes` toma `top/left` crudos
 * (los del hijo son relativos al rectángulo) y `alignCommands` los compara
 * como si fueran del mismo espacio.
 * Origen: apps/front/src/lib/align.ts:25 (alignBoxes), usado desde
 * apps/front/src/components/panels/MultiSelectionPanel.tsx:87.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-35 alinear rectángulo + hijo mezcla coordenadas', () => {
  const child: TextboxDto = {
    kind: 'textbox',
    id: 'Child',
    // Relativo al rectángulo: en absoluto está en left = 5 + 1 = 6 cm.
    top: cm(0.5),
    left: cm(1),
    width: cm(2),
    height: cm(0.5),
    paragraphs: [],
  };
  const rect: RectangleDto = {
    kind: 'rectangle',
    id: 'Rect',
    top: cm(2),
    left: cm(5),
    width: cm(6),
    height: cm(3),
    children: [child],
  };
  // Lo que pasa hoy el hook (useItemEditing.selectedItems): los items tal cual
  // los devuelve findItem, cada uno con sus coordenadas propias.
  const items: ItemDto[] = [rect, child];

  it.fails('alinear a la izquierda no lleva el rectángulo al left relativo del hijo', () => {
    const commands = alignCommands(alignBoxes(items, ['Rect', 'Child']), 'left');
    // El borde izquierdo de la selección (en absoluto) es el del rectángulo
    // (5 cm): el rectángulo no debe moverse. Hoy recibe left = 1 cm (el left
    // relativo del hijo).
    const rectMove = commands.find((command) => 'id' in command && command.id === 'Rect') as
      { left: { value: number } } | undefined;
    if (rectMove) expect(rectMove.left.value).toBeCloseTo(5, 4);
  });
});

/**
 * BUG-36 — Límites duros en hijos de rectángulo: si el hijo ya desborda a su
 * contenedor por la derecha, redimensionar SOLO con el tirador S (alto)
 * recorta también su ancho al borde del contenedor.
 * Origen: apps/front/src/lib/resize.ts:114-124 (rama `bounds`), con los
 * bounds del rectángulo padre que pasa CanvasPreview.computeSelectedFrame /
 * ItemView.tsx ~488.
 * Remove `.fails` when fixing; the test must then pass.
 */
describe('BUG-36 el tirador S recorta el ancho de un hijo que ya desborda', () => {
  it.fails('arrastrar S solo cambia el alto', () => {
    const result = computeResize({
      handle: 's',
      // left 1 + width 5 = 6 > ancho del contenedor (4): ya desborda.
      start: { top: 0.5, left: 1, width: 5, height: 1 },
      dxCm: 0,
      dyCm: 0.5,
      bounds: { width: 4, height: 10 },
      snap: false,
      snapCm: 0.1,
    });
    expect(result).toEqual({ top: 0.5, left: 1, width: 5, height: 1.5 });
  });
});
