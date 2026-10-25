import type { ScopeRef } from '@rdlc-designer/contracts';
import { readLength, writeLength } from '../geometry/geometry.js';
import { fromCm, toCm } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/**
 * Tras pegar dentro de un rectángulo, los clones conservan el `Top`/`Left` que
 * tenían en su contenedor de origen y pueden quedar fuera: al moverlos, el
 * rectángulo crece hasta contenerlos. Aquí se desplaza el **grupo** de clones
 * (se mantiene su disposición relativa) lo mínimo para que entre en el
 * rectángulo; si es más grande que él, queda en su esquina (0,0).
 *
 * Sin `Width`/`Height` declarados en el rectángulo (los pone la celda) no hay
 * caja contra la que ajustar y no se toca nada. El inverso del pegado quita los
 * clones, así que cambiar su geometría no necesita deshacerse por separado.
 */
export function fitClonesIntoRectangle(
  container: RdlcNode,
  scope: ScopeRef,
  clones: readonly RdlcNode[],
): void {
  if (scope.kind !== 'rectangle' || clones.length === 0) return;

  const width = readLength(container.parent ?? container, 'Width');
  const height = readLength(container.parent ?? container, 'Height');
  if (!width || !height) return;

  const boxes = clones.map((clone) => ({
    clone,
    top: toCm(readLength(clone, 'Top') ?? { value: 0, unit: 'cm' }),
    left: toCm(readLength(clone, 'Left') ?? { value: 0, unit: 'cm' }),
    height: toCm(readLength(clone, 'Height') ?? { value: 0, unit: 'cm' }),
    width: toCm(readLength(clone, 'Width') ?? { value: 0, unit: 'cm' }),
  }));

  const minTop = Math.min(...boxes.map((box) => box.top));
  const minLeft = Math.min(...boxes.map((box) => box.left));
  const groupHeight = Math.max(...boxes.map((box) => box.top + box.height)) - minTop;
  const groupWidth = Math.max(...boxes.map((box) => box.left + box.width)) - minLeft;

  const dy = fitOffset(minTop, groupHeight, toCm(height));
  const dx = fitOffset(minLeft, groupWidth, toCm(width));
  if (dx === 0 && dy === 0) return;

  for (const box of boxes) {
    writeLength(box.clone, 'Top', fromCm(box.top + dy));
    writeLength(box.clone, 'Left', fromCm(box.left + dx));
  }
}

/** Desplazamiento (cm) que mete `[start, start + size]` en `[0, limit]`. */
function fitOffset(start: number, size: number, limit: number): number {
  const target = size > limit ? 0 : Math.min(Math.max(start, 0), limit - size);
  const offset = target - start;
  return Math.abs(offset) < 1e-9 ? 0 : offset;
}
