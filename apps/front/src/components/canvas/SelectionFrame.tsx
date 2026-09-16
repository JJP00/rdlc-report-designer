import type { ReactNode } from 'react';
import { Layer, Rect } from 'react-konva';

export interface SelectionFrameProps {
  /** Rectángulo en px de papel (medido del nodo Konva real). */
  rect: { x: number; y: number; width: number; height: number } | null;
  zoom: number;
}

/**
 * Marco de selección en una capa superior (ningún item lo tapa). Se mide del
 * nodo Konva real porque el rect del modelo depende del contenedor (una celda de
 * Tablix no declara geometría propia).
 */
export function SelectionFrame({ rect, zoom }: SelectionFrameProps): ReactNode {
  if (!rect) return <Layer listening={false} />;

  return (
    <Layer listening={false}>
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke="#2563eb"
        strokeWidth={2}
        dash={[6, 3]}
        strokeScaleEnabled={false}
        fillEnabled={false}
      />
      {cornerPoints(rect).map(([x, y]) => (
        <Rect
          key={`${x}-${y}`}
          x={x - 4 / zoom}
          y={y - 4 / zoom}
          width={8 / zoom}
          height={8 / zoom}
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth={1 / zoom}
        />
      ))}
    </Layer>
  );
}

/** Esquinas del rectángulo (para los tiradores). */
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
