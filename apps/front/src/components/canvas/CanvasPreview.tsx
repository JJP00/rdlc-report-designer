import type {
  ItemDto,
  Length,
  NewItemSpec,
  ProjectionDto,
  ScopeRef,
} from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Stage } from 'react-konva';
import { ITEM_DRAG_TYPE, type DropInfo } from '@/lib/dragTypes';
import type { CanvasHit } from '@/lib/hit';
import { hitTestItems } from '@/lib/hit';
import { cm, findItemInList, findItemScope, isCellContent, toCm } from '@/lib/projection';
import type { BoxCm } from '@/lib/resize';
import type { SelectedCell } from '@/lib/tablix';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';
import { Paper } from './Paper';
import { Ruler } from './Ruler';
import { SelectionFrame, type SelectionFrameProps } from './SelectionFrame';
import { bandAt, paperLayout, type PaperLayout } from './bands';
import { clamp, PX_PER_CM, RULER_PX, toPx } from './geometry';

/** Scope del contrato para cada banda del papel. */
function scopeOfBand(key: string): ScopeRef {
  if (key === 'header') return { kind: 'pageHeader' };
  if (key === 'footer') return { kind: 'pageFooter' };
  return { kind: 'body' };
}

export interface CanvasPreviewProps {
  projection: ProjectionDto;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Se llama al soltar un drag con la posición ya normalizada (cm). */
  onMoveTo?: (id: string, top: Length, left: Length, drop?: DropInfo) => void;
  /** El drag terminó sobre otro contenedor: reparentar (`moveItem`). */
  onMoveItemToScope?: (
    id: string,
    scope: ScopeRef,
    index: number,
    top: Length,
    left: Length,
  ) => void;
  /** Se llama al soltar un tirador con la caja normalizada (cm). */
  onResizeItem?: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  /** Redimensionar una columna/fila de la rejilla (separadores internos). */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  /** Celda de Tablix seleccionada (F2 parte 3). */
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  /** Zoom con Ctrl/Cmd + rueda. */
  onZoomChange?: (zoom: number) => void;
  /** Click derecho sobre el lienzo: el item/contenedor bajo el cursor. */
  onContextMenuHit?: (hit: CanvasHit) => void;
  /** Un item de la toolbox soltado en el lienzo. */
  onDropItem?: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  /** Petición de llevar un elemento a la vista (paleta Ctrl+K). */
  reveal?: { id: string; nonce: number } | null;
}

/**
 * Lienzo del diseñador. El escenario es el **papel** (A4 u otro): dentro se
 * dibujan el área imprimible (márgenes) y las bandas Encabezado/Cuerpo/Pie con
 * su tamaño real; el pie va pegado al margen inferior, como en el render.
 * Los items de cada banda (y los anidados) se seleccionan y arrastran.
 */
