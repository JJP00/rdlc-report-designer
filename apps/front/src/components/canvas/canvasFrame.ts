import type { BatchableCommand, Length, ProjectionDto } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { groupResizeCommands, type GroupResizeMember } from '@/lib/groupResize';
import type { CanvasHit } from '@/lib/hit';
import {
  cm,
  findItem,
  findItemInList,
  findItemScope,
  findParentItemId,
  findSiblings,
  isCellContent,
  toCm,
} from '@/lib/projection';
import type { BoxCm } from '@/lib/resize';
import { tablixLayout, type SelectedCell } from '@/lib/tablix';
import type { PaperLayout } from './bands';
import { round4 } from './canvasHit';
import { PX_PER_CM } from './geometry';
import type { SelectionFrameProps } from './SelectionFrame';
import { tablixChromeAt } from './tablixChrome';

/** Marco de selección: caja del item y rejilla si es un Tablix. */
export interface SelectedFrame {
  box?: BoxCm;
  bounds?: { width: number; height: number };
  grid?: {
    columns: Length[];
    rows: Length[];
    rowCount: number;
    columnCount: number;
    /** Desplazamiento de la rejilla por las cabeceras de grupo (px de papel). */
    offset?: { x: number; y: number };
  };
}

export function computeSelectedFrame(
  projection: ProjectionDto,
  layout: PaperLayout,
  frameId: string | null,
): SelectedFrame | undefined {
  if (!frameId) return undefined;
  // El contenido directo de una celda no se redimensiona: manda la celda.
  if (isCellContent(projection, frameId)) return {};

  for (const band of layout.bands) {
    const item = findItemInList(band.region.items, frameId);
    if (!item) continue;
    const isDirectChild = band.region.items.some((candidate) => candidate.id === frameId);
    // Límite del contenedor: la banda si es hijo directo; si no, el rectángulo
    // padre (para que los tiradores tampoco lo saquen de la caja).
    let bounds = isDirectChild
      ? { width: toCm(band.region.width), height: toCm(band.region.height) }
      : undefined;
    if (!bounds) {
      const parentId = findParentItemId(projection, frameId);
      const parent = parentId ? findItem(projection, parentId) : undefined;
      if (parent?.kind === 'rectangle') {
        bounds = { width: toCm(parent.width), height: toCm(parent.height) };
      }
    }

    if (item.kind === 'unknown') return { ...(bounds ? { bounds } : {}) };
    if (item.kind === 'tablix') {
      const columns = item.body.columns.reduce((acc, column) => acc + toCm(column), 0);
      const rows = item.body.rows.reduce((acc, row) => acc + toCm(row.height), 0);
      // La `box` es la rejilla del cuerpo (lo que espera `resizeTable`), pero
      // las cabeceras de grupo desplazan las columnas/filas: el marco medido
      // (el borde del Tablix) las incluye y las tiras deben sumar el offset
      // (el layout lo da en cm; las tiras trabajan en px de papel).
      const { offset } = tablixLayout(item);
      return {
        box: {
          top: toCm(item.top),
          left: toCm(item.left),
          width: round4(columns),
          height: round4(rows),
        },
        ...(bounds ? { bounds } : {}),
        grid: {
          columns: item.body.columns,
          rows: item.body.rows.map((row) => row.height),
          rowCount: item.body.rows.length,
          columnCount: item.body.columns.length,
          offset: { x: offset.x * PX_PER_CM, y: offset.y * PX_PER_CM },
        },
      };
    }

    return {
      box: {
        top: toCm(item.top),
        left: toCm(item.left),
        width: toCm(item.width),
        height: toCm(item.height),
      },
      ...(bounds ? { bounds } : {}),
    };
  }
  return undefined;
}

/**
 * Click derecho sobre el «chrome» del marco de un Tablix (cabeceras de
 * fila/columna o esquina, lo que dibuja `TablixHeaders`): manda la **tabla**
 * —el mismo destino que su borde— en vez del item que queda debajo (o de su
 * celda). Solo existe mientras el marco está visible (tabla o celda de ella
 * seleccionada), como el propio chrome.
 */
