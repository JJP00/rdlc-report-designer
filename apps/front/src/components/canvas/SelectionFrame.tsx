import type Konva from 'konva';
import { useEffect, useRef, type ReactNode } from 'react';
import { Layer, Line, Rect } from 'react-konva';
import type { Length } from '@rdlc-designer/contracts';
import { computeResize, resizeBoundary, RESIZE_HANDLES, type BoxCm, type ResizeHandle } from '@/lib/resize';
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
}: SelectionFrameProps): ReactNode {
  const dragStart = useRef<{ pointer: { x: number; y: number }; box: BoxCm } | null>(null);
  const frameRef = useRef<Konva.Rect | null>(null);
  const previewRef = useRef<Konva.Rect | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || !box) return;
    // QA: dónde quedan los tiradores en pantalla (para guiones de captura).
    const handle = layerRef.current?.findOne('.handle-se') as Konva.Node | undefined;
    const position = handle?.getAbsolutePosition();
    const container = layerRef.current?.getStage()?.container().getBoundingClientRect();
    if (position && container) {
      (
        window as Window & { __rdlcResizeHandle?: { x: number; y: number } }
      ).__rdlcResizeHandle = { x: container.left + position.x, y: container.top + position.y };
    }
  });

  if (!rect) return <Layer listening={false} />;

  const size = 8 / zoom;
  const resizable = box !== undefined && onResize !== undefined;
  // Posiciones acumuladas de los separadores (en px de papel), calculadas una vez.
  const columnOffsets = grid ? cumulative(grid.columns) : [];
  const rowOffsets = grid ? cumulative(grid.rows) : [];

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

      {/* Separadores internos de la rejilla (solo con el Tablix seleccionado). */}
      {grid && onResizeColumn
        ? columnOffsets.slice(0, -1).map((offset, index) => (
            <GridSeparator
              key={`vc${offset}`}
              orientation="vertical"
              position={rect.x + offset}
              length={rect.height}
              zoom={zoom}
              onDragged={(deltaCm) => {
                const width = resizeBoundary(grid.columns[index]!, deltaCm, 0.1);
                onResizeColumn(index, width);
              }}
            />
          ))
        : null}
      {grid && onResizeRow
        ? rowOffsets.slice(0, -1).map((offset, index) => (
            <GridSeparator
              key={`hr${offset}`}
              orientation="horizontal"
              position={rect.y + offset}
              length={rect.width}
              zoom={zoom}
              onDragged={(deltaCm) => {
                const height = resizeBoundary(grid.rows[index]!, deltaCm, 0.1);
                onResizeRow(index, height);
              }}
            />
          ))
        : null}

      {resizable
        ? RESIZE_HANDLES.map((handle) => {            const [x, y] = handlePosition(handle, rect);
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

/**
 * Separador interno de la rejilla: se arrastra en su eje y avisa del delta en cm
 * (el nodo vuelve a su sitio; la posición la fija la proyección al actualizarse).
 */
function GridSeparator({
  orientation,
  position,
  length,
  zoom,
  onDragged,
}: {
  orientation: 'vertical' | 'horizontal';
  position: number;
  length: number;
  zoom: number;
  onDragged: (deltaCm: number) => void;
}): ReactNode {
  const vertical = orientation === 'vertical';
  return (
    <Line
      name="separator"
      points={vertical ? [position, 0, position, length] : [0, position, length, position]}
      stroke="#93c5fd"
      strokeWidth={1}
      hitStrokeWidth={8}
      draggable
      dragBoundFunc={(point) => (vertical ? { x: point.x, y: 0 } : { x: 0, y: point.y })}
      onMouseEnter={(event) => {
        event.target.getStage()!.container().style.cursor = vertical ? 'ew-resize' : 'ns-resize';
      }}
      onMouseLeave={(event) => {
        event.target.getStage()!.container().style.cursor = '';
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const node = event.target;
        const scale = node.getStage()?.scaleX() ?? 1;
        const delta = (vertical ? node.x() : node.y()) / scale / PX_PER_CM;
        node.position({ x: 0, y: 0 });
        onDragged(delta);
      }}
    />
  );
}

/** Posición de cada tirador sobre el rect (px de papel). */
function handlePosition(  handle: ResizeHandle,
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
