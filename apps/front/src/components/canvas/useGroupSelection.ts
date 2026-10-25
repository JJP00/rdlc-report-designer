import type { ProjectionDto } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useMemo, type RefObject } from 'react';
import { topLevelIds } from '@/lib/align';
import { groupBoxCm, type GroupResizeMember } from '@/lib/groupResize';
import { findItem, isCellContent, toCm } from '@/lib/projection';
import type { BoxCm } from '@/lib/resize';
import { tablixLayout } from '@/lib/tablix';
import { round4 } from './canvasHit';
import { PX_PER_CM } from './geometry';
import { useGroupSelectionMeasure } from './useSelectionMeasure';

/** Bloque de una multiselección redimensionable: su caja envolvente y sus miembros. */
export interface SelectionGroup {
  members: GroupResizeMember[];
  box: BoxCm;
}

/**
 * Multiselección: con ≥2 elementos seleccionados los tiradores envuelven el
 * bloque y escalan todos los miembros a la vez. Los hijos de un contenedor
 * seleccionado viajan con él (`topLevelIds`); el contenido de una celda (lo fija
 * la celda) y los fantasmas no entran. `null` si no hay bloque redimensionable.
 */
export function useGroupSelection({
  stageRef,
  projection,
  zoom,
  selectedId,
  extraSelectedIds,
}: {
  stageRef: RefObject<Konva.Stage | null>;
  projection: ProjectionDto;
  zoom: number;
  selectedId: string | null | undefined;
  extraSelectedIds: string[];
}): SelectionGroup | null {
  const selectionKey = [selectedId, ...extraSelectedIds]
    .filter((value): value is string => !!value)
    .join('|');
  const groupIds = useMemo(() => {
    const ids = selectionKey.length > 0 ? selectionKey.split('|') : [];
    if (ids.length < 2) return [];
    const items = ids.flatMap((id) => {
      const item = findItem(projection, id);
      return item ? [item] : [];
    });
    return topLevelIds(items, ids).filter((id) => {
      const item = findItem(projection, id);
      return item !== undefined && item.kind !== 'unknown' && !isCellContent(projection, id);
    });
  }, [projection, selectionKey]);

  const groupMeasure = useGroupSelectionMeasure({
    stageRef,
    idsKey: groupIds.join('|'),
    projection,
    zoom,
  });

  return useMemo(() => {
    if (groupIds.length < 2 || !groupMeasure) return null;
    const members: GroupResizeMember[] = [];
    for (const measured of groupMeasure.members) {
      const item = findItem(projection, measured.id);
      if (!item) continue;
      // Caja medida (cm de papel): en un Tablix incluye las cabeceras de grupo.
      const frame: BoxCm = {
        top: measured.rect.y / PX_PER_CM,
        left: measured.rect.x / PX_PER_CM,
        width: measured.rect.width / PX_PER_CM,
        height: measured.rect.height / PX_PER_CM,
      };
      if (item.kind === 'tablix') {
        const columns = item.body.columns.reduce((total, column) => total + toCm(column), 0);
        const rows = item.body.rows.reduce((total, row) => total + toCm(row.height), 0);
        members.push({
          id: item.id,
          frame,
          box: {
            top: toCm(item.top),
            left: toCm(item.left),
            width: round4(columns),
            height: round4(rows),
          },
          headerOffset: tablixLayout(item).offset,
          tablix: true,
        });
      } else {
        members.push({
          id: item.id,
          frame,
          box: {
            top: toCm(item.top),
            left: toCm(item.left),
            width: toCm(item.width),
            height: toCm(item.height),
          },
        });
      }
    }
    if (members.length !== groupIds.length) return null;
    const box = groupBoxCm(members);
    return box ? { members, box } : null;
  }, [groupIds, groupMeasure, projection]);
}
