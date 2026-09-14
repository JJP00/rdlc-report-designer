import { formatLength, fromCm, parseLength, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Geometría de items y orden canónico de hijos (subconjunto del XSD RDL 2016
 * que usamos al crear elementos que faltan). El orden completo vivirá en
 * `ReportItemFactory` (F1); aquí basta para geometría y página.
 */

export interface ItemGeometry {
  top?: Length;
  left?: Length;
  width?: Length;
  height?: Length;
}

const REPORT_ITEM_ORDER = [
  'Style',
  'ActionInfo',
  'Top',
  'Left',
  'Height',
  'Width',
  'ZIndex',
  'Visibility',
  'ToolTip',
];

const TEXTBOX_ORDER = [
  ...REPORT_ITEM_ORDER,
  'CanGrow',
  'CanShrink',
  'HideDuplicates',
  'ToggleImage',
  'KeepTogether',
  'Paragraphs',
];

const TABLIX_ORDER = [
  ...REPORT_ITEM_ORDER,
  'TablixBody',
  'TablixColumnHierarchy',
  'TablixRowHierarchy',
  'RepeatColumnHeaders',
  'RepeatRowHeaders',
  'FixedColumnHeaders',
  'FixedRowHeaders',
  'TablixCorner',
  'KeepTogether',
];

const PAGE_ORDER = [
  'PageHeader',
  'PageFooter',
  'PageHeight',
  'PageWidth',
  'LeftMargin',
  'RightMargin',
  'TopMargin',
  'BottomMargin',
  'Style',
];

const CONTAINER_ORDERS: Record<string, string[]> = {
  Textbox: TEXTBOX_ORDER,
  Tablix: TABLIX_ORDER,
  Page: PAGE_ORDER,
};

function orderFor(parentTag: string): string[] {
  return CONTAINER_ORDERS[parentTag] ?? REPORT_ITEM_ORDER;
}

/* ---------------------- límites de la región --------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Clampa en cm; si el valor no cambia, conserva la longitud original (unidad incluida). */
function clampLength(length: Length, minCm: number, maxCm: number): Length {
  const cm = toCm(length);
  const clamped = clamp(cm, minCm, maxCm);
  return Math.abs(clamped - cm) < 1e-9 ? length : fromCm(clamped);
}

/**
 * Normaliza una posición para que el item no salga de su región
 * (`0 ≤ x`, `0 ≤ y`, `x+width ≤ región`, `y+height ≤ región`).
 */
export function clampPosition(
  top: Length,
  left: Length,
  width: Length,
  height: Length,
  bounds: { width: Length; height: Length },
): { top: Length; left: Length } {
  const maxLeft = toCm(bounds.width) - toCm(width);
  const maxTop = toCm(bounds.height) - toCm(height);
  return {
    top: clampLength(top, 0, maxTop),
    left: clampLength(left, 0, maxLeft),
  };
}

/** Normaliza un tamaño para que el item quepa desde su posición actual. */
export function clampSize(
  width: Length,
  height: Length,
  top: Length,
  left: Length,
  bounds: { width: Length; height: Length },
): { width: Length; height: Length } {
  const MIN_CM = 0.05;
  const maxWidth = Math.max(MIN_CM, toCm(bounds.width) - toCm(left));
  const maxHeight = Math.max(MIN_CM, toCm(bounds.height) - toCm(top));
  return {
    width: clampLength(width, MIN_CM, maxWidth),
    height: clampLength(height, MIN_CM, maxHeight),
  };
}

export function readLength(node: RdlcNode, tagName: string): Length | undefined {
  return parseLength(node.child(tagName)?.text());
}

export function readGeometry(node: RdlcNode): ItemGeometry {
  return {
    top: readLength(node, 'Top'),
    left: readLength(node, 'Left'),
    width: readLength(node, 'Width'),
    height: readLength(node, 'Height'),
  };
}

/** Escribe (o crea, en orden canónico) un hijo de longitud. */
export function writeLength(node: RdlcNode, tagName: string, length: Length): void {
  const existing = node.child(tagName);
  if (existing) {
    existing.setText(formatLength(length));
    return;
  }
  insertCanonical(node, tagName, node.createElement(tagName, formatLength(length)));
}

/** Inserta un hijo respetando el orden canónico del XSD dentro de su contenedor. */
export function insertCanonical(parent: RdlcNode, tagName: string, child: RdlcNode): void {
  const order = orderFor(parent.tagName);
  const rank = order.indexOf(tagName);
  if (rank === -1) {
    parent.appendChild(child);
    return;
  }

  for (const sibling of parent.children()) {
    const siblingRank = order.indexOf(sibling.tagName);
    if (siblingRank !== -1 && siblingRank > rank) {
      parent.insertBefore(child, sibling);
      return;
    }
  }
  parent.appendChild(child);
}
