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
import { tablixGrid } from '@/lib/grid';
import { sortByZIndex, tablixHeaderItems } from '@/lib/projection';
import { paintColor } from '@/lib/style';
import { tablixLayout, cellRange, isCellInRange, type SelectedCell } from '@/lib/tablix';
import { browserTextMeasurer, layoutTextbox } from '@/lib/textLayout';
import { itemOpacity } from '@/lib/visibility';
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
  /** Opacidad de pintado (los items con `Hidden = true` se atenúan). */
  opacity?: number;
  draggable?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveTo?: (id: string, top: Length, left: Length) => void;
  /** Límites del contenedor (px) y tamaño del item para no salir de él. */
  bounds?: { width: number; height: number };
  itemSize?: { width: number; height: number };
  /** Shift+click amplía el rango y Ctrl+click añade celdas (sobre el contenido). */
  shiftCell?: { id: string; row: number; col: number } | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  children: ReactNode;
}

/**
 * Konva no filtra el botón: un click derecho también emite `click`. La
 * selección del menú contextual la decide el hit del `contextmenu` (DOM).
 */
function isSecondaryClick(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): boolean {
  return (event.evt as MouseEvent).button === 2;
}

/** Grupo posicionado con selección y drag (un comando al soltar, con snap). */
function NodeGroup({
  itemId,
  x,
  y,
  opacity,
  draggable,
  onSelect,
  onMoveTo,
  bounds,
  itemSize,
  shiftCell,
  onSelectCell,
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
      opacity={opacity}
      draggable={draggable}
      onClick={(event) => {
        if (isSecondaryClick(event)) return;
        const evt = event.evt as MouseEvent;
        // Shift+click amplía el rango; Ctrl/Cmd+click añade celdas (RB).
        if (shiftCell && (evt.shiftKey || evt.ctrlKey || evt.metaKey)) {
          event.cancelBubble = true;
          onSelectCell?.(shiftCell, evt.shiftKey, evt.ctrlKey || evt.metaKey);
          return;
        }
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
        onMoveTo?.(itemId, { value: top, unit: 'cm' }, { value: left, unit: 'cm' });
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
  onMoveTo?: (id: string, top: Length, left: Length) => void;
  /** Redimensionar una columna/fila de la rejilla de un Tablix. */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  /** Celda de Tablix seleccionada (F2 parte 3). */
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  /** Si el item es el contenido directo de una celda, su celda (Shift+click). */
  cellOwner?: { id: string; row: number; col: number } | null;
  bounds?: { width: number; height: number };
}

export function ItemView({
  item,
  selected,
  draggable,
  onSelect,
  onMoveTo,
  onResizeColumn,
  onResizeRow,
  selectedCell,
  onSelectCell,
  cellOwner,
  bounds,
}: ItemViewProps): ReactNode {
  const x = toPx(item.left);
  const y = toPx(item.top);
  const width = toPx(item.width);
  const height = toPx(item.height);

  // El estilo efectivo por párrafo/run lo resuelve el layout del textbox
  // (precedencia RDL: run > párrafo > item).
  const style = item.style;

  return (
    <NodeGroup
      itemId={item.id}
      x={x}
      y={y}
      // `Hidden = true` literal se atenúa (el layout sigue editable); las
      // expresiones no se evalúan en diseño, como en RB.
      opacity={itemOpacity(item.hidden)}
      draggable={draggable}
      onSelect={onSelect}
      onMoveTo={onMoveTo}
      bounds={draggable ? bounds : undefined}
      itemSize={{ width, height }}
      shiftCell={cellOwner ?? null}
      onSelectCell={onSelectCell}
    >
      {renderContent(
        item,
        style,
        width,
        height,
        selected,
        onSelect,
        onMoveTo,
        onResizeColumn,
        onResizeRow,
        selectedCell,
        onSelectCell,
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
  selected?: boolean,
  onSelect?: (id: string | null) => void,
  onMoveTo?: (id: string, top: Length, left: Length) => void,
  onResizeColumn?: (id: string, column: number, width: Length) => void,
  onResizeRow?: (id: string, row: number, height: Length) => void,
  selectedCell?: SelectedCell | null,
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void,
): ReactNode {
  switch (item.kind) {
    case 'textbox':
      return <TextboxContent item={item} style={style} width={width} height={height} />;
    case 'rectangle':
      return (
        <RectangleContent
          item={item}
          onSelect={onSelect}
          onMoveTo={onMoveTo}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
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
          onMoveTo={onMoveTo}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
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
}: {
  item: TextboxDto;
  style: StyleDto | undefined;
  width: number;
  height: number;
}): ReactNode {
  const padding = style?.padding;
  const padLeft = padding?.left ? toPx(padding.left) : 2;
  const padRight = padding?.right ? toPx(padding.right) : 2;
  const padTop = padding?.top ? toPx(padding.top) : 1;
  const padBottom = padding?.bottom ? toPx(padding.bottom) : 1;

  // Un nodo por run: el estilo (fuente, tamaño, color, negrita…) y la
  // alineación del párrafo (`TextAlign` del párrafo, como en BC) se resuelven
  // aquí; el grupo los recorta a la caja del textbox.
  const layout = layoutTextbox(
    item,
    {
      width: Math.max(width - padLeft - padRight, 0),
      height: Math.max(height - padTop - padBottom, 0),
    },
    style,
    { toPx, measure: browserTextMeasurer() },
  );

  return (
    <>
      {/* El grupo recorta el contenido; NO puede ser listening=false o el
          texto/rect no serían clicables (hit-testing de Konva). */}
      <Group clip={{ x: 0, y: 0, width, height }}>
        <Rect
          name="item-box"
          width={width}
          height={height}
          fill={paintColor(style?.backgroundColor, '#ffffff')}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
        {layout.runs.map((run) => (
          <KonvaText
            key={`${run.paragraph}-${Math.round(run.x)}-${run.y}-${run.text}`}
            name="textbox-run"
            text={run.text}
            x={padLeft + run.x}
            y={padTop + run.y}
            fontSize={run.fontSize}
            fontFamily={run.fontFamily}
            fontStyle={run.fontStyle || 'normal'}
            fill={run.fill}
            wrap="none"
            {...(run.textDecoration !== undefined ? { textDecoration: run.textDecoration } : {})}
          />
        ))}
      </Group>
    </>
  );
}

function RectangleContent({
  item,
  width,
  height,
  onSelect,
  onMoveTo,
  onResizeColumn,
  onResizeRow,
  selectedCell,
  onSelectCell,
}: {
  item: RectangleDto;
  width: number;
  height: number;
  onSelect?: (id: string | null) => void;
  onMoveTo?: (id: string, top: Length, left: Length) => void;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
}): ReactNode {
  return (
    <>
      {/* fill transparente (no undefined): sin fill, el área no es clicable. */}
      <Rect
        name="item-box"
        width={width}
        height={height}
        fill={paintColor(item.style?.backgroundColor, 'rgba(0,0,0,0)')}
        stroke="#9ca3af"
        strokeWidth={0.5}
      />
      {sortByZIndex(item.children).map((child) => (
        <ItemView
          key={child.id}
          item={child}
          onSelect={onSelect}
          onMoveTo={onMoveTo}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
          selectedCell={selectedCell}
          onSelectCell={onSelectCell}
          draggable={onMoveTo !== undefined}
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
    <Rect
      name="item-box"
      width={width}
      height={height}
      fill="rgba(0,0,0,0)"
      stroke="#f59e0b"
      dash={[6, 3]}
    />
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
      <Rect
        name="item-box"
        width={width}
        height={height}
        fill="#f9fafb"
        stroke="#9ca3af"
        dash={[4, 3]}
      />
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
  onMoveTo,
  onResizeColumn,
  onResizeRow,
  selectedCell,
  onSelectCell,
}: {
  item: TablixDto;
  selected?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveTo?: (id: string, top: Length, left: Length) => void;
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
}): ReactNode {
  const layout = tablixLayout(item);
  const totalWidth = layout.width * PX_PER_CM;
  const totalHeight = layout.height * PX_PER_CM;

  const selectCell =
    (row: number, col: number) =>
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
      if (isSecondaryClick(event)) return;
      event.cancelBubble = true;
      const evt = event.evt as MouseEvent;
      onSelectCell?.(
        { id: item.id, row, col },
        evt.shiftKey === true,
        evt.ctrlKey === true || evt.metaKey === true,
      );
    };

  const cells: ReactNode[] = layout.cells.map((cell) => {
    const cellWidth = cell.width * PX_PER_CM;
    const cellHeight = cell.height * PX_PER_CM;

    return (
      <Group key={`c${cell.row}-${cell.col}`} x={cell.x * PX_PER_CM} y={cell.y * PX_PER_CM}>
        {/* Área de la celda, **debajo** del contenido: un item anidado gana el
            click (selecciona el item); una celda vacía selecciona la celda. */}
        <Rect
          name="tablix-cell"
          width={cellWidth}
          height={cellHeight}
          fill="rgba(0,0,0,0)"
          onClick={selectCell(cell.row, cell.col)}
          onTap={selectCell(cell.row, cell.col)}
        />
        {cell.content ? (
          /* Como en RB: la celda manda. El contenido no se arrastra (está
             anclado a la celda) y se recorta a su caja. */
          <Group
            name="tablix-cell-clip"
            clip={{ x: 0, y: 0, width: cellWidth, height: cellHeight }}
          >
            <ItemView
              item={cell.content}
              onSelect={onSelect}
              onMoveTo={onMoveTo}
              onResizeColumn={onResizeColumn}
              onResizeRow={onResizeRow}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              cellOwner={{ id: item.id, row: cell.row, col: cell.col }}
              draggable={false}
            />
          </Group>
        ) : null}
      </Group>
    );
  });

  // Resaltado del rango: un único rectángulo sobre las filas/columnas elegidas.
  const columnEdges = [layout.offset.x];
  layout.columns.forEach((width) =>
    columnEdges.push((columnEdges[columnEdges.length - 1] ?? 0) + width),
  );
  const rowEdges = [layout.offset.y];
  layout.rows.forEach((height) => rowEdges.push((rowEdges[rowEdges.length - 1] ?? 0) + height));
  const range = selectedCell?.id === item.id ? cellRange(selectedCell) : null;
  const highlight = range
    ? {
        x: (columnEdges[range.col0] ?? 0) * PX_PER_CM,
        y: (rowEdges[range.row0] ?? 0) * PX_PER_CM,
        width:
          ((columnEdges[Math.min(range.col1 + 1, layout.columns.length)] ?? 0) -
            (columnEdges[range.col0] ?? 0)) *
          PX_PER_CM,
        height:
          ((rowEdges[Math.min(range.row1 + 1, layout.rows.length)] ?? 0) -
            (rowEdges[range.row0] ?? 0)) *
          PX_PER_CM,
      }
    : null;

  // Ctrl+click: celdas sueltas fuera del rectángulo (cada una con su caja).
  const extraHighlights =
    selectedCell?.id === item.id
      ? (selectedCell.extra ?? [])
          .filter((entry) => !isCellInRange(entry, selectedCell))
          .map((entry) => {
            const box = layout.cells.find(
              (cell) => cell.row === entry.row && cell.col === entry.col,
            );
            return box ? { entry, box } : null;
          })
          .filter(
            (
              value,
            ): value is {
              entry: { row: number; col: number };
              box: (typeof layout.cells)[number];
            } => value !== null,
          )
      : [];

  // Rejilla segmentada: las fronteras que cruza una celda fusionada no se
  // dibujan, así una celda con ColSpan/RowSpan se ve como una caja continua
  // (antes la línea de columna la partía en dos).
  const gridSegments = tablixGrid(item);
  const grid: ReactNode[] = [
    ...gridSegments.vertical.map((segment) => (
      <Line
        key={`v-${segment.fixed}-${segment.from}-${segment.to}`}
        name="tablix-grid"
        points={[
          segment.fixed * PX_PER_CM,
          segment.from * PX_PER_CM,
          segment.fixed * PX_PER_CM,
          segment.to * PX_PER_CM,
        ]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />
    )),
    ...gridSegments.horizontal.map((segment) => (
      <Line
        key={`h-${segment.fixed}-${segment.from}-${segment.to}`}
        name="tablix-grid"
        points={[
          segment.from * PX_PER_CM,
          segment.fixed * PX_PER_CM,
          segment.to * PX_PER_CM,
          segment.fixed * PX_PER_CM,
        ]}
        stroke="#d1d5db"
        strokeWidth={0.5}
        listening={false}
      />
    )),
  ];

  return (
    <>
      {/* Cabeceras y esquina (fuera de la rejilla): contenido ya colocado, se
          pinta como cualquier item (seleccionable; anclado a su celda). */}
      {tablixHeaderItems(item).map((header) => (
        <ItemView key={header.id} item={header} onSelect={onSelect} draggable={false} />
      ))}
      {cells}
      {/* La rejilla va encima de las celdas (los separadores se dibujan en la
          capa de selección, como los tiradores). */}
      {grid}
      {/* Resaltado del rango seleccionado (una sola figura, encima de la rejilla). */}
      {highlight ? (
        <Rect
          name="tablix-cell-highlight"
          x={highlight.x}
          y={highlight.y}
          width={highlight.width}
          height={highlight.height}
          fill="rgba(37,99,235,0.10)"
          stroke="#2563eb"
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ) : null}
      {/* Celdas añadidas con Ctrl+click (fuera del rectángulo). */}
      {extraHighlights.map(({ entry, box }) => (
        <Rect
          key={`extra-${entry.row}-${entry.col}`}
          name="tablix-cell-highlight"
          x={box.x * PX_PER_CM}
          y={box.y * PX_PER_CM}
          width={box.width * PX_PER_CM}
          height={box.height * PX_PER_CM}
          fill="rgba(37,99,235,0.10)"
          stroke="#2563eb"
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
      {/* Borde del Tablix: pincharlo selecciona la **tabla** (el interior cae
          en las celdas, como en RB). El `hitFunc` dibuja **solo un anillo**
          fino: el área de hit por defecto de un `Rect` en Konva es toda su
          superficie y la tabla se tragaría los clicks de las celdas. El anillo
          va por fuera (y 1 px dentro) para no robarle clicks al contenido. */}
      <Rect
        name="tablix-border"
        width={totalWidth}
        height={totalHeight}
        fill="rgba(0,0,0,0)"
        stroke="#9ca3af"
        strokeWidth={0.5}
        hitFunc={tablixBorderHit}
        onClick={(event) => {
          if (isSecondaryClick(event)) return;
          event.cancelBubble = true;
          onSelect?.(item.id);
        }}
        onTap={(event) => {
          if (isSecondaryClick(event)) return;
          event.cancelBubble = true;
          onSelect?.(item.id);
        }}
      />
    </>
  );
}

/**
 * Área de pinzado del borde de un Tablix: un anillo de `outside` px por fuera
 * del borde más 1 px dentro (para poder pinchar justo en la línea). Deja libre
 * todo el interior, que es de las celdas.
 */
function tablixBorderHit(context: Konva.Context, shape: Konva.Shape): void {
  const width = shape.width();
  const height = shape.height();
  const outside = 4;
  const inside = 1;
  context.beginPath();
  context.rect(-outside, -outside, width + outside * 2, outside + inside);
  context.rect(-outside, height - inside, width + outside * 2, outside + inside);
  context.rect(-outside, 0, outside + inside, height);
  context.rect(width - inside, 0, outside + inside, height);
  context.closePath();
  context.fillStrokeShape(shape);
}
