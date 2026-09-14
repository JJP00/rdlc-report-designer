import type { RdlcCommand } from '@rdlc-designer/contracts';
import type { AppliedEntry } from './CommandContext.js';
import { readLength, writeLength } from '../geometry/geometry.js';
import { fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Crece el contenedor (rectángulo) para envolver a sus hijos cuando uno se
 * sale de él — como hace el diseñador al arrastrar dentro de una caja.
 *
 * Solo aplica a contenedores con **tamaño explícito**: BC emite rectángulos
 * 0×0 dentro de celdas de Tablix (el tamaño lo pone la celda) y esos no deben
 * crecer, o cambiaríamos el layout que renderiza BC.
 */

export interface ContainerGrowth {
  applied: AppliedEntry;
  inverse: RdlcCommand;
}

export function growContainerToFit(child: RdlcNode): ContainerGrowth | undefined {
  const container = findRectangleAncestor(child);
  if (!container) return undefined;

  const containerId = container.attribute('Name');
  if (!containerId) return undefined;

  const currentWidth = readLength(container, 'Width');
  const currentHeight = readLength(container, 'Height');
  if (
    !currentWidth ||
    !currentHeight ||
    toCm(currentWidth) <= 0 ||
    toCm(currentHeight) <= 0
  ) {
    return undefined; // contenedor implícito (0×0): manda la celda
  }

  const children = container.child('ReportItems')?.children() ?? [];
  let maxRight = 0;
  let maxBottom = 0;

  for (const node of children) {
    const left = readLength(node, 'Left') ?? zero();
    const top = readLength(node, 'Top') ?? zero();
    const width = readLength(node, 'Width') ?? zero();
    const height = readLength(node, 'Height') ?? zero();
    maxRight = Math.max(maxRight, toCm(left) + toCm(width));
    maxBottom = Math.max(maxBottom, toCm(top) + toCm(height));
  }

  const nextWidth = maxRight > toCm(currentWidth) ? fromCm(maxRight) : currentWidth;
  const nextHeight = maxBottom > toCm(currentHeight) ? fromCm(maxBottom) : currentHeight;
  if (nextWidth === currentWidth && nextHeight === currentHeight) return undefined;

  writeLength(container, 'Width', nextWidth);
  writeLength(container, 'Height', nextHeight);

  return {
    applied: { id: containerId, values: { width: nextWidth, height: nextHeight } },
    inverse: { cmd: 'setSize', id: containerId, width: currentWidth, height: currentHeight },
  };
}

function findRectangleAncestor(node: RdlcNode): RdlcNode | undefined {
  let parent = node.parent;
  while (parent) {
    if (parent.tagName === 'Rectangle') return parent;
    parent = parent.parent;
  }
  return undefined;
}

function zero(): Length {
  return { value: 0, unit: 'cm' };
}
