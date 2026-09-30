import type Konva from 'konva';
import { useRef, type RefObject } from 'react';
import type { ProjectionDto } from '@rdlc-designer/contracts';
import { flattenItems } from '@/lib/projection';

/**
 * Marco de selección (U3): arrastrar sobre el fondo del lienzo y adoptar como
 * multiselección los items que intersecta. Vive en un hook para no engordar
 * `CanvasPreview` y para poder razonarlo aparte; la capa pinta el rect con el
 * `marqueeRef` que devuelve.
 */

export interface MarqueeHandlers {
  onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseMove: () => void;
  onMouseUp: () => void;
}

export interface MarqueeSelection {
  /** Rect del marco (se pinta en una capa propia, invisible hasta el drag). */
  marqueeRef: RefObject<Konva.Rect | null>;
  handlers: MarqueeHandlers;
  /** Tras un marco, el `click` sintético del stage no debe limpiar la selección. */
  suppressClickRef: RefObject<boolean>;
}

export function useMarqueeSelection(options: {
  stageRef: RefObject<Konva.Stage | null>;
  projection: ProjectionDto;
  onSelectMany?: (ids: string[]) => void;
}): MarqueeSelection {
  const { stageRef, projection, onSelectMany } = options;
  const marqueeRef = useRef<Konva.Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const onMouseDown = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    if (!onSelectMany || event.evt.button !== 0) return;
    // Solo desde el fondo del lienzo (los items cortan la propagación).
    if (event.target !== event.target.getStage()) return;
    // Coordenadas del **papel** (aplica la inversa del zoom del stage), las
    // mismas que `getClientRect({ relativeTo: stage })`.
    const pointer = stageRef.current?.getRelativePointerPosition();
    if (!pointer) return;
    startRef.current = pointer;
    movedRef.current = false;
  };

  const onMouseMove = (): void => {
    const start = startRef.current;
    const stage = stageRef.current;
    const rect = marqueeRef.current;
    if (!start || !stage || !rect) return;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;
    const dx = pointer.x - start.x;
    const dy = pointer.y - start.y;
    // Umbral: por debajo es un click normal (que ya limpia la selección).
    if (!movedRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    movedRef.current = true;
    rect.setAttrs({
      x: Math.min(start.x, pointer.x),
      y: Math.min(start.y, pointer.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
      visible: true,
    });
    rect.getLayer()?.batchDraw();
  };

  const onMouseUp = (): void => {
    const start = startRef.current;
    const stage = stageRef.current;
    const rect = marqueeRef.current;
    startRef.current = null;
    if (!start || !stage || !rect) return;
    rect.visible(false);
    rect.getLayer()?.batchDraw();
    if (!movedRef.current) return;
    movedRef.current = false;
    suppressClickRef.current = true;

    const box = { x: rect.x(), y: rect.y(), width: rect.width(), height: rect.height() };
    const ids = flattenItems(projection)
      .map((item) => item.id)
      .filter((id) => {
        const node = stage.findOne((candidate: Konva.Node) => candidate.id() === id);
        if (!node) return false;
        const client = node.getClientRect({ relativeTo: stage });
        return (
          box.x < client.x + client.width &&
          box.x + box.width > client.x &&
          box.y < client.y + client.height &&
          box.y + box.height > client.y
        );
      });
    onSelectMany?.(ids);
  };

  return { marqueeRef, handlers: { onMouseDown, onMouseMove, onMouseUp }, suppressClickRef };
}
