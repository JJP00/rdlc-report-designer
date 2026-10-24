import type { Length, ProjectionDto, ScopeRef } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import type { RefObject } from 'react';
import type { DropInfo } from '@/lib/dragTypes';
import { cm, findItem, findItemScope, scopeInsideItem, toCm } from '@/lib/projection';
import type { PaperLayout } from './bands';
import { hitAtEvent, round4, sameScope } from './canvasHit';

/**
 * Fin de un drag: si el puntero soltó sobre **otro contenedor**, el item se
 * reparenta (`moveItem`) conservando el punto que se agarró; si no, se mueve
 * dentro de su contenedor como siempre.
 *
 * Soltar **dentro del propio item** (un rectángulo sobre sí mismo al moverlo
 * un poco) no reparenta jamás: sería un ciclo y solo debe moverse.
 */
export function useMoveEnd({
  stageRef,
  projection,
  zoom,
  layout,
  selectedId,
  extraSelectedIds,
  onMoveTo,
  onMoveMany,
  onMoveItemToScope,
}: {
  stageRef: RefObject<Konva.Stage | null>;
  projection: ProjectionDto;
  zoom: number;
  layout: PaperLayout;
  selectedId: string | null | undefined;
  extraSelectedIds: string[];
  onMoveTo: ((id: string, top: Length, left: Length, drop?: DropInfo) => void) | undefined;
  onMoveMany: ((moves: { id: string; top: Length; left: Length }[]) => void) | undefined;
  onMoveItemToScope:
    ((id: string, scope: ScopeRef, index: number, top: Length, left: Length) => void) | undefined;
}): (id: string, top: Length, left: Length, drop?: DropInfo) => void {
  return (id, top, left, drop) => {
    const stage = stageRef.current;
    // Multiselección: todos los miembros se desplazan lo mismo que el arrastrado
    // (sin reparentar: cada uno conserva su contenedor).
    const group = [selectedId, ...extraSelectedIds].filter((value): value is string => !!value);
    if (group.length > 1 && group.includes(id) && onMoveMany) {
      const origin = findItem(projection, id);
      if (origin) {
        const dTop = toCm(top) - toCm(origin.top);
        const dLeft = toCm(left) - toCm(origin.left);
        if (round4(dTop) === 0 && round4(dLeft) === 0) return;
        const moves = group.flatMap((memberId) => {
          const member = findItem(projection, memberId);
          if (!member) return [];
          return [
            {
              id: memberId,
              top: cm(round4(Math.max(0, toCm(member.top) + dTop))),
              left: cm(round4(Math.max(0, toCm(member.left) + dLeft))),
            },
          ];
        });
        onMoveMany(moves);
        return;
      }
    }
    if (drop && stage && onMoveItemToScope) {
      const hit = hitAtEvent(stage, zoom, layout, drop);
      const current = findItemScope(projection, id);
      // Un hijo de un rectángulo no se «escapa» al fondo de la banda (el
      // contenedor es un límite duro, como la página); a otro contenedor sí
      // se puede reparentar (soltándolo encima de él).
      const dropsOnBand =
        hit !== undefined &&
        (hit.scope.kind === 'body' ||
          hit.scope.kind === 'pageHeader' ||
          hit.scope.kind === 'pageFooter');
      const rectangleKeepsChild = current?.kind !== 'rectangle' || !dropsOnBand;
      if (
        hit &&
        current &&
        !sameScope(current, hit.scope) &&
        !scopeInsideItem(projection, hit.scope, id) &&
        rectangleKeepsChild
      ) {
        onMoveItemToScope(
          id,
          hit.scope,
          hit.index,
          cm(round4(Math.max(0, hit.point.y - drop.grabCm.y))),
          cm(round4(Math.max(0, hit.point.x - drop.grabCm.x))),
        );
        return;
      }
    }
    onMoveTo?.(id, top, left);
  };
}
