import type {
  ItemDto,
  Length,
  ProjectionDto,
  RegionDto,
  TablixDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Group, Layer, Line, Rect, Stage, Text as KonvaText } from 'react-konva';

export const PX_PER_CM = 96 / 2.54;
/** Rejilla de imán en cm (Shift la ignora al soltar). */
const SNAP_CM = 0.1;

function toPx(length: Length): number {
  switch (length.unit) {
    case 'cm':
      return length.value * PX_PER_CM;
    case 'mm':
      return (length.value / 10) * PX_PER_CM;
    case 'in':
      return length.value * 96;
    case 'pt':
      return length.value * (96 / 72);
  }
}

export interface CanvasPreviewProps {
  projection: ProjectionDto;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Se llama al soltar un drag con la posición ya normalizada (cm). */
  onMoveItem?: (id: string, top: Length, left: Length) => void;
}

/**
 * Lienzo de la proyección. En modo edición los items de primer nivel de cada
 * banda se pueden seleccionar y arrastrar; el drag commitea UN comando al
 * soltar (la semántica de acción completada del contrato).
 */
export function CanvasPreview({
  projection,
  zoom,
  selectedId,
  onSelect,
  onMoveItem,
}: CanvasPreviewProps): ReactNode {
  const pageWidth = toPx(projection.page.width);
  const pageHeight = toPx(projection.page.height);

  const bands: { key: string; region: RegionDto; visible: boolean }[] = [
    { key: 'header', region: projection.page.header, visible: fingerprint(projection.page.header) },
    { key: 'body', region: projection.page.body, visible: true },
    { key: 'footer', region: projection.page.footer, visible: fingerprint(projection.page.footer) },
  ];

  const bandsWithOffsets: { key: string; region: RegionDto; y: number }[] = [];
  let y = 0;
  for (const band of bands) {
    if (!band.visible) continue;
    bandsWithOffsets.push({ key: band.key, region: band.region, y });
    y += toPx(band.region.height);
  }
  const contentBottom = Math.min(y, pageHeight);

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
      <Stage
        width={pageWidth * zoom}
        height={pageHeight * zoom}
        scaleX={zoom}
        scaleY={zoom}
        style={{ background: '#f3f4f6' }}
        onClick={(event) => {
          // Click en vacío = deseleccionar (los items cortan la propagación).
          if (event.target === event.target.getStage()) onSelect?.(null);
        }}
      >
        <Layer>
          <Rect
            x={0}
            y={0}
            width={pageWidth}
            height={pageHeight}
            fill="#ffffff"
            stroke="#d1d5db"
            listening={false}
          />
          {bandsWithOffsets.map((band, index) => (
            <Group key={band.key} y={band.y}>
              {index > 0 ? (
                <Line
                  points={[0, 0, pageWidth, 0]}
                  stroke="#e5e7eb"
                  dash={[6, 4]}
                  strokeWidth={1 / zoom}
                  listening={false}
                />
              ) : null}
              {band.region.items.map((item) => (
                <ItemView
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  draggable={onMoveItem !== undefined}
                  onSelect={onSelect}
                  onMoveItem={onMoveItem}
                  bounds={{ width: pageWidth, height: toPx(band.region.height) }}
                />
              ))}
            </Group>
          ))}
          {contentBottom < pageHeight ? (
            <Line
              points={[0, contentBottom, pageWidth, contentBottom]}
              stroke="#e5e7eb"
              dash={[6, 4]}
              strokeWidth={1 / zoom}
              listening={false}
            />
          ) : null}
        </Layer>
      </Stage>
    </div>
  );
}

function fingerprint(region: RegionDto): boolean {
  return toPx(region.height) > 0 || region.items.length > 0;
}

interface NodeGroupProps {
  itemId: string;
  x: number;
  y: number;
  draggable?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  /** Límites de la región (px) y tamaño del item para no salir de ella. */
  bounds?: { width: number; height: number };
  itemSize?: { width: number; height: number };
  children: ReactNode;
}

/** Nodo Konva mínimo que necesitamos para el clamp (evita tipar el árbol entero). */
interface MovableNode {
  x(): number;
  x(value: number): void;
  y(): number;
  y(value: number): void;
}

/** Grupo posicionado con selección y drag (un comando al soltar, con snap). */
function NodeGroup({
  itemId,
  x,
  y,
  draggable,
  onSelect,
  onMoveItem,
  bounds,
  itemSize,
  children,
}: NodeGroupProps): ReactNode {
  /** Mantiene el nodo dentro de su región (invariante del dominio). */
  const clampToBounds = (node: MovableNode): void => {
    if (!bounds || !itemSize) return;
    const maxX = Math.max(0, bounds.width - itemSize.width);
    const maxY = Math.max(0, bounds.height - itemSize.height);
    node.x(Math.min(Math.max(node.x(), 0), maxX));
    node.y(Math.min(Math.max(node.y(), 0), maxY));
  };

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect?.(itemId);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect?.(itemId);
      }}
      onDragMove={(event) => clampToBounds(event.target)}
      onDragEnd={(event) => {
        const node = event.target;
        clampToBounds(node);

        const snap = !event.evt.shiftKey;
        let leftCm = node.x() / PX_PER_CM;
        let topCm = node.y() / PX_PER_CM;
        if (snap) {
          leftCm = Math.round(leftCm / SNAP_CM) * SNAP_CM;
          topCm = Math.round(topCm / SNAP_CM) * SNAP_CM;
        }
        leftCm = round2(leftCm);
        topCm = round2(topCm);

        node.position({ x: leftCm * PX_PER_CM, y: topCm * PX_PER_CM });
        clampToBounds(node);

        onMoveItem?.(itemId, { value: node.y() / PX_PER_CM, unit: 'cm' }, { value: node.x() / PX_PER_CM, unit: 'cm' });
      }}
    >
      {children}
    </Group>
  );
}

