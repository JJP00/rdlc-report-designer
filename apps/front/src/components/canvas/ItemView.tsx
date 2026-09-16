import type {
  ItemDto,
  Length,
  RectangleDto,
  StyleDto,
  TablixDto,
  TextboxDto,
} from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useRef, type ReactNode } from 'react';
import { Group, Line, Rect, Text as KonvaText } from 'react-konva';
import { computeDragEnd } from '@/lib/drag';
import { sortByZIndex } from '@/lib/projection';
import { effectiveTextStyle } from '@/lib/style';
import { runDisplayText } from '@/lib/text';
import { PX_PER_CM, SNAP_CM, toPx } from './geometry';

/**
 * Item del lienzo: el nodo Konva de cada elemento (selección y drag) y su
 * contenido según el tipo (textbox, rectángulo, línea, imagen, tablix).
 */

interface MovableNode {
  x(): number;
  x(value: number): void;
  y(): number;
  y(value: number): void;
}

interface NodeGroupProps {
  itemId: string;
  x: number;
  y: number;
  draggable?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  /** Límites del contenedor (px) y tamaño del item para no salir de él. */
  bounds?: { width: number; height: number };
  itemSize?: { width: number; height: number };
  children: ReactNode;
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
  const dragState = useRef<{
    pointerX: number;
    pointerY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);

  /**
   * Nunca negativo. El tope máximo solo aplica cuando hay `bounds` (regiones
   * de primer nivel): los items anidados pueden desbordar su contenedor en
   * RDL, así que no se les fuerza a 0 cuando no caben.
   */
  const clampToBounds = (node: MovableNode): void => {
    const x = Math.max(node.x(), 0);
    const y = Math.max(node.y(), 0);

    if (!bounds || !itemSize) {
      node.x(x);
      node.y(y);
      return;
    }

    const maxX = bounds.width - itemSize.width;
    const maxY = bounds.height - itemSize.height;
    node.x(maxX > 0 ? Math.min(x, maxX) : x);
    node.y(maxY > 0 ? Math.min(y, maxY) : y);
  };

