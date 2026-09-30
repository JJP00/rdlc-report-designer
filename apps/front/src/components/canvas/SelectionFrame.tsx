import type Konva from 'konva';
import { useEffect, useRef, type ReactNode } from 'react';
import { Group, Layer, Line, Rect, Text as KonvaText } from 'react-konva';
import type { Length } from '@rdlc-designer/contracts';
import {
  computeResize,
  resizeBoundary,
  RESIZE_HANDLES,
  type BoxCm,
  type ResizeHandle,
} from '@/lib/resize';
import { selectionCols, selectionRows, type SelectedCell } from '@/lib/tablix';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';
import { PX_PER_CM, toPx } from './geometry';

export interface SelectionFrameProps {
  /** Rectángulo en px de papel (medido del nodo Konva real). */
  rect: { x: number; y: number; width: number; height: number } | null;
  zoom: number;
  /** Caja del item en cm (para redimensionar); ausente = no redimensionable. */
  box?: BoxCm;
  /** Límites de la región en cm (solo items de primer nivel). */
  bounds?: { width: number; height: number };
  /** Se llama al soltar un tirador con la caja ya normalizada (cm). */
  onResize?: (box: BoxCm) => void;
  /**
   * Rejilla del Tablix seleccionado: dibuja los **separadores internos** de
   * columnas/filas (redimensionado de una sola columna o fila, como en RB).
   */
  grid?: { columns: Length[]; rows: Length[] } | null;
  onResizeColumn?: (column: number, width: Length) => void;
  onResizeRow?: (row: number, height: Length) => void;
  /** Con una celda seleccionada no hay tiradores de mover/redimensionar. */
  showHandles?: boolean;
  /** Celdas seleccionadas: resalta sus cabeceras de fila/columna. */
  selection?: SelectedCell | null;
  /** Click en una cabecera (Shift+click rango, Ctrl+click añade). */
  onSelectColumn?: (index: number, extend: boolean, toggle: boolean) => void;
  onSelectRow?: (index: number, extend: boolean, toggle: boolean) => void;
}

/** Cursores por tirador (feedback al pasar el ratón). */
const CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

/**
 * Marco de selección en una capa superior (ningún item lo tapa) con **tiradores
 * de redimensionado**. El rect se mide del nodo Konva real porque el del modelo
 * depende del contenedor (una celda de Tablix no declara geometría propia).
 *
 * Durante el arrastre NO se re-renderiza con React: la previsualización del
 * recuadro se pinta moviendo un nodo Konva con `ref`. Si el componente se
 * re-renderizara, el tirador que se está arrastrando se desmontaría y Konva
 * perdería el drag (bug real que cazó el test automatizado).
 */