interface ItemViewProps {
  item: ItemDto;
  selected?: boolean;
  draggable?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  bounds?: { width: number; height: number };
}

function ItemView({
  item,
  selected,
  draggable,
  onSelect,
  onMoveItem,
  bounds,
}: ItemViewProps): ReactNode {
  if (item.hidden === true) return null;

  const x = toPx(item.left);
  const y = toPx(item.top);
  const width = toPx(item.width);
  const height = toPx(item.height);

  const outline = selected ? (
    <Rect
      x={-1.5}
      y={-1.5}
      width={width + 3}
      height={height + 3}
      stroke="#2563eb"
      strokeWidth={1.5}
      dash={[4, 3]}
      strokeScaleEnabled={false}
      listening={false}
    />
  ) : null;

  const fontSize = item.style?.fontSize ? toPx(item.style.fontSize) : 12;
  const fontStyle = [
    item.style?.fontWeight === 'Bold' ? 'bold' : '',
    item.style?.fontStyle === 'Italic' ? 'italic' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <NodeGroup
      itemId={item.id}
      x={x}
      y={y}
      draggable={draggable}
      onSelect={onSelect}
      onMoveItem={onMoveItem}
      bounds={draggable ? bounds : undefined}
      itemSize={{ width, height }}
    >
      {renderContent(item, width, height, fontSize, fontStyle, onSelect)}
      {outline}
    </NodeGroup>
  );
}

function renderContent(
  item: ItemDto,
  width: number,
  height: number,
  fontSize: number,
  fontStyle: string,
  onSelect?: (id: string | null) => void,
): ReactNode {
  switch (item.kind) {
    case 'textbox': {
      const text = item.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.value).join(''))
        .join('\n');
      return (
        <>
          {/* El grupo recorta el contenido; NO puede ser listening=false o el
              texto/rect no serían clicables (hit-testing de Konva). */}
          <Group clip={{ x: 0, y: 0, width, height }}>
            <Rect
              width={width}
              height={height}
              fill={item.style?.backgroundColor ?? '#ffffff'}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <KonvaText
              text={text}
              x={2}
              y={1}
              width={Math.max(width - 4, 0)}
              height={Math.max(height - 2, 0)}
              fontSize={fontSize}
              fontStyle={fontStyle || 'normal'}
              fontFamily={item.style?.fontFamily ?? 'Segoe UI'}
              fill={item.style?.color ?? '#111827'}
              align={(item.style?.textAlign ?? 'Left').toLowerCase() as 'left' | 'center' | 'right'}
              wrap="none"
              ellipsis
            />
          </Group>
        </>
      );
    }

    case 'rectangle':
      return (
        <>
          {/* fill transparente (no undefined): sin fill, el área no es clicable. */}
          <Rect
            width={width}
            height={height}
            fill={item.style?.backgroundColor ?? 'rgba(0,0,0,0)'}
            stroke="#9ca3af"
            strokeWidth={0.5}
          />
          {item.children.map((child) => (
            <ItemView key={child.id} item={child} onSelect={onSelect} />
          ))}
        </>
      );

    case 'line':
      return <Line points={[0, 0, width, height]} stroke="#111827" hitStrokeWidth={8} />;

    case 'image':
      return (
        <Rect width={width} height={height} fill="rgba(0,0,0,0)" stroke="#9ca3af" dash={[4, 3]} />
      );

    case 'tablix':
      return <TablixContent item={item} onSelect={onSelect} />;

    case 'unknown':
      return (
        <Rect width={width} height={height} fill="rgba(0,0,0,0)" stroke="#f59e0b" dash={[6, 3]} />
      );
  }
}

function TablixContent({
  item,
  onSelect,
}: {
  item: TablixDto;
  onSelect?: (id: string | null) => void;
}): ReactNode {
  const columns = item.body.columns.map(toPx);
  const rows = item.body.rows.map((row) => toPx(row.height));
  const totalWidth = columns.reduce((acc, value) => acc + value, 0);
  const totalHeight = rows.reduce((acc, value) => acc + value, 0);

  const grid: ReactNode[] = [];
  let cx = 0;
  columns.forEach((columnWidth, index) => {
    cx += columnWidth;
    grid.push(
      <Line
        key={`v${index}`}
        points={[cx, 0, cx, totalHeight]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />,
    );
  });
  let cy = 0;
  rows.forEach((rowHeight, index) => {
    cy += rowHeight;
    grid.push(
      <Line
        key={`h${index}`}
        points={[0, cy, totalWidth, cy]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />,
    );
  });

  const cells: ReactNode[] = [];
  let rowY = 0;
  item.body.rows.forEach((row, rowIndex) => {
    let colX = 0;
    row.cells.forEach((cell, colIndex) => {
      if (cell?.content) {
        cells.push(
          <Group key={`c${rowIndex}-${colIndex}`} x={colX} y={rowY}>
            <ItemView item={cell.content} onSelect={onSelect} />
          </Group>,
        );
      }
      colX += columns[colIndex] ?? 0;
    });
    rowY += rows[rowIndex] ?? 0;
  });

  return (
    <>
      <Rect width={totalWidth} height={totalHeight} stroke="#9ca3af" strokeWidth={0.5} />
      {grid}
      {cells}
    </>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
