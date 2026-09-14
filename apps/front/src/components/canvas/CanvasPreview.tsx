import type {
  ItemDto,
  Length,
  ProjectionDto,
  RegionDto,
  TablixDto,
} from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Layer, Line, Rect, Stage, Text as KonvaText } from 'react-konva';
import { computeDragEnd } from '@/lib/drag';

export const PX_PER_CM = 96 / 2.54;
/** Rejilla de imán en cm (Shift la ignora al soltar). */
const SNAP_CM = 0.1;
/** Grosor de las reglas (px de pantalla, no escala con el zoom). */
const RULER_PX = 20;

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
  /** Zoom con Ctrl/Cmd + rueda. */
  onZoomChange?: (zoom: number) => void;
}

/**
 * Lienzo del diseñador. El escenario es el **papel** (A4 u otro): dentro se
 * dibujan el área imprimible (márgenes) y las bandas Encabezado/Cuerpo/Pie con
 * su tamaño real; el pie va pegado al margen inferior, como en el render.
 * Los items de cada banda (y los anidados) se seleccionan y arrastran.
 */
export function CanvasPreview({
  projection,
  zoom,
  selectedId,
  onSelect,
  onMoveItem,
  onZoomChange,
}: CanvasPreviewProps): ReactNode {
  // Dev: detector de bucles de render.
  const renders = useRef(0);
  renders.current += 1;
  if (import.meta.env.DEV && renders.current % 100 === 0) {
    console.log(`[debug] CanvasPreview renders: ${renders.current}`);
  }

  const stageRef = useRef<Konva.Stage | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // El marco de selección se mide del nodo real (funciona con anidados y celdas).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !selectedId) {
      setSelectionRect(null);
      return;
    }
    const node = stage.findOne((candidate: Konva.Node) => candidate.id() === selectedId);
    if (!node) {
      setSelectionRect(null);
      return;
    }
    setSelectionRect(node.getClientRect({ relativeTo: stage }));
  }, [selectedId, projection, zoom]);

  const sheetWidth = toPx(projection.page.width);
  const sheetHeight = toPx(projection.page.height);
  const marginLeft = toPx(projection.page.margins.left);
  const marginRight = toPx(projection.page.margins.right);
  const marginTop = toPx(projection.page.margins.top);
  const marginBottom = toPx(projection.page.margins.bottom);
  // El report no tiene por qué medir el papel completo: manda el ancho de sección.
  const reportWidth = Math.max(
    toPx(projection.page.header.width),
    toPx(projection.page.body.width),
    toPx(projection.page.footer.width),
  );

  const headerHeight = toPx(projection.page.header.height);
  const bodyHeight = toPx(projection.page.body.height);
  const footerHeight = toPx(projection.page.footer.height);

  /**
   * Posición de cada banda sobre el papel:
   * encabezado arriba (margen superior), cuerpo debajo y pie pegado al margen
   * inferior (como en el render real/Report Builder).
   */
  const bands: { key: string; region: RegionDto; x: number; y: number; visible: boolean }[] = [
    {
      key: 'header',
      region: projection.page.header,
      x: marginLeft,
      y: marginTop,
      visible: fingerprint(projection.page.header),
    },
    {
      key: 'body',
      region: projection.page.body,
      x: marginLeft,
      y: marginTop + headerHeight,
      visible: true,
    },
    {
      key: 'footer',
      region: projection.page.footer,
      x: marginLeft,
      y: Math.max(marginTop + headerHeight, sheetHeight - marginBottom - footerHeight),
      visible: fingerprint(projection.page.footer),
    },
  ];
  const visibleBands = bands.filter((band) => band.visible);

  const stageWidth = sheetWidth * zoom;
  const stageHeight = sheetHeight * zoom;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
      <div
        className="relative"
        style={{ width: RULER_PX + stageWidth, height: RULER_PX + stageHeight }}
      >
        {/* Esquina de las reglas */}
        <div
          className="absolute left-0 top-0 border-b border-r bg-muted"
          style={{ width: RULER_PX, height: RULER_PX }}
        />
        <Ruler orientation="horizontal" zoom={zoom} lengthPx={stageWidth} />
        <Ruler orientation="vertical" zoom={zoom} lengthPx={stageHeight} />

        <div className="absolute" style={{ left: RULER_PX, top: RULER_PX }}>
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            scaleX={zoom}
            scaleY={zoom}
            style={{ background: '#e5e7eb' }}
            onClick={(event) => {
              // Click en vacío = deseleccionar (los items cortan la propagación).
              if (event.target === event.target.getStage()) onSelect?.(null);
            }}
            onWheel={(event) => {
              if (!onZoomChange) return;
              const { ctrlKey, metaKey, deltaY } = event.evt;
              if (!ctrlKey && !metaKey) return; // rueda normal = scroll
              // En Electron, sin preventDefault Chromium haría zoom de toda la app.
              event.evt.preventDefault();
              const factor = deltaY > 0 ? 1 / 1.1 : 1.1;
              onZoomChange(Math.min(2, Math.max(0.2, Number((zoom * factor).toFixed(3)))));
            }}
          >
            <Layer>
              {/* Papel (A4). */}
              <Rect
                x={0}
                y={0}
                width={sheetWidth}
                height={sheetHeight}
                fill="#ffffff"
                stroke="#d1d5db"
                strokeScaleEnabled={false}
                shadowColor="rgba(0,0,0,0.15)"
                shadowBlur={6}
                shadowOffsetY={2}
                listening={false}
              />
              {/* Área imprimible (márgenes). */}
              <Rect
                x={marginLeft}
                y={marginTop}
                width={Math.max(sheetWidth - marginLeft - marginRight, 0)}
                height={Math.max(sheetHeight - marginTop - marginBottom, 0)}
                stroke="#e5e7eb"
                dash={[6, 4]}
                strokeScaleEnabled={false}
                fillEnabled={false}
                listening={false}
              />
              {visibleBands.map((band) => (
                <Group key={band.key} x={band.x} y={band.y}>
                  {/* Caja de la banda (tamaño real de encabezado/cuerpo/pie). */}
                  <Rect
                    width={reportWidth}
                    height={toPx(band.region.height)}
                    stroke="#e5e7eb"
                    strokeScaleEnabled={false}
                    fillEnabled={false}
                    listening={false}
                  />
                  {band.region.items.map((item) => (
                    <ItemView
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      draggable={onMoveItem !== undefined}
                      onSelect={onSelect}
                      onMoveItem={onMoveItem}
                      bounds={{ width: reportWidth, height: toPx(band.region.height) }}
                    />
                  ))}
                </Group>
              ))}
            </Layer>

            {/* Selección: capa superior para que ningún elemento la tape. */}
            <Layer listening={false}>
              {selectionRect ? (
                <>
                  <Rect
                    x={selectionRect.x}
                    y={selectionRect.y}
                    width={selectionRect.width}
                    height={selectionRect.height}
                    stroke="#2563eb"
                    strokeWidth={2}
                    dash={[6, 3]}
                    strokeScaleEnabled={false}
                    fillEnabled={false}
                  />
                  {cornerPoints(selectionRect).map(([hx, hy], index) => (
                    <Rect
                      key={index}
                      x={hx - 4 / zoom}
                      y={hy - 4 / zoom}
                      width={8 / zoom}
                      height={8 / zoom}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={1 / zoom}
                    />
                  ))}
                </>
              ) : null}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- reglas --------------------------------- */

