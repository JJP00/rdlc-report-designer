import type { Length } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Group, Layer, Rect } from 'react-konva';
import type { DropInfo } from '@/lib/dragTypes';
import { sortByZIndex } from '@/lib/projection';
import type { SelectedCell } from '@/lib/tablix';
import type { PaperLayout } from './bands';
import type { VisibleRect } from './culling';
import { ItemView } from './ItemView';
import { toPx } from './geometry';

export interface PaperProps {
  layout: PaperLayout;
  selectedId?: string | null;
  onSelect?: (id: string | null, additive?: boolean) => void;
  onMoveTo?: (id: string, top: Length, left: Length, drop?: DropInfo) => void;
  /** Redimensionar una columna/fila de la rejilla de un Tablix. */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  /** Celda de Tablix seleccionada. */
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  draggable: boolean;
  /** Culling (T3): ventana visible en px de papel; null = pinta todo. */
  cull?: VisibleRect | null;
}

/** Papel + área imprimible + bandas con sus items (los items se apilan por `ZIndex`). */
export function Paper({
  layout,
  selectedId,
  onSelect,
  onMoveTo,
  onResizeColumn,
  onResizeRow,
  selectedCell,
  onSelectCell,
  draggable,
  cull,
}: PaperProps): ReactNode {
  return (
    <Layer>
      {/* Papel (A4). */}
      <Rect
        x={0}
        y={0}
        width={layout.sheetWidth}
        height={layout.sheetHeight}
        fill="#ffffff"
        stroke="#a1a1aa"
        strokeScaleEnabled={false}
        shadowColor="rgba(0,0,0,0.25)"
        shadowBlur={10}
        shadowOffsetY={2}
        listening={false}
      />
      {/* Área imprimible (márgenes). */}
      <Rect
        x={layout.marginLeft}
        y={layout.marginTop}
        width={Math.max(layout.sheetWidth - layout.marginLeft - layout.marginRight, 0)}
        height={Math.max(layout.sheetHeight - layout.marginTop - layout.marginBottom, 0)}
        stroke="#a1a1aa"
        dash={[6, 4]}
        strokeScaleEnabled={false}
        fillEnabled={false}
        listening={false}
      />
      {layout.bands
        .filter((band) => band.visible)
        .map((band) => (
          <Group key={band.key} x={band.x} y={band.y}>
            {/* Caja de la banda (tamaño real de encabezado/cuerpo/pie). */}
            <Rect
              width={layout.reportWidth}
              height={toPx(band.region.height)}
              stroke="#d4d4d8"
              strokeScaleEnabled={false}
              fillEnabled={false}
              listening={false}
            />
            {sortByZIndex(band.region.items).map((item) => (
              <ItemView
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                draggable={draggable}
                onSelect={onSelect}
                onMoveTo={onMoveTo}
                onResizeColumn={onResizeColumn}
                onResizeRow={onResizeRow}
                selectedCell={selectedCell}
                onSelectCell={onSelectCell}
                bounds={{ width: layout.reportWidth, height: toPx(band.region.height) }}
                originX={band.x}
                originY={band.y}
                cull={cull ?? null}
              />
            ))}
          </Group>
        ))}
    </Layer>
  );
}
