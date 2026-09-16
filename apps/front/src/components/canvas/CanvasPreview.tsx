import type { ItemDto, Length, NewItemSpec, ProjectionDto, ScopeRef } from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Stage } from 'react-konva';
import { ITEM_DRAG_TYPE } from '@/lib/dragTypes';
import type { CanvasHit } from '@/lib/hit';
import { hitTestItems } from '@/lib/hit';
import { cm, findItemInList, isCellContent, toCm } from '@/lib/projection';import { Paper } from './Paper';
import { Ruler } from './Ruler';
import { SelectionFrame } from './SelectionFrame';
import { bandAt, paperLayout } from './bands';
import { clamp, PX_PER_CM, RULER_PX, toPx } from './geometry';

/** Scope del contrato para cada banda del papel. */
function scopeOfBand(key: string): ScopeRef {
  if (key === 'header') return { kind: 'pageHeader' };
  if (key === 'footer') return { kind: 'pageFooter' };
  return { kind: 'body' };
}

export interface CanvasPreviewProps {
  projection: ProjectionDto;
  zoom: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Se llama al soltar un drag con la posición ya normalizada (cm). */
  onMoveItem?: (id: string, top: Length, left: Length) => void;
  /** Se llama al soltar un tirador con la caja normalizada (cm). */
  onResizeItem?: (id: string, box: { top: Length; left: Length; width: Length; height: Length }) => void;
  /** Redimensionar una columna/fila de la rejilla (separadores internos). */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  /** Zoom con Ctrl/Cmd + rueda. */
  onZoomChange?: (zoom: number) => void;
  /** Click derecho sobre el lienzo: el item/contenedor bajo el cursor. */
  onContextMenuHit?: (hit: CanvasHit) => void;
  /** Un item de la toolbox soltado en el lienzo. */
  onDropItem?: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  /** Petición de llevar un elemento a la vista (paleta Ctrl+K). */
  reveal?: { id: string; nonce: number } | null;
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
  onResizeItem,
  onResizeColumn,
  onResizeRow,
  onZoomChange,
  onContextMenuHit,
  onDropItem,
  reveal,
}: CanvasPreviewProps): ReactNode {
  // Dev: detector de bucles de render (cuenta renders confirmados, tras pintar).
  const renders = useRef(0);
  useEffect(() => {
    renders.current += 1;
    if (import.meta.env.DEV && renders.current % 100 === 0) {
      console.log(`[debug] CanvasPreview renders: ${renders.current}`);
    }
  });

  const stageRef = useRef<Konva.Stage | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // El propio stage, para que los guiones de QA puedan consultar
  // `getIntersection` (hit-test de Konva, no del dominio).
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as Window & { __rdlcStage?: Konva.Stage | null }).__rdlcStage = stageRef.current;
    }
  }, []);

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
    const rect = node.getClientRect({ relativeTo: stage });
    setSelectionRect(rect);

    // QA/diagnóstico (solo dev): permite a los guiones de captura saber dónde
    // están los tiradores, el primer separador de la rejilla y comprobar un
    // arrastre real.
    if (import.meta.env.DEV) {
      (
        window as Window & {
          __rdlcSelection?: { rect: typeof rect; zoom: number } | null;
        }
      ).__rdlcSelection = { rect, zoom };

      const separator = stage.findOne((candidate: Konva.Node) => candidate.name() === 'separator');
      const points = (separator?.getAttr('points') as number[] | undefined) ?? [];
      if (separator && points.length >= 4) {
        const absolute = separator
          .getAbsoluteTransform()
          .point({ x: points[0] ?? 0, y: ((points[3] ?? 0) + (points[1] ?? 0)) / 2 });
        const container = stage.container().getBoundingClientRect();
        (
          window as Window & { __rdlcTablixSeparator?: { x: number; y: number } | null }
        ).__rdlcTablixSeparator = {
          x: container.left + absolute.x,
          y: container.top + absolute.y,
        };
      }
    }
  }, [selectedId, projection, zoom]);

  const layout = paperLayout(projection);
  const visibleBands = layout.bands.filter((band) => band.visible);

  /**
   * Caja del item seleccionado (cm) y límites de su banda, para los tiradores.
   * Un Tablix no tiene caja propia: manda la **rejilla** (suma de columnas y
   * filas), que es lo que se redimensiona. Los items desconocidos no se tocan.
   */
  const selectedFrame = useMemo(() => {
    if (!selectedId) return undefined;
    // El contenido directo de una celda no se redimensiona: manda la celda.
    if (hideHandles(projection, selectedId)) return { box: undefined, bounds: undefined };
    for (const band of layout.bands) {
      const item = findItemInList(band.region.items, selectedId);
      if (!item) continue;
      const isDirectChild = band.region.items.some((candidate) => candidate.id === selectedId);
      const bounds = isDirectChild
        ? { width: toCm(band.region.width), height: toCm(band.region.height) }
        : undefined;

      if (item.kind === 'unknown') return { box: undefined, bounds };
      if (item.kind === 'tablix') {
        const columns = item.body.columns.reduce((acc, column) => acc + toCm(column), 0);
        const rows = item.body.rows.reduce((acc, row) => acc + toCm(row.height), 0);
        return {
          box: {
            top: toCm(item.top),
            left: toCm(item.left),
            width: round4(columns),
            height: round4(rows),
          },
          bounds,
          grid: { columns: item.body.columns, rows: item.body.rows.map((row) => row.height) },
        };
      }

      return {
        box: {
          top: toCm(item.top),
          left: toCm(item.left),
          width: toCm(item.width),
          height: toCm(item.height),
        },
        bounds,
      };
    }
    return undefined;
  }, [layout, projection, selectedId]);

  const stageWidth = layout.sheetWidth * zoom;
  const stageHeight = layout.sheetHeight * zoom;

  // Bandas actuales en un ref: el efecto de "traer a la vista" no debe
  // re-ejecutarse en cada render (las bandas son un array nuevo cada vez).
  const bandsRef = useRef(visibleBands);
  useEffect(() => {
    bandsRef.current = visibleBands;
  });

  // Trae a la vista el elemento pedido (paleta Ctrl+K) con un margen cómodo.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !reveal) return;

    for (const band of bandsRef.current) {
      const item = findItemInList(band.region.items, reveal.id);
      if (!item) continue;

      const x = RULER_PX + (band.x + toPx(item.left)) * zoom;
      const y = RULER_PX + (band.y + toPx(item.top)) * zoom;
      container.scrollTo({
        left: Math.max(0, x - 120),
        top: Math.max(0, y - 120),
        behavior: 'smooth',
      });
      return;
    }
  }, [reveal, zoom]);

  /**
   * Traduce un evento del DOM (drop, click derecho) a `CanvasHit`: px de
   * pantalla → px de papel (÷ zoom) → banda → cm relativos a la banda.
   * Fuera de las bandas cae al cuerpo (el backend acaba de normalizar).
   */
  const hitAt = (event: { clientX: number; clientY: number }): CanvasHit | undefined => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const rect = stage.container().getBoundingClientRect();
    const contentX = (event.clientX - rect.left) / zoom;
    const contentY = (event.clientY - rect.top) / zoom;
    if (contentX < 0 || contentY < 0 || contentX > layout.sheetWidth || contentY > layout.sheetHeight) {
      return undefined;
    }

    const band = bandAt(layout, contentX, contentY);
    if (!band) return undefined;

    const point = {
      x: clamp((contentX - band.x) / PX_PER_CM, 0, toCm(band.region.width)),
      y: clamp((contentY - band.y) / PX_PER_CM, 0, toCm(band.region.height)),
    };
    return hitTestItems(band.region.items, point, scopeOfBand(band.key));
  };

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6"
      onContextMenu={(event) => {
        const hit = hitAt(event);
        if (hit) onContextMenuHit?.(hit);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
        // Sin preventDefault el navegador no permite soltar aquí.
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        const kind = event.dataTransfer.getData(ITEM_DRAG_TYPE);
        if (!kind || !onDropItem) return;
        event.preventDefault();
        const hit = hitAt(event);
        if (hit) onDropItem(kind as NewItemSpec['kind'], hit);
      }}
    >
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
            <Paper
              layout={layout}
              selectedId={selectedId}
              onSelect={onSelect}
              onMoveItem={onMoveItem}
              onResizeColumn={onResizeColumn}
              onResizeRow={onResizeRow}
              draggable={onMoveItem !== undefined}
            />

            <SelectionFrame
              rect={selectionRect}
              zoom={zoom}
              {...(selectedFrame?.box ? { box: selectedFrame.box } : {})}
              {...(selectedFrame?.bounds ? { bounds: selectedFrame.bounds } : {})}
              {...(selectedFrame && 'grid' in selectedFrame && selectedFrame.grid
                ? {
                    grid: selectedFrame.grid,
                    ...(onResizeColumn
                      ? { onResizeColumn: (column: number, width: Length) => onResizeColumn(selectedId!, column, width) }
                      : {}),
                    ...(onResizeRow
                      ? { onResizeRow: (row: number, height: Length) => onResizeRow(selectedId!, row, height) }
                      : {}),
                  }
                : {})}
              {...(onResizeItem && selectedId
                ? {
                    onResize: (box: { top: number; left: number; width: number; height: number }) =>
                      onResizeItem(selectedId, {
                        top: cm(box.top),
                        left: cm(box.left),
                        width: cm(box.width),
                        height: cm(box.height),
                      }),
                  }
                : {})}
            />
          </Stage>
        </div>
      </div>
    </div>
  );
}

/** Caja por la que se mide el marco: el item y si es contenido de una celda. */
function hideHandles(projection: ProjectionDto, id: string): boolean {
  return isCellContent(projection, id);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
