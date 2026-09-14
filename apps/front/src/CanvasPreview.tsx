import type {
  ItemDto,
  Length,
  ProjectionDto,
  RegionDto,
  TablixDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Group, Layer, Line, Rect, Stage, Text as KonvaText } from 'react-konva';

const PX_PER_CM = 96 / 2.54;

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

/** Vista de solo lectura de la proyección (F0). En F1 pasa a lienzo editable. */
export function CanvasPreview({
  projection,
  zoom,
}: {
  projection: ProjectionDto;
  zoom: number;
}): ReactNode {
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
    <div className="canvas-scroll">
      <Stage
        width={pageWidth * zoom}
        height={pageHeight * zoom}
        scaleX={zoom}
        scaleY={zoom}
        style={{ background: '#f3f4f6' }}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={pageWidth} height={pageHeight} fill="#ffffff" stroke="#d1d5db" />
          {bandsWithOffsets.map((band, index) => (
            <Group key={band.key} y={band.y}>
              {index > 0 ? (
                <Line
                  points={[0, 0, pageWidth, 0]}
                  stroke="#e5e7eb"
                  dash={[6, 4]}
                  strokeWidth={1 / zoom}
                />
              ) : null}
              {band.region.items.map((item) => (
                <ItemView key={item.id} item={item} />
              ))}
            </Group>
          ))}
          {contentBottom < pageHeight ? (
            <Line
              points={[0, contentBottom, pageWidth, contentBottom]}
              stroke="#e5e7eb"
              dash={[6, 4]}
              strokeWidth={1 / zoom}
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

function ItemView({ item }: { item: ItemDto }): ReactNode {
  if (item.hidden === true) return null;

  const x = toPx(item.left);
  const y = toPx(item.top);
  const width = toPx(item.width);
  const height = toPx(item.height);
  const fontSize = item.style?.fontSize ? toPx(item.style.fontSize) : 12;
  const fontStyle = [
    item.style?.fontWeight === 'Bold' ? 'bold' : '',
    item.style?.fontStyle === 'Italic' ? 'italic' : '',
  ]
    .filter(Boolean)
    .join(' ');

  switch (item.kind) {
    case 'textbox': {
      const text = item.paragraphs
        .map((paragraph) => paragraph.runs.map((run) => run.value).join(''))
        .join('\n');
      return (
        <Group key={item.id} x={x} y={y} clip={{ x: 0, y: 0, width, height }}>
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
      );
    }

    case 'rectangle':
      return (
        <Group key={item.id} x={x} y={y}>
          <Rect
            width={width}
            height={height}
            fill={item.style?.backgroundColor}
            stroke="#9ca3af"
            strokeWidth={0.5}
          />
          {item.children.map((child) => (
            <ItemView key={child.id} item={child} />
          ))}
        </Group>
      );

    case 'line':
      return <Line key={item.id} points={[x, y, x + width, y + height]} stroke="#111827" />;

    case 'image':
      return (
        <Rect
          key={item.id}
          x={x}
          y={y}
          width={width}
          height={height}
          stroke="#9ca3af"
          dash={[4, 3]}
        />
      );

    case 'tablix':
      return <TablixView key={item.id} item={item} />;

    case 'unknown':
      return (
        <Rect
          key={item.id}
          x={x}
          y={y}
          width={width}
          height={height}
          stroke="#f59e0b"
          dash={[6, 3]}
        />
      );
  }
}

function TablixView({ item }: { item: TablixDto }): ReactNode {
  const x = toPx(item.left);
  const y = toPx(item.top);
  const columns = item.body.columns.map(toPx);
  const rows = item.body.rows.map((row) => toPx(row.height));
  const totalWidth = columns.reduce((acc, value) => acc + value, 0);
  const totalHeight = rows.reduce((acc, value) => acc + value, 0);

  const grid: ReactNode[] = [];
  let cx = 0;
  columns.forEach((columnWidth, index) => {
    cx += columnWidth;
    grid.push(
      <Line key={`v${index}`} points={[cx, 0, cx, totalHeight]} stroke="#d1d5db" strokeWidth={0.5} />,
    );
  });
  let cy = 0;
  rows.forEach((rowHeight, index) => {
    cy += rowHeight;
    grid.push(
      <Line key={`h${index}`} points={[0, cy, totalWidth, cy]} stroke="#d1d5db" strokeWidth={0.5} />,
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
            <ItemView item={cell.content} />
          </Group>,
        );
      }
      colX += columns[colIndex] ?? 0;
    });
    rowY += rows[rowIndex] ?? 0;
  });

  return (
    <Group x={x} y={y}>
      <Rect width={totalWidth} height={totalHeight} stroke="#9ca3af" strokeWidth={0.5} />
      {grid}
      {cells}
    </Group>
  );
}