  return (
    <Group
      id={itemId}
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
      onDragStart={(event) => {
        if (event.target !== event.currentTarget) return;
        event.cancelBubble = true;
        // Arrastrar selecciona: Konva no re-emite `click` tras un drag y el
        // elemento quedaría sin seleccionar al soltar.
        onSelect?.(itemId);
        const node = event.target;
        dragState.current = {
          pointerX: event.evt.clientX,
          pointerY: event.evt.clientY,
          nodeX: node.x(),
          nodeY: node.y(),
        };
      }}
      onDragMove={(event) => {
        // `dragmove` burbujea: solo atiende el grupo que arrastra de verdad.
        if (event.target !== event.currentTarget) return;
        const state = dragState.current;
        if (!state) return;

        // Posición calculada por nosotros: el delta del puntero (en unidades
        // del stage) aplicado a la posición inicial del nodo. Es determinista
        // con anidamiento, a diferencia del `setAbsolutePosition` de Konva.
        const node = event.target;
        const zoom = node.getStage()?.scaleX() ?? 1;
        node.x(state.nodeX + (event.evt.clientX - state.pointerX) / zoom);
        node.y(state.nodeY + (event.evt.clientY - state.pointerY) / zoom);
        clampToBounds(node);
        // Redibuja escena y grafo de hit: sin esto el `click` posterior usa la
        // posición antigua y la selección se pierde al soltar.
        node.getLayer()?.batchDraw();
      }}
      onDragEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        const node = event.target;
        dragState.current = null;

        const { top, left } = computeDragEnd({
          x: node.x(),
          y: node.y(),
          itemSize: itemSize ?? { width: 0, height: 0 },
          ...(bounds ? { bounds } : {}),
          snap: !event.evt.shiftKey,
          pxPerCm: PX_PER_CM,
          snapCm: SNAP_CM,
        });

        node.position({ x: left * PX_PER_CM, y: top * PX_PER_CM });
        onMoveItem?.(itemId, { value: top, unit: 'cm' }, { value: left, unit: 'cm' });
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
  /** Redimensionar una columna/fila de la rejilla de un Tablix. */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  bounds?: { width: number; height: number };
}

export function ItemView({
  item,
  selected,
  draggable,
  onSelect,
  onMoveItem,
  onResizeColumn,
  onResizeRow,
  bounds,
}: ItemViewProps): ReactNode {
  if (item.hidden === true) return null;

  const x = toPx(item.left);
  const y = toPx(item.top);
  const width = toPx(item.width);
  const height = toPx(item.height);

  // Estilo efectivo (run > párrafo > item): lo que BC renderizará de verdad.
  // Los textbox pueden llevar el formato en los runs, no en el item.
  const style = item.kind === 'textbox' ? effectiveTextStyle(item) : item.style;

  const fontSize = style?.fontSize ? toPx(style.fontSize) : 12;
  const fontStyle = [
    style?.fontWeight === 'Bold' ? 'bold' : '',
    style?.fontStyle === 'Italic' ? 'italic' : '',
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
      {renderContent(
        item,
        style,
        width,
        height,
        fontSize,
        fontStyle,
        selected,
        onSelect,
        onMoveItem,
        onResizeColumn,
        onResizeRow,
      )}
    </NodeGroup>
  );
}

/** Contenido del item según su tipo (un componente por tipo, sin switch gigante). */
function renderContent(
  item: ItemDto,
  style: StyleDto | undefined,
  width: number,
  height: number,
  fontSize: number,
  fontStyle: string,
  selected?: boolean,
  onSelect?: (id: string | null) => void,
  onMoveItem?: (id: string, top: Length, left: Length) => void,
  onResizeColumn?: (id: string, column: number, width: Length) => void,
  onResizeRow?: (id: string, row: number, height: Length) => void,
): ReactNode {
  switch (item.kind) {
    case 'textbox':
      return (
        <TextboxContent
          item={item}
          style={style}
          width={width}
          height={height}
          fontSize={fontSize}
          fontStyle={fontStyle}
        />
      );
    case 'rectangle':
      return (
        <RectangleContent
          item={item}
          onSelect={onSelect}
          onMoveItem={onMoveItem}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
          width={width}
          height={height}
        />
      );
    case 'line':
      return <LineContent width={width} height={height} />;
    case 'image':
      return <ImagePlaceholder width={width} height={height} source={item.source} />;
    case 'tablix':
      return (
        <TablixContent
          item={item}
          selected={selected}
          onSelect={onSelect}
          onMoveItem={onMoveItem}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
        />
      );
    default:
      return <UnknownContent width={width} height={height} />;
  }
}

function TextboxContent({
  item,
  style,
  width,
  height,
  fontSize,
  fontStyle,
}: {
  item: TextboxDto;
  style: StyleDto | undefined;
  width: number;
  height: number;
  fontSize: number;
  fontStyle: string;
}): ReactNode {
  const text = item.paragraphs.map((paragraph) => paragraph.runs.map(runDisplayText).join('')).join('\n');
  const padding = style?.padding;
  const padLeft = padding?.left ? toPx(padding.left) : 2;
  const padRight = padding?.right ? toPx(padding.right) : 2;
  const padTop = padding?.top ? toPx(padding.top) : 1;
  const padBottom = padding?.bottom ? toPx(padding.bottom) : 1;

  return (
    <>
      {/* El grupo recorta el contenido; NO puede ser listening=false o el
          texto/rect no serían clicables (hit-testing de Konva). */}
      <Group clip={{ x: 0, y: 0, width, height }}>
        <Rect
          width={width}
          height={height}
          fill={style?.backgroundColor ?? '#ffffff'}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
        <KonvaText
          text={text}
          x={padLeft}
          y={padTop}
          width={Math.max(width - padLeft - padRight, 0)}
          height={Math.max(height - padTop - padBottom, 0)}
          fontSize={fontSize}
          fontStyle={fontStyle || 'normal'}
          fontFamily={style?.fontFamily ?? 'Segoe UI'}
          fill={style?.color ?? '#111827'}
          align={(style?.textAlign ?? 'Left').toLowerCase() as 'left' | 'center' | 'right'}
          verticalAlign={
            (style?.verticalAlign ?? 'Top').toLowerCase() as 'top' | 'middle' | 'bottom'
          }
          wrap="none"
          ellipsis
        />
      </Group>
    </>
  );
}

function RectangleContent({
  item,
  width,
  height,
  onSelect,
  onMoveItem,
  onResizeColumn,
  onResizeRow,
}: {
  item: RectangleDto;
  width: number;
  height: number;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
}): ReactNode {
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
      {sortByZIndex(item.children).map((child) => (
        <ItemView
          key={child.id}
          item={child}
          onSelect={onSelect}
          onMoveItem={onMoveItem}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
          draggable={onMoveItem !== undefined}
          /* Sin bounds: el contenedor no es un límite duro en RDL. */
        />
      ))}
    </>
  );
}

function LineContent({ width, height }: { width: number; height: number }): ReactNode {
  return <Line points={[0, 0, width, height]} stroke="#111827" hitStrokeWidth={8} />;
}

function UnknownContent({ width, height }: { width: number; height: number }): ReactNode {
  return (
    <Rect width={width} height={height} fill="rgba(0,0,0,0)" stroke="#f59e0b" dash={[6, 3]} />
  );
}