export function tablixChromeHitAt({
  stage,
  projection,
  zoom,
  frameId,
  rect,
  selectedFrame,
  event,
}: {
  stage: Konva.Stage | null;
  projection: ProjectionDto;
  zoom: number;
  frameId: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  selectedFrame: SelectedFrame | undefined;
  event: { clientX: number; clientY: number };
}): CanvasHit | undefined {
  const framed = frameId ? findItem(projection, frameId) : undefined;
  if (!stage || framed?.kind !== 'tablix' || !rect || !selectedFrame?.grid) return undefined;
  const container = stage.container().getBoundingClientRect();
  const x = (event.clientX - container.left - stage.x()) / zoom;
  const y = (event.clientY - container.top - stage.y()) / zoom;
  if (!tablixChromeAt(rect, selectedFrame.grid.offset, x, y)) return undefined;
  return {
    item: framed,
    scope: findItemScope(projection, framed.id) ?? { kind: 'body' },
    index: findSiblings(projection, framed.id)?.length ?? 0,
    point: { x: toCm(framed.left), y: toCm(framed.top) },
  };
}

export interface FramePropsOptions {
  rect: { x: number; y: number; width: number; height: number } | null;
  zoom: number;
  frameId: string | null;
  selectedId?: string | null;
  selectedFrame: SelectedFrame | undefined;
  selection: SelectedCell | null;
  /** Multiselección redimensionable: caja envolvente (cm) y miembros. */
  group?: { members: GroupResizeMember[]; box: BoxCm } | null;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  onResizeItem?: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  onResizeMany?: (commands: BatchableCommand[]) => void;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
}

/** Arma las props de `SelectionFrame` (tiradores, cabeceras y separadores). */
export function selectionFrameProps(options: FramePropsOptions): SelectionFrameProps {
  const { rect, zoom, frameId, selectedFrame, selection, group } = options;

  // Multiselección (U3): el marco y los tiradores envuelven el bloque y el
  // arrastre escala todos los miembros (un `batch` = un paso de undo). Sin
  // rejilla de Tablix ni límites de región: los miembros pueden vivir en
  // contenedores distintos.
  if (group && options.onResizeMany) {
    const resizeMany = options.onResizeMany;
    return {
      rect: {
        x: group.box.left * PX_PER_CM,
        y: group.box.top * PX_PER_CM,
        width: group.box.width * PX_PER_CM,
        height: group.box.height * PX_PER_CM,
      },
      zoom,
      box: group.box,
      showHandles: true,
      onResize: (next) => {
        const commands = groupResizeCommands(group.members, group.box, next);
        if (commands.length > 0) resizeMany(commands);
      },
    };
  }

  const props: SelectionFrameProps = {
    rect,
    zoom,
    showHandles: Boolean(options.selectedId),
  };
  if (selectedFrame?.box) props.box = selectedFrame.box;
  if (selectedFrame?.bounds) props.bounds = selectedFrame.bounds;

  if (frameId && selectedFrame?.grid) {
    const grid = selectedFrame.grid;
    props.grid = {
      columns: grid.columns,
      rows: grid.rows,
      ...(grid.offset ? { offset: grid.offset } : {}),
    };
    if (selection) props.selection = selection;
    if (options.onResizeColumn) {
      const resizeColumn = options.onResizeColumn;
      props.onResizeColumn = (column, width) => resizeColumn(frameId, column, width);
    }
    if (options.onResizeRow) {
      const resizeRow = options.onResizeRow;
      props.onResizeRow = (row, height) => resizeRow(frameId, row, height);
    }
    if (options.onSelectCell) {
      const selectCell = options.onSelectCell;
      props.onSelectColumn = (index, extend, toggle) =>
        selectCell(
          { id: frameId, row: 0, col: index, endRow: grid.rowCount - 1, endCol: index },
          extend,
          toggle,
        );
      props.onSelectRow = (index, extend, toggle) =>
        selectCell(
          { id: frameId, row: index, col: 0, endRow: index, endCol: grid.columnCount - 1 },
          extend,
          toggle,
        );
    }
  }

  if (options.onResizeItem && options.selectedId) {
    const resizeItem = options.onResizeItem;
    const id = options.selectedId;
    props.onResize = (box) =>
      resizeItem(id, {
        top: cm(box.top),
        left: cm(box.left),
        width: cm(box.width),
        height: cm(box.height),
      });
  }

  return props;
}