function Ruler({
  orientation,
  zoom,
  lengthPx,
}: {
  orientation: 'horizontal' | 'vertical';
  zoom: number;
  lengthPx: number;
}): ReactNode {
  const cmPx = PX_PER_CM * zoom;
  const maxCm = lengthPx / cmPx;

  // Milímetro a milímetro; el texto (en negrita) se agrupa si el zoom es bajo
  // para que no se solapen las etiquetas.
  const tickStep = 0.1;
  const labelStep = zoom >= 0.5 ? 1 : zoom >= 0.3 ? 2 : 5;

  const ticks: ReactNode[] = [];
  const count = Math.floor(maxCm / tickStep + 1e-9);

  for (let index = 0; index <= count; index += 1) {
    const cm = index * tickStep;
    const offset = cm * cmPx;
    const isLabel = isMultiple(cm, labelStep);
    const isCm = isMultiple(cm, 1);

    // Longitud de la marca: etiqueta > centímetro > milímetro.
    const ratio = isLabel ? 1 : isCm ? 0.75 : 0.35;
    const thickness = 1;
    const style = {
      ...(orientation === 'horizontal'
        ? {
            left: offset,
            top: RULER_PX * (1 - ratio),
            height: RULER_PX * ratio,
            width: thickness,
          }
        : {
            top: offset,
            left: RULER_PX * (1 - ratio),
            width: RULER_PX * ratio,
            height: thickness,
          }),
      backgroundColor: isCm ? 'var(--muted-foreground)' : 'var(--border)',
    } as const;

    ticks.push(<div key={`t${index}`} className="absolute" style={style} />);

    if (isLabel && index > 0) {
      ticks.push(
        <span
          key={`l${index}`}
          className="absolute select-none text-[9px] font-semibold leading-none text-foreground"
          style={
            orientation === 'horizontal'
              ? { left: offset + 2, top: 1 }
              : { top: offset + 2, left: 1 }
          }
        >
          {formatCm(cm, labelStep)}
        </span>,
      );
    }
  }

  return (
    <div
      className="absolute border-b border-r bg-muted"
      style={
        orientation === 'horizontal'
          ? { left: RULER_PX, top: 0, width: lengthPx, height: RULER_PX }
          : { left: 0, top: RULER_PX, width: RULER_PX, height: lengthPx }
      }
    >
      {ticks}
    </div>
  );
}