export function SelectionFrame({
  rect,
  zoom,
  box,
  bounds,
  onResize,
  grid,
  onResizeColumn,
  onResizeRow,
  showHandles = true,
  selection,
  onSelectColumn,
  onSelectRow,
}: SelectionFrameProps): ReactNode {
  const dragStart = useRef<{ pointer: { x: number; y: number }; box: BoxCm } | null>(null);
  const frameRef = useRef<Konva.Rect | null>(null);
  const previewRef = useRef<Konva.Rect | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);

  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    const layer = layerRef.current;
    const container = layer?.getStage()?.container().getBoundingClientRect();
    if (!layer || !container) return;

    // QA (Playwright): dónde queda el tirador SE en pantalla, para arrastrarlo
    // con el ratón real.
    const handle = layer.findOne('.handle-se') as Konva.Node | undefined;
    if (handle && box) {
      const position = handle.getAbsolutePosition();
      (window as Window & { __rdlcResizeHandle?: { x: number; y: number } }).__rdlcResizeHandle = {
        x: container.left + position.x,
        y: container.top + position.y,
      };
    }
  });

  if (!rect) return <Layer listening={false} />;

  const size = 8 / zoom;
  const resizable = showHandles && box !== undefined && onResize !== undefined;

  const resizeFrom = (
    handle: ResizeHandle,
    pointer: { x: number; y: number },
    shift: boolean,
  ): BoxCm | null => {
    const start = dragStart.current;
    if (!start) return null;
    // Delta del puntero (px de pantalla) → cm de papel.
    return computeResize({
      handle,
      start: start.box,
      dxCm: (pointer.x - start.pointer.x) / zoom / PX_PER_CM,
      dyCm: (pointer.y - start.pointer.y) / zoom / PX_PER_CM,
      ...(bounds ? { bounds } : {}),
      snap: !shift,
      snapCm: 0.1,
    });
  };

  const showPreview = (next: BoxCm): void => {
    const start = dragStart.current;
    if (!start) return;
    // La previsualización parte del rect medido: funciona con items anidados
    // (su Top/Left es relativo al contenedor).
    previewRef.current?.setAttrs({
      x: rect.x + (next.left - start.box.left) * PX_PER_CM,
      y: rect.y + (next.top - start.box.top) * PX_PER_CM,
      width: next.width * PX_PER_CM,
      height: next.height * PX_PER_CM,
      visible: true,
    });
    frameRef.current?.visible(false);
    previewRef.current?.getLayer()?.batchDraw();
  };

  const hidePreview = (): void => {
    previewRef.current?.visible(false);
    frameRef.current?.visible(true);
    previewRef.current?.getLayer()?.batchDraw();
  };

  return (
    <Layer ref={layerRef}>
      {/* Recuadro real de la selección. */}
      <Rect
        ref={frameRef}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke="#2563eb"
        strokeWidth={2}
        dash={[6, 3]}
        strokeScaleEnabled={false}
        fillEnabled={false}
        listening={false}
      />

      {/* Recuadro de previsualización (oculto hasta que se arrastra un tirador). */}
      <Rect
        ref={previewRef}
        visible={false}
        stroke="#2563eb"
        strokeWidth={2}
        dash={[6, 3]}
        strokeScaleEnabled={false}
        fillEnabled={false}
        listening={false}
      />

      {/* Cabeceras estilo Report Builder: seleccionan fila/columna y sus
          bordes redimensionan (también con una celda seleccionada). */}
      {grid && (onSelectColumn || onSelectRow || onResizeColumn || onResizeRow) ? (
        <TablixHeaders
          rect={rect}
          zoom={zoom}
          columns={grid.columns}
          rows={grid.rows}
          selection={selection ?? null}
          onSelectColumn={onSelectColumn}
          onSelectRow={onSelectRow}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
        />
      ) : null}

      {resizable
        ? RESIZE_HANDLES.map((handle) => {
            const [x, y] = handlePosition(handle, rect);
            return (
              <Rect
                key={handle}
                name={`handle-${handle}`}
                x={x - size / 2}
                y={y - size / 2}
                width={size}
                height={size}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={1 / zoom}
                draggable
                onMouseEnter={(event) => {
                  event.target.getStage()!.container().style.cursor = CURSORS[handle];
                }}
                onMouseLeave={(event) => {
                  event.target.getStage()!.container().style.cursor = '';
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer || !box) return;
                  dragStart.current = { pointer, box };
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer) return;
                  const next = resizeFrom(handle, pointer, event.evt.shiftKey);
                  if (next) showPreview(next);
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer) return;
                  const next = resizeFrom(handle, pointer, event.evt.shiftKey);
                  dragStart.current = null;
                  hidePreview();
                  if (next && onResize) onResize(next);
                }}
              />
            );
          })
        : cornerPoints(rect).map(([x, y]) => (
            <Rect
              key={`${x}-${y}`}
              x={x - size / 2}
              y={y - size / 2}
              width={size}
              height={size}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1 / zoom}
              listening={false}
            />
          ))}
    </Layer>
  );
}