/**
 * Placeholder de imagen: en tiempo de diseño no hay datos (el `<Value>` es una
 * expresión / URL), así que se dibuja un marco con el icono de imagen y el
 * origen — como hace Report Builder.
 */
function ImagePlaceholder({
  width,
  height,
  source,
}: {
  width: number;
  height: number;
  source?: string;
}): ReactNode {
  const inset = Math.min(width, height) * 0.15;
  const frame = {
    x: inset,
    y: inset,
    width: Math.max(width - inset * 2, 0),
    height: Math.max(height - inset * 2, 0),
  };
  const iconSize = Math.min(frame.width, frame.height) * 0.55;
  const iconX = frame.x + (frame.width - iconSize) / 2;
  const iconY = frame.y + (frame.height - iconSize) / 2;

  const showLabel = width > 90 && height > 26;

  return (
    <>
      <Rect width={width} height={height} fill="#f9fafb" stroke="#9ca3af" dash={[4, 3]} />
      {/* Montañita + sol: pictograma clásico de imagen */}
      <Line
        points={[
          iconX,
          iconY + iconSize,
          iconX + iconSize * 0.38,
          iconY + iconSize * 0.35,
          iconX + iconSize * 0.6,
          iconY + iconSize * 0.68,
          iconX + iconSize * 0.78,
          iconY + iconSize * 0.5,
          iconX + iconSize,
          iconY + iconSize,
        ]}
        stroke="#9ca3af"
        strokeWidth={1}
        closed
        fill="#e5e7eb"
        listening={false}
      />
      <Rect
        x={iconX + iconSize * 0.68}
        y={iconY + iconSize * 0.08}
        width={iconSize * 0.22}
        height={iconSize * 0.22}
        cornerRadius={iconSize * 0.11}
        fill="#9ca3af"
        listening={false}
      />
      {showLabel ? (
        <KonvaText
          text={source ?? 'Imagen'}
          x={frame.x + 2}
          y={frame.y + frame.height - 11}
          width={Math.max(frame.width - 4, 0)}
          fontSize={9}
          fill="#9ca3af"
          align="center"
          wrap="none"
          ellipsis
          listening={false}
        />
      ) : null}
    </>
  );
}

function TablixContent({
  item,
  selected,
  onSelect,
  onMoveItem,
  onResizeColumn,
  onResizeRow,
}: {
  item: TablixDto;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
}): ReactNode {
  const columns = item.body.columns.map(toPx);
  const rows = item.body.rows.map((row) => toPx(row.height));
  const totalWidth = columns.reduce((acc, value) => acc + value, 0);
  const totalHeight = rows.reduce((acc, value) => acc + value, 0);

  const borderRef = useRef<Konva.Rect | null>(null);

  const columnOffsets: number[] = [];
  let offsetX = 0;
  for (const columnWidth of columns) {
    columnOffsets.push(offsetX);
    offsetX += columnWidth;
  }
  const rowOffsets: number[] = [];
  let offsetY = 0;
  for (const rowHeight of rows) {
    rowOffsets.push(offsetY);
    offsetY += rowHeight;
  }

  const cells: ReactNode[] = [];
  item.body.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, colIndex) => {
      if (!cell?.content) return;
      cells.push(
        <Group
          key={`c${rowIndex}-${colIndex}`}
          x={columnOffsets[colIndex] ?? 0}
          y={rowOffsets[rowIndex] ?? 0}
        >
          <ItemView
            item={cell.content}
            onSelect={onSelect}
            onMoveItem={onMoveItem}
            onResizeColumn={onResizeColumn}
            onResizeRow={onResizeRow}
            draggable={onMoveItem !== undefined}
            /* Sin bounds: el contenido de una celda puede desbordarla. */
          />
        </Group>,
      );
    });
  });

  const grid: ReactNode[] = [];
  let cx = 0;
  columns.forEach((columnWidth) => {
    cx += columnWidth;
    grid.push(
      <Line
        key={`v${cx}`}
        points={[cx, 0, cx, totalHeight]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />,
    );
  });
  let cy = 0;
  rows.forEach((rowHeight) => {
    cy += rowHeight;
    grid.push(
      <Line
        key={`h${cy}`}
        points={[0, cy, totalWidth, cy]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />,
    );
  });

  return (
    <>
      {cells}
      {/* La rejilla va encima de las celdas (los separadores se dibujan en la
          capa de selección, como los tiradores). */}
      {grid}
      {/* Borde del Tablix (arriba del todo): pincharlo selecciona la **tabla**,
          como en RB, porque el interior cae en las celdas. `hitStrokeWidth` le
          da margen de ratón. */}
      <Rect
        ref={borderRef}
        width={totalWidth}
        height={totalHeight}
        stroke="#9ca3af"
        strokeWidth={0.5}
        hitStrokeWidth={10}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect?.(item.id);
        }}
      />
    </>
  );
}