function isMultiple(value: number, step: number): boolean {
  return Math.abs(value / step - Math.round(value / step)) < 1e-6;
}

function formatCm(value: number, step: number): string {
  if (step < 1) return value.toFixed(1);
  return String(Math.round(value));
}

/* ------------------------------- items ---------------------------------- */

function fingerprint(region: RegionDto): boolean {
  return toPx(region.height) > 0 || region.items.length > 0;
}

/** Nodo Konva mínimo que necesitamos para el clamp (evita tipar el árbol entero). */
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
  const dragState = useRef<{ pointerX: number; pointerY: number; nodeX: number; nodeY: number } | null>(
    null,
  );

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
      {renderContent(item, width, height, fontSize, fontStyle, onSelect, onMoveItem)}
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
  onMoveItem?: (id: string, top: Length, left: Length) => void,
): ReactNode {
  switch (item.kind) {
    case 'textbox': {
      const text = item.paragraphs
        .map((paragraph) => paragraph.runs.map(runDisplayText).join(''))
        .join('\n');
      const padding = item.style?.padding;
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
              fill={item.style?.backgroundColor ?? '#ffffff'}
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
              fontFamily={item.style?.fontFamily ?? 'Segoe UI'}
              fill={item.style?.color ?? '#111827'}
              align={(item.style?.textAlign ?? 'Left').toLowerCase() as 'left' | 'center' | 'right'}
              verticalAlign={
                (item.style?.verticalAlign ?? 'Top').toLowerCase() as 'top' | 'middle' | 'bottom'
              }
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
            <ItemView
              key={child.id}
              item={child}
              onSelect={onSelect}
              onMoveItem={onMoveItem}
              draggable={onMoveItem !== undefined}
              /* Sin bounds: el contenedor no es un límite duro en RDL. */
            />
          ))}
        </>
      );

    case 'line':
      return <Line points={[0, 0, width, height]} stroke="#111827" hitStrokeWidth={8} />;

    case 'image':
      return <ImagePlaceholder width={width} height={height} source={item.source} />;

    case 'tablix':
      return <TablixContent item={item} onSelect={onSelect} onMoveItem={onMoveItem} />;

    case 'unknown':
      return (
        <Rect width={width} height={height} fill="rgba(0,0,0,0)" stroke="#f59e0b" dash={[6, 3]} />
      );
  }
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

function TablixContent({  item,
  onSelect,
  onMoveItem,
}: {
  item: TablixDto;
  onSelect?: (id: string | null) => void;
  onMoveItem?: (id: string, top: Length, left: Length) => void;
}): ReactNode {
  const columns = item.body.columns.map(toPx);
  const rows = item.body.rows.map((row) => toPx(row.height));
  const totalWidth = columns.reduce((acc, value) => acc + value, 0);
  const totalHeight = rows.reduce((acc, value) => acc + value, 0);

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
  item.body.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, colIndex) => {
      if (cell?.content) {
        const colSpan = cell.colSpan ?? 1;
        const rowSpan = cell.rowSpan ?? 1;
        const cellWidth = columns
          .slice(colIndex, colIndex + colSpan)
          .reduce((acc, value) => acc + value, 0);
        const cellHeight = rows
          .slice(rowIndex, rowIndex + rowSpan)
          .reduce((acc, value) => acc + value, 0);
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
              draggable={onMoveItem !== undefined}
              /* Sin bounds: el contenido de una celda puede desbordarla. */
            />
          </Group>,
        );
      }
    });
  });

  return (
    <>
      <Rect width={totalWidth} height={totalHeight} stroke="#9ca3af" strokeWidth={0.5} />
      {grid}
      {cells}
    </>
  );
}

function cornerPoints(rect: { x: number; y: number; width: number; height: number }): [number, number][] {
  return [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Texto visible de un run en el diseñador: si trae `<Label>` (BC/RB lo usan
 * como etiqueta de diseñador) se muestra entre corchetes, como Report Builder;
 * si no, el propio valor (texto plano o `=expresión`).
 */
function runDisplayText(run: { value: string; label?: string }): string {
  return run.label !== undefined ? `[${run.label}]` : run.value;
}