/** Sumas acumuladas de las longitudes (en px de papel). */
function cumulative(lengths: Length[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (const length of lengths) {
    total += toPx(length);
    result.push(total);
  }
  return result;
}

/** Cabeceras del Tablix (arriba y a la izquierda), como en Report Builder. */
const HEADER_PX = 16;

function TablixHeaders({
  rect,
  zoom,
  columns,
  rows,
  selection,
  onSelectColumn,
  onSelectRow,
  onResizeColumn,
  onResizeRow,
}: {
  rect: { x: number; y: number; width: number; height: number };
  zoom: number;
  columns: Length[];
  rows: Length[];
  selection: SelectedCell | null;
  onSelectColumn?: (index: number, extend: boolean, toggle: boolean) => void;
  onSelectRow?: (index: number, extend: boolean, toggle: boolean) => void;
  onResizeColumn?: (column: number, width: Length) => void;
  onResizeRow?: (row: number, height: Length) => void;
}): ReactNode {
  const columnEdges = cumulative(columns);
  const rowEdges = cumulative(rows);
  const selectedColumns = new Set(selection ? selectionCols(selection) : []);
  const selectedRows = new Set(selection ? selectionRows(selection) : []);
  const inColumns = (index: number): boolean => selectedColumns.has(index);
  const inRows = (index: number): boolean => selectedRows.has(index);

  // Previsualización del redimensionado por los bordes de cabecera: una línea
  // discontinua en la frontera destino + una etiqueta con el tamaño resultante.
  // Se mueve por refs (nunca re-render durante el drag: mataría el arrastre).
  const previewGroup = useRef<Konva.Group | null>(null);
  const previewLine = useRef<Konva.Line | null>(null);
  const previewBadge = useRef<Konva.Rect | null>(null);
  const previewText = useRef<Konva.Text | null>(null);

  const showEdgePreview = (vertical: boolean, edgePx: number, label: string): void => {
    const group = previewGroup.current;
    const line = previewLine.current;
    const badge = previewBadge.current;
    const text = previewText.current;
    if (!group || !line || !badge || !text) return;
    // Tamaños en px de pantalla (no escalan con el zoom).
    const badgeWidth = 54 / zoom;
    const badgeHeight = 16 / zoom;
    const gap = 6 / zoom;
    if (vertical) {
      line.setAttrs({ x: edgePx, y: 0, points: [0, rect.y, 0, rect.y + (rowEdges[rowEdges.length - 1] ?? 0)] });
      const fitsRight = edgePx + gap + badgeWidth <= rect.x + (columnEdges[columnEdges.length - 1] ?? 0);
      const badgeX = fitsRight ? edgePx + gap : edgePx - gap - badgeWidth;
      badge.setAttrs({ x: badgeX, y: rect.y + 2 / zoom, width: badgeWidth, height: badgeHeight });
      text.setAttrs({ x: badgeX, y: rect.y + 2 / zoom, width: badgeWidth, height: badgeHeight, text: label });
    } else {
      line.setAttrs({ x: 0, y: edgePx, points: [rect.x, 0, rect.x + (columnEdges[columnEdges.length - 1] ?? 0), 0] });
      const fitsBelow = edgePx + gap + badgeHeight <= rect.y + (rowEdges[rowEdges.length - 1] ?? 0);
      const badgeY = fitsBelow ? edgePx + gap : edgePx - gap - badgeHeight;
      badge.setAttrs({ x: rect.x + 2 / zoom, y: badgeY, width: badgeWidth, height: badgeHeight });
      text.setAttrs({ x: rect.x + 2 / zoom, y: badgeY, width: badgeWidth, height: badgeHeight, text: label });
    }
    group.visible(true);
    group.getLayer()?.batchDraw();
  };

  const hideEdgePreview = (): void => {
    previewGroup.current?.visible(false);
    previewGroup.current?.getLayer()?.batchDraw();
  };

  const showColumnPreview = (index: number, deltaCm: number): void => {
    // Mismo cálculo que al soltar (resizeBoundary): la previsualización es exacta.
    const width = resizeBoundary(columns[index]!, deltaCm, 0.1);
    const left = index === 0 ? 0 : (columnEdges[index - 1] ?? 0);
    showEdgePreview(true, rect.x + left + toPx(width), formatLength(width));
  };

  const showRowPreview = (index: number, deltaCm: number): void => {
    const height = resizeBoundary(rows[index]!, deltaCm, 0.1);
    const top = index === 0 ? 0 : (rowEdges[index - 1] ?? 0);
    showEdgePreview(false, rect.y + top + toPx(height), formatLength(height));
  };

  return (
    <>
      {/* Cabeceras de columna. */}
      {columns.map((_, index) => {
        const left = index === 0 ? 0 : (columnEdges[index - 1] ?? 0);
        const width = (columnEdges[index] ?? 0) - left;
        const edge = columnEdges[index] ?? 0;
        return (
          <Group key={`column-header-${edge}`}>
            <Rect
              name="tablix-column-header"
              x={rect.x + left}
              y={rect.y - HEADER_PX}
              width={width}
              height={HEADER_PX}
              fill={inColumns(index) ? '#bfdbfe' : '#e5e7eb'}
              stroke="#9ca3af"
              strokeWidth={0.5}
              strokeScaleEnabled={false}
              onClick={(event) => {
                event.cancelBubble = true;
                const evt = event.evt as MouseEvent;
                onSelectColumn?.(index, evt.shiftKey, evt.ctrlKey || evt.metaKey);
              }}
            />
            <KonvaText
              text={String(index + 1)}
              x={rect.x + left}
              y={rect.y - HEADER_PX + 3}
              width={width}
              align="center"
              fontSize={10}
              fill="#374151"
              listening={false}
            />
          </Group>
        );
      })}

      {/* Cabeceras de fila. */}
      {rows.map((_, index) => {
        const top = index === 0 ? 0 : (rowEdges[index - 1] ?? 0);
        const height = (rowEdges[index] ?? 0) - top;
        const edge = rowEdges[index] ?? 0;
        return (
          <Group key={`row-header-${edge}`}>
            <Rect
              name="tablix-row-header"
              x={rect.x - HEADER_PX}
              y={rect.y + top}
              width={HEADER_PX}
              height={height}
              fill={inRows(index) ? '#bfdbfe' : '#e5e7eb'}
              stroke="#9ca3af"
              strokeWidth={0.5}
              strokeScaleEnabled={false}
              onClick={(event) => {
                event.cancelBubble = true;
                const evt = event.evt as MouseEvent;
                onSelectRow?.(index, evt.shiftKey, evt.ctrlKey || evt.metaKey);
              }}
            />
            <KonvaText
              text={String(index + 1)}
              x={rect.x - HEADER_PX}
              y={rect.y + top + Math.max((height - 10) / 2, 1)}
              width={HEADER_PX}
              align="center"
              fontSize={10}
              fill="#374151"
              listening={false}
            />
          </Group>
        );
      })}

      {/* Esquina. */}
      <Rect
        name="tablix-corner"
        x={rect.x - HEADER_PX}
        y={rect.y - HEADER_PX}
        width={HEADER_PX}
        height={HEADER_PX}
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth={0.5}
        strokeScaleEnabled={false}
        listening={false}
      />

      {/* Previsualización del borde arrastrado (oculta hasta el drag). */}
      <Group ref={previewGroup} name="edge-preview" visible={false} listening={false}>
        <Line
          ref={previewLine}
          points={[0, 0, 0, 0]}
          stroke="#2563eb"
          strokeWidth={1.5}
          dash={[5, 4]}
          strokeScaleEnabled={false}
        />
        <Rect ref={previewBadge} width={54} height={16} fill="#2563eb" cornerRadius={3} />
        <KonvaText
          ref={previewText}
          name="edge-preview-label"
          width={54}
          height={16}
          align="center"
          verticalAlign="middle"
          fontSize={10}
          fontStyle="bold"
          fill="#ffffff"
        />
      </Group>

      {/* Bordes de las cabeceras: se arrastran para redimensionar (como RB). */}
      {onResizeColumn
        ? columnEdges.map((edge, index) => (
            <HeaderResizeZone
              key={`column-resize-${edge}`}
              vertical
              x={rect.x + edge}
              y={rect.y - HEADER_PX}
              length={HEADER_PX}
              zoom={zoom}
              onDragged={(deltaCm) =>
                onResizeColumn(index, resizeBoundary(columns[index]!, deltaCm, 0.1))
              }
              onPreviewMove={(deltaCm) => showColumnPreview(index, deltaCm)}
              onPreviewEnd={hideEdgePreview}
            />
          ))
        : null}
      {onResizeRow
        ? rowEdges.map((edge, index) => (
            <HeaderResizeZone
              key={`row-resize-${edge}`}
              x={rect.x - HEADER_PX}
              y={rect.y + edge}
              length={HEADER_PX}
              zoom={zoom}
              onDragged={(deltaCm) =>
                onResizeRow(index, resizeBoundary(rows[index]!, deltaCm, 0.1))
              }
              onPreviewMove={(deltaCm) => showRowPreview(index, deltaCm)}
              onPreviewEnd={hideEdgePreview}
            />
          ))
        : null}
    </>
  );
}

/** Zona de arrastre en el borde de una cabecera (redimensiona esa fila/columna). */
function HeaderResizeZone({
  vertical,
  x,
  y,
  length,
  zoom,
  onDragged,
  onPreviewMove,
  onPreviewEnd,
}: {
  vertical?: boolean;
  x: number;
  y: number;
  length: number;
  zoom: number;
  onDragged: (deltaCm: number) => void;
  /** Por cada paso del drag, con el delta acumulado en cm. */
  onPreviewMove?: (deltaCm: number) => void;
  /** Al soltar, antes de aplicar el comando. */
  onPreviewEnd?: () => void;
}): ReactNode {
  const thickness = 8 / zoom;
  const startRef = useRef(0);

  return (
    <Rect
      name="tablix-header-resize"
      x={vertical ? x - thickness / 2 : x}
      y={vertical ? y : y - thickness / 2}
      width={vertical ? thickness : length}
      height={vertical ? length : thickness}
      fill="rgba(0,0,0,0.001)"
      draggable
      dragBoundFunc={(point) => (vertical ? { x: point.x, y } : { x, y: point.y })}
      onMouseEnter={(event) => {
        const stage = event.target.getStage();
        if (stage) stage.container().style.cursor = vertical ? 'ew-resize' : 'ns-resize';
      }}
      onMouseLeave={(event) => {
        const stage = event.target.getStage();
        if (stage) stage.container().style.cursor = '';
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        startRef.current = vertical ? event.target.x() : event.target.y();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const node = event.target;
        const scale = node.getStage()?.scaleX() ?? 1;
        const delta = ((vertical ? node.x() : node.y()) - startRef.current) / scale / PX_PER_CM;
        onPreviewMove?.(delta);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const node = event.target;
        const scale = node.getStage()?.scaleX() ?? 1;
        const delta = ((vertical ? node.x() : node.y()) - startRef.current) / scale / PX_PER_CM;
        // El nodo vuelve a su sitio: la posición la fija la proyección.
        if (vertical) node.x(x - thickness / 2);
        else node.y(y - thickness / 2);
        node.getLayer()?.batchDraw();
        onPreviewEnd?.();
        onDragged(delta);
      }}
    />
  );
}

/** Etiqueta del tamaño resultante (p. ej. «2.4 cm»), en la unidad declarada. */
function formatLength(length: Length): string {
  return `${Number(length.value.toFixed(2))} ${length.unit}`;
}

/** Posición de cada tirador sobre el rect (px de papel). */
function handlePosition(
  handle: ResizeHandle,
  rect: { x: number; y: number; width: number; height: number },
): [number, number] {
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  switch (handle) {
    case 'nw':
      return [rect.x, rect.y];
    case 'n':
      return [midX, rect.y];
    case 'ne':
      return [right, rect.y];
    case 'e':
      return [right, midY];
    case 'se':
      return [right, bottom];
    case 's':
      return [midX, bottom];
    case 'sw':
      return [rect.x, bottom];
    case 'w':
      return [rect.x, midY];
  }
}

/** Esquinas del rectángulo (adorno cuando el item no se puede redimensionar). */
function cornerPoints(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): [number, number][] {
  return [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
}
