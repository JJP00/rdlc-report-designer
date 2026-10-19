import type { BatchableCommand } from '@rdlc-designer/contracts';
import { cm } from './projection';
import { MIN_SIZE_CM, type BoxCm } from './resize';

/**
 * Redimensionado de una **multiselección** (U3): los tiradores del marco
 * envuelven el bloque entero y el arrastre escala todos los miembros en
 * proporción a la caja de partida (como PowerPoint), en **un solo `batch`**
 * (un paso de undo).
 *
 * Todo se trabaja en cm: `frame` es la caja **medida** del nodo (px de papel →
 * cm) y `box` la caja **declarada** del item — en un Tablix, su rejilla del
 * cuerpo, que es lo que espera `resizeTable`. Con cabeceras de grupo las dos
 * difieren en `headerOffset`: la cabecera no escala, así que la rejilla nueva
 * es `frame × escala − offset`.
 */

export interface GroupResizeMember {
  id: string;
  /** Caja declarada en cm (en un Tablix, la rejilla del cuerpo). */
  box: BoxCm;
  /** Caja medida (cm de papel); en un Tablix incluye las cabeceras. */
  frame: BoxCm;
  /** Extensión de las cabeceras de grupo del Tablix (cm); 0 si no hay. */
  headerOffset?: { x: number; y: number };
  /** Un Tablix se redimensiona repartiendo su rejilla (`resizeTable`). */
  tablix?: boolean;
}

/** Caja envolvente (cm) de los marcos medidos de los miembros. */
export function groupBoxCm(members: GroupResizeMember[]): BoxCm | null {
  if (members.length === 0) return null;
  const left = Math.min(...members.map((member) => member.frame.left));
  const top = Math.min(...members.map((member) => member.frame.top));
  const right = Math.max(...members.map((member) => member.frame.left + member.frame.width));
  const bottom = Math.max(...members.map((member) => member.frame.top + member.frame.height));
  return {
    top: round4(top),
    left: round4(left),
    width: round4(right - left),
    height: round4(bottom - top),
  };
}

/**
 * Comandos que llevan el bloque de `start` a `next` (los dos, cajas envolventes
 * de `groupBoxCm`; `next` sale de `computeResize`). Cada miembro escala tamaño
 * y posición en proporción a la caja de partida. Los que quedan igual no
 * generan comando.
 */
export function groupResizeCommands(
  members: GroupResizeMember[],
  start: BoxCm,
  next: BoxCm,
): BatchableCommand[] {
  if (members.length === 0) return [];
  const scaleX = start.width > 0 ? next.width / start.width : 1;
  const scaleY = start.height > 0 ? next.height / start.height : 1;
  const commands: BatchableCommand[] = [];

  for (const member of members) {
    // Posición: el miembro escala alrededor del borde de la caja envolvente.
    const frameLeft = next.left + (member.frame.left - start.left) * scaleX;
    const frameTop = next.top + (member.frame.top - start.top) * scaleY;
    const left = member.box.left + (frameLeft - member.frame.left);
    const top = member.box.top + (frameTop - member.frame.top);

    // Tamaño: la caja declarada; en un Tablix, la rejilla que deja el marco
    // medido escalado (las cabeceras no escalan).
    const size = (): { width: number; height: number } => {
      if (!member.tablix) {
        return { width: member.box.width * scaleX, height: member.box.height * scaleY };
      }
      return {
        width: member.frame.width * scaleX - (member.headerOffset?.x ?? 0),
        height: member.frame.height * scaleY - (member.headerOffset?.y ?? 0),
      };
    };
    const { width, height } = size();
    const rounded: BoxCm = {
      top: round4(top),
      left: round4(left),
      width: round4(Math.max(width, MIN_SIZE_CM)),
      height: round4(Math.max(height, MIN_SIZE_CM)),
    };
    if (sameBox(rounded, member.box)) continue;

    commands.push(
      member.tablix
        ? {
            cmd: 'resizeTable',
            id: member.id,
            top: cm(rounded.top),
            left: cm(rounded.left),
            width: cm(rounded.width),
            height: cm(rounded.height),
          }
        : {
            cmd: 'setBounds',
            id: member.id,
            top: cm(rounded.top),
            left: cm(rounded.left),
            width: cm(rounded.width),
            height: cm(rounded.height),
          },
    );
  }

  return commands;
}

const EPSILON = 1e-4;

function sameBox(a: BoxCm, b: BoxCm): boolean {
  return (
    Math.abs(a.top - b.top) < EPSILON &&
    Math.abs(a.left - b.left) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON
  );
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
