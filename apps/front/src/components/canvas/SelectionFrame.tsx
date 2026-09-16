import type Konva from 'konva';
import { useEffect, useRef, type ReactNode } from 'react';
import { Layer, Rect } from 'react-konva';
import { computeResize, RESIZE_HANDLES, type BoxCm, type ResizeHandle } from '@/lib/resize';
import { PX_PER_CM } from './geometry';

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
export function SelectionFrame({ rect, zoom, box, bounds, onResize }: SelectionFrameProps): ReactNode {
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