export function CanvasPreview({
  projection,
  zoom,
  selectedId,
  onSelect,
  onMoveTo,
  onMoveItemToScope,
  onResizeItem,
  onResizeColumn,
  onResizeRow,
  selectedCell,
  onSelectCell,
  onZoomChange,
  onContextMenuHit,
  onDropItem,
  reveal,
}: CanvasPreviewProps): ReactNode {
  const stageRef = useRef<Konva.Stage | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // El propio stage, para que los guiones de QA puedan consultar
  // `getIntersection` (hit-test de Konva, no del dominio).
  useEffect(() => {
    if (TEST_HOOKS_ENABLED) {
      (window as Window & { __rdlcStage?: Konva.Stage | null }).__rdlcStage = stageRef.current;
    }
  }, []);

  // QA: celda seleccionada (el marco de item no existe para celdas).
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcCell?: SelectedCell | null }).__rdlcCell = selectedCell ?? null;
  }, [selectedCell]);

  // El marco de selección se mide del nodo real (funciona con anidados y celdas).
  // En un Tablix manda su **borde** (la rejilla): medir el grupo incluiría el
  // contenido que sobresale de las celdas e inflaría el marco.
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
          __rdlcSelection?: { id: string; rect: typeof rect; zoom: number } | null;
        }
      ).__rdlcSelection = rect ? { id: measuredId, rect, zoom } : null;
    }
  }, [selectedId, selectedCell, projection, zoom]);

  const layout = paperLayout(projection);
  const visibleBands = layout.bands.filter((band) => band.visible);

  /** Qué elemento mide el marco: el item seleccionado o el Tablix de la celda. */
  const frameId = selectedId ?? selectedCell?.id ?? null;

  const selectedFrame = useMemo(
    () => computeSelectedFrame(projection, layout, frameId),
    [layout, projection, frameId],
  );

  // Selección de celdas del Tablix medido (para cabeceras y resaltado).
  const selectionForFrame = selectedCell && selectedCell.id === frameId ? selectedCell : null;

  const frameProps = selectionFrameProps({
    rect: selectionRect,
    zoom,
    frameId,
    selectedId,
    selectedFrame,
    selection: selectionForFrame,
    ...(onResizeColumn ? { onResizeColumn } : {}),
    ...(onResizeRow ? { onResizeRow } : {}),
    ...(onResizeItem ? { onResizeItem } : {}),
    ...(onSelectCell ? { onSelectCell } : {}),
  });

  const stageWidth = layout.sheetWidth * zoom;
  const stageHeight = layout.sheetHeight * zoom;

  /**
   * Fin de un drag: si el puntero soltó sobre **otro contenedor**, el item se
   * reparenta (`moveItem`) conservando el punto que se agarró; si no, se mueve
   * dentro de su contenedor como siempre.
   */
  const handleMoveEnd = (id: string, top: Length, left: Length, drop?: DropInfo): void => {
    const stage = stageRef.current;
    if (drop && stage && onMoveItemToScope) {
      const hit = hitAtEvent(stage, zoom, layout, drop);
      const current = findItemScope(projection, id);
      if (hit && current && !sameScope(current, hit.scope)) {
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

  // Bandas actuales en un ref: el efecto de "traer a la vista" no debe
  // re-ejecutarse en cada render (las bandas son un array nuevo cada vez).
  const bandsRef = useRef(visibleBands);
  useEffect(() => {
    bandsRef.current = visibleBands;
  });

  // Trae a la vista el elemento pedido (paleta Ctrl+K) con un margen cómodo.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !reveal) return;

    for (const band of bandsRef.current) {
      const item = findItemInList(band.region.items, reveal.id);
      if (!item) continue;

      const x = RULER_PX + (band.x + toPx(item.left)) * zoom;
      const y = RULER_PX + (band.y + toPx(item.top)) * zoom;
      container.scrollTo({
        left: Math.max(0, x - 120),
        top: Math.max(0, y - 120),
        behavior: 'smooth',
      });
      return;
    }
  }, [reveal, zoom]);

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6"
      onContextMenu={(event) => {
        const stage = stageRef.current;
        const hit = stage ? hitAtEvent(stage, zoom, layout, event) : undefined;
        if (hit) onContextMenuHit?.(hit);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
        // Sin preventDefault el navegador no permite soltar aquí.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        const kind = event.dataTransfer.getData(ITEM_DRAG_TYPE);
        if (!kind || !onDropItem) return;
        event.preventDefault();
        const stage = stageRef.current;
        const hit = stage ? hitAtEvent(stage, zoom, layout, event) : undefined;
        if (hit) onDropItem(kind as NewItemSpec['kind'], hit);
      }}
    >
      <div
        className="relative"
        style={{ width: RULER_PX + stageWidth, height: RULER_PX + stageHeight }}
      >
        {/* Esquina de las reglas */}
        <div
          className="absolute left-0 top-0 border-b border-r bg-muted"
          style={{ width: RULER_PX, height: RULER_PX }}
        />
        <Ruler orientation="horizontal" zoom={zoom} lengthPx={stageWidth} />
        <Ruler orientation="vertical" zoom={zoom} lengthPx={stageHeight} />

        <div className="absolute" style={{ left: RULER_PX, top: RULER_PX }}>
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            scaleX={zoom}
            scaleY={zoom}
            style={{ background: '#e5e7eb' }}
            onClick={(event) => {
              // Click en vacío = deseleccionar (los items cortan la propagación).
              if (event.target === event.target.getStage()) onSelect?.(null);
            }}
            onWheel={(event) => zoomFromWheel(event, zoom, onZoomChange)}
          >
            <Paper
              layout={layout}
              selectedId={selectedId}
              onSelect={onSelect}
              onMoveTo={handleMoveEnd}
              onResizeColumn={onResizeColumn}
              onResizeRow={onResizeRow}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              draggable={onMoveTo !== undefined}
            />

            <SelectionFrame {...frameProps} />
          </Stage>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- helpers -------------------------------- */

/** Mide el nodo seleccionado; en un Tablix, su borde (la rejilla). */
function measureSelection(
  stage: Konva.Stage,
  measuredId: string,
): { x: number; y: number; width: number; height: number } | null {
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

/** Traduce un evento del DOM (drop, click derecho) a `CanvasHit`. */
function hitAtEvent(
  stage: Konva.Stage,
  zoom: number,
  layout: PaperLayout,
  event: { clientX: number; clientY: number },
): CanvasHit | undefined {
  const rect = stage.container().getBoundingClientRect();
  const contentX = (event.clientX - rect.left) / zoom;
  const contentY = (event.clientY - rect.top) / zoom;
  if (
    contentX < 0 ||
    contentY < 0 ||
    contentX > layout.sheetWidth ||
    contentY > layout.sheetHeight
  ) {
    return undefined;
  }

  const band = bandAt(layout, contentX, contentY);
  if (!band) return undefined;

  const point = {
    x: clamp((contentX - band.x) / PX_PER_CM, 0, toCm(band.region.width)),
    y: clamp((contentY - band.y) / PX_PER_CM, 0, toCm(band.region.height)),
  };
  return hitTestItems(band.region.items, point, scopeOfBand(band.key));
}

/** Zoom con Ctrl/Cmd + rueda (la rueda normal es scroll). */
function zoomFromWheel(
  event: Konva.KonvaEventObject<WheelEvent>,
  zoom: number,
  onZoomChange?: (zoom: number) => void,
): void {
  if (!onZoomChange) return;
  const { ctrlKey, metaKey, deltaY } = event.evt;
  if (!ctrlKey && !metaKey) return;
  // En Electron, sin preventDefault Chromium haría zoom de toda la app.
  event.evt.preventDefault();
  const factor = deltaY > 0 ? 1 / 1.1 : 1.1;
  onZoomChange(Math.min(2, Math.max(0.2, Number((zoom * factor).toFixed(3)))));
}

/** Marco de selección: caja del item y rejilla si es un Tablix. */
interface SelectedFrame {
  box?: BoxCm;
  bounds?: { width: number; height: number };
  grid?: { columns: Length[]; rows: Length[]; rowCount: number; columnCount: number };
}

function computeSelectedFrame(
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
    const bounds = isDirectChild
      ? { width: toCm(band.region.width), height: toCm(band.region.height) }
      : undefined;

    if (item.kind === 'unknown') return { ...(bounds ? { bounds } : {}) };
    if (item.kind === 'tablix') {
      const columns = item.body.columns.reduce((acc, column) => acc + toCm(column), 0);
      const rows = item.body.rows.reduce((acc, row) => acc + toCm(row.height), 0);
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

interface FramePropsOptions {
  rect: { x: number; y: number; width: number; height: number } | null;
  zoom: number;
  frameId: string | null;
  selectedId?: string | null;
  selectedFrame: SelectedFrame | undefined;
  selection: SelectedCell | null;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  onResizeItem?: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
}

/** Arma las props de `SelectionFrame` (tiradores, cabeceras y separadores). */
function selectionFrameProps(options: FramePropsOptions): SelectionFrameProps {
  const { rect, zoom, frameId, selectedFrame, selection } = options;
  const props: SelectionFrameProps = {
    rect,
    zoom,
    showHandles: Boolean(options.selectedId),
  };
  if (selectedFrame?.box) props.box = selectedFrame.box;
  if (selectedFrame?.bounds) props.bounds = selectedFrame.bounds;

  if (frameId && selectedFrame?.grid) {
    const grid = selectedFrame.grid;
    props.grid = { columns: grid.columns, rows: grid.rows };
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

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** ¿Los dos scopes son el mismo contenedor? (mover vs reparentar). */
function sameScope(a: ScopeRef, b: ScopeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'rectangle' && b.kind === 'rectangle') return a.id === b.id;
  if (a.kind === 'tablixCell' && b.kind === 'tablixCell') {
    return a.id === b.id && a.row === b.row && a.col === b.col;
  }
  return true;
}
