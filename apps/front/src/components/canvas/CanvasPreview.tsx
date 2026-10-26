import type {
  BatchableCommand,
  Length,
  NewItemSpec,
  PageMarginsDto,
  ProjectionDto,
  ScopeRef,
} from '@rdlc-designer/contracts';
import type Konva from 'konva';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import type { Translator } from '@rdlc-designer/i18n';
import { useT } from '@rdlc-designer/i18n/react';
import { ITEM_DRAG_TYPE, type DropInfo } from '@/lib/dragTypes';
import type { CanvasHit } from '@/lib/hit';
import { pageRulerSegments } from '@/lib/pageResize';
import { type SelectedCell } from '@/lib/tablix';
import { PageResizePreview, PageResizeZones, type PageRegion } from './PageResizeLayer';
import { Paper } from './Paper';
import { Ruler, type RulerMark } from './Ruler';
import { SelectionFrame } from './SelectionFrame';
import { computeSelectedFrame, selectionFrameProps, tablixChromeHitAt } from './canvasFrame';
import { hitAtEvent } from './canvasHit';
import { TextEditContext } from './textEditContext';
import { useCanvasA11y } from './useCanvasA11y';
import { useCanvasViewport } from './useCanvasViewport';
import { useGroupSelection } from './useGroupSelection';
import { useMarqueeSelection } from './useMarqueeSelection';
import { useMoveEnd } from './useMoveEnd';
import { usePageResize } from './usePageResize';
import { useRevealItem } from './useRevealItem';
import { measureSelection, useSelectionMeasure } from './useSelectionMeasure';
import { useWheelZoom } from './useWheelZoom';
import { RULER_PX } from './geometry';

export interface CanvasPreviewProps {
  projection: ProjectionDto;
  zoom: number;
  selectedId?: string | null;
  /** Items adicionales de la multiselección (U3): se dibujan con marco discontinuo. */
  extraSelectedIds?: string[];
  onSelect?: (id: string | null, additive?: boolean) => void;
  /**
   * Marco de selección (arrastrar en vacío): ids de los items que intersectan
   * la caja. El padre los adopta como multiselección.
   */
  onSelectMany?: (ids: string[]) => void;
  /** Se llama al soltar un drag con la posición ya normalizada (cm). */
  onMoveTo?: (id: string, top: Length, left: Length, drop?: DropInfo) => void;
  /** Mueve varios items a la vez (multiselección arrastrada): un solo paso de undo. */
  onMoveMany?: (moves: { id: string; top: Length; left: Length }[]) => void;
  /** El drag terminó sobre otro contenedor: reparentar (`moveItem`). */
  onMoveItemToScope?: (
    id: string,
    scope: ScopeRef,
    index: number,
    top: Length,
    left: Length,
  ) => void;
  /** Se llama al soltar un tirador con la caja normalizada (cm). */
  onResizeItem?: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  /**
   * Multiselección: los tiradores del bloque envían la escala de todos los
   * miembros en un `batch` (un solo paso de undo).
   */
  onResizeMany?: (commands: BatchableCommand[]) => void;
  /** Redimensionar una columna/fila de la rejilla (separadores internos). */
  onResizeColumn?: (id: string, column: number, width: Length) => void;
  onResizeRow?: (id: string, row: number, height: Length) => void;
  /** U10: alto de una banda de página al arrastrar su borde (cm). */
  onResizeRegion?: (region: PageRegion, cm: number) => void;
  /** U10: ancho de la sección del informe (`ReportSection > Width`, cm). */
  onResizeSectionWidth?: (cm: number) => void;
  /** U10: márgenes al arrastrar los marcadores de la regla. */
  onSetPageMargins?: (margins: PageMarginsDto) => void;
  /** Celda de Tablix seleccionada (F2 parte 3). */
  selectedCell?: SelectedCell | null;
  onSelectCell?: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  /** Zoom con Ctrl/Cmd + rueda. */
  onZoomChange?: (zoom: number) => void;
  /**
   * Publica el zoom de «ajustar al ancho» calculado del hueco real del lienzo.
   * El padre lo guarda en un ref: no re-renderiza en cada resize.
   */
  onFitZoomChange?: (zoom: number) => void;
  /**
   * Click derecho sobre el lienzo: el item/contenedor bajo el cursor; `null`
   * si el punto cae fuera del papel o de las bandas (el menú muestra entonces
   * las acciones de la selección, sin Insertar/Pegar).
   */
  onContextMenuHit?: (hit: CanvasHit | null) => void;
  /** Un item de la toolbox soltado en el lienzo. */
  onDropItem?: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  /** Abre el editor de texto de un textbox (doble clic, Enter, F2). */
  onEditText?: (id: string) => void;
  /** Petición de llevar un elemento a la vista (paleta Ctrl+K). */
  reveal?: { id: string; nonce: number } | null;
  /** Stage real del lienzo (benchmark/QA): permite mover nodos sin re-render. */
  stageRef?: RefObject<Konva.Stage | null>;
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
  extraSelectedIds = [],
  onSelect,
  onSelectMany,
  onMoveTo,
  onMoveItemToScope,
  onResizeItem,
  onResizeMany,
  onResizeColumn,
  onResizeRow,
  onResizeRegion,
  onResizeSectionWidth,
  onSetPageMargins,
  selectedCell,
  onSelectCell,
  onZoomChange,
  onFitZoomChange,
  onContextMenuHit,
  onDropItem,
  onMoveMany,
  onEditText,
  reveal,
  stageRef: stageRefProp,
}: CanvasPreviewProps): ReactNode {
  const t = useT();
  const localStageRef = useRef<Konva.Stage | null>(null);
  const stageRef = stageRefProp ?? localStageRef;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* ----------------------- marco de selección (U3) ------------------------ */
  const {
    marqueeRef,
    handlers: marqueeHandlers,
    suppressClickRef,
  } = useMarqueeSelection({ stageRef, projection, onSelectMany });

  // El marco se mide del nodo real (con anidados y celdas) y publica el QA.
  const selectionRect = useSelectionMeasure({
    stageRef,
    selectedId,
    selectedCell,
    projection,
    zoom,
  });

  // Antes que el viewport: al confirmar el zoom, su efecto corrige el scroll y el
  // del viewport (`useVisibleRect`) mide ya la posición final, sin parpadeo.
  const { paperRef, handleWheel } = useWheelZoom({ zoom, onZoomChange, scrollRef });

  const { layout, visibleBands, cull, stageWindow } = useCanvasViewport({
    projection,
    zoom,
    scrollRef,
    stageRef,
    onFitZoomChange,
  });

  /** Qué elemento mide el marco: el item seleccionado o el Tablix de la celda. */
  const frameId = selectedId ?? selectedCell?.id ?? null;

  const selectedFrame = useMemo(
    () => computeSelectedFrame(projection, layout, frameId),
    [layout, projection, frameId],
  );

  // Selección de celdas del Tablix medido (para cabeceras y resaltado).
  const selectionForFrame = selectedCell && selectedCell.id === frameId ? selectedCell : null;

  // Multiselección: redimensionar el bloque entero.
  const group = useGroupSelection({
    stageRef,
    projection,
    zoom,
    selectedId,
    extraSelectedIds,
  });

  const frameProps = selectionFrameProps({
    rect: selectionRect,
    zoom,
    frameId,
    selectedId,
    selectedFrame,
    selection: selectionForFrame,
    group,
    ...(onResizeColumn ? { onResizeColumn } : {}),
    ...(onResizeRow ? { onResizeRow } : {}),
    ...(onResizeItem ? { onResizeItem } : {}),
    ...(onResizeMany ? { onResizeMany } : {}),
    ...(onSelectCell ? { onSelectCell } : {}),
  });

  /** Tamaño del papel en px de pantalla (el stage solo cubre la ventana). */
  const paperWidth = layout.sheetWidth * zoom;
  const paperHeight = layout.sheetHeight * zoom;

  /* --------------------- redimensionado de página (U10) ------------------- */

  const { pageResizeRef, rulerMarks, sectionMinCm, bandMinCm } = usePageResize({
    projection,
    onSetPageMargins,
  });

  /**
   * Marcos discontinuos de los **demás** items de la multiselección: se miden
   * del nodo Konva real (como el marco principal) para que acompañen al zoom y
   * al scroll sin recalcular la geometría de contenedores anidados.
   */
  const extraKey = extraSelectedIds.join('|');
  // El arrastre de un miembro de la multiselección mueve a todos: los nodos lo
  // consultan en el stage (sin pasar la lista por todo el árbol de items).
  useEffect(() => {
    stageRef.current?.setAttr(
      'rdlcSelection',
      [selectedId, ...extraSelectedIds].filter((value): value is string => !!value),
    );
  }, [selectedId, extraKey]);

  const handleMoveEnd = useMoveEnd({
    stageRef,
    projection,
    zoom,
    layout,
    selectedId,
    extraSelectedIds,
    onMoveTo,
    onMoveMany,
    onMoveItemToScope,
  });

  const revealItem = useRevealItem({ scrollRef, bands: visibleBands, reveal, zoom });
  const { itemCount, descriptionId, liveMessage, handleKeyDown, handleFocus } = useCanvasA11y({
    projection,
    selectedId,
    onSelect,
    onEditText,
    revealItem,
  });

  // Click derecho sobre el «chrome» del marco de un Tablix: manda la tabla.
  const tablixChromeHit = (event: { clientX: number; clientY: number }): CanvasHit | undefined =>
    tablixChromeHitAt({
      stage: stageRef.current,
      projection,
      zoom,
      frameId,
      rect: selectionRect,
      selectedFrame,
      event,
    });

  return (
    <TextEditContext.Provider value={onEditText ?? null}>
      <div
        ref={scrollRef}
        id="lienzo"
        className="canvas-dots flex min-h-0 flex-1 items-start justify-center overflow-auto p-6"
        tabIndex={0}
        role="group"
        aria-label={pageLabel(itemCount, t)}
        aria-describedby={descriptionId}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onContextMenu={(event) => {
          const stage = stageRef.current;
          if (!stage) return;
          // El «chrome» del marco (cabeceras/esquina) y el borde de la tabla
          // mandan sobre celdas y contenido: así el click derecho ofrece las
          // acciones de la tabla, como el click izquierdo la selecciona. Fuera
          // del papel no hay hit (`null`): el menú queda con la selección.
          const hit =
            tablixChromeHit(event) ??
            hitAtEvent(stage, zoom, layout, event, { tablixBorder: true });
          onContextMenuHit?.(hit ?? null);
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
          const stage = stageRef.current;
          const hit = stage ? hitAtEvent(stage, zoom, layout, event) : undefined;
          if (hit) onDropItem(kind as NewItemSpec['kind'], hit);
        }}
      >
        <span id={descriptionId} className="sr-only">
          {t('canvas.a11y.keyboardHelp')}
        </span>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>
        <div
          ref={paperRef}
          className="relative"
          style={{ width: RULER_PX + paperWidth, height: RULER_PX + paperHeight }}
        >
          <CanvasRulers
            projection={projection}
            zoom={zoom}
            widthPx={paperWidth}
            heightPx={paperHeight}
            rulerMarks={rulerMarks}
          />

          {/* Cámara (T4): el stage ocupa solo la ventana visible del papel y
              desplaza el contenido a su origen (`x`/`y`). El canvas, así, mide
              el hueco y no `papel × zoom`. */}
          <div
            className="absolute"
            style={{
              left: RULER_PX + stageWindow.x * zoom,
              top: RULER_PX + stageWindow.y * zoom,
            }}
          >
            <Stage
              ref={stageRef}
              width={stageWindow.width * zoom}
              height={stageWindow.height * zoom}
              x={-stageWindow.x * zoom}
              y={-stageWindow.y * zoom}
              scaleX={zoom}
              scaleY={zoom}
              style={{ background: '#dcdce2' }}
              onMouseDown={marqueeHandlers.onMouseDown}
              onMouseMove={marqueeHandlers.onMouseMove}
              onMouseUp={marqueeHandlers.onMouseUp}
              onClick={(event) => {
                // Tras un marco, el click sintético no debe limpiar la selección.
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                // Click en vacío = deseleccionar (los items cortan la propagación).
                if (event.target === event.target.getStage()) onSelect?.(null);
              }}
              onWheel={handleWheel}
            >
              {/* Dos capas (cada `Layer` es un canvas del tamaño de la ventana):
                  contenido (zonas de página **bajo** el papel, para que el
                  contenido gane el clic, y el papel) y superposiciones. Las
                  superposiciones se redibujan sin tocar el contenido. */}
              <Layer>
                <PageResizeZones
                  layout={layout}
                  zoom={zoom}
                  onResizeRegion={onResizeRegion}
                  onResizeSectionWidth={onResizeSectionWidth}
                  sectionMinCm={sectionMinCm}
                  bandMinCm={bandMinCm}
                  onPreview={(orientation, position, label) =>
                    pageResizeRef.current?.showPreview(orientation, position, label)
                  }
                  onPreviewEnd={() => pageResizeRef.current?.hidePreview()}
                />

                <Paper
                  layout={layout}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onMoveTo={handleMoveEnd}
                  onResizeColumn={onResizeColumn}
                  onResizeRow={onResizeRow}
                  selectedCell={selectedCell}
                  onSelectCell={onSelectCell}
                  draggable={onMoveTo !== undefined}
                  cull={cull}
                />
              </Layer>

              <Layer>
                <SelectionFrame {...frameProps} />
                <ExtraSelectionFrames stageRef={stageRef} ids={extraKey} revision={projection} />
                {/* Previsualización de página por encima del contenido. */}
                <PageResizePreview ref={pageResizeRef} layout={layout} zoom={zoom} />
                {/* Marco de selección (arrastrar en vacío). */}
                <Rect
                  ref={marqueeRef}
                  name="marquee-rect"
                  visible={false}
                  listening={false}
                  stroke="#2563eb"
                  fill="rgba(37,99,235,0.08)"
                  strokeWidth={1}
                  dash={[4, 3]}
                  strokeScaleEnabled={false}
                />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </TextEditContext.Provider>
  );
}

/* ------------------------------- helpers -------------------------------- */

/** Esquina y reglas del lienzo: marcadores de margen y tramos de página. */
function CanvasRulers({
  projection,
  zoom,
  widthPx,
  heightPx,
  rulerMarks,
}: {
  projection: ProjectionDto;
  zoom: number;
  /** Tamaño del papel en px de pantalla (la regla lo recorre entero). */
  widthPx: number;
  heightPx: number;
  rulerMarks: (axis: 'x' | 'y') => RulerMark[];
}): ReactNode {
  const t = useT();
  return (
    <>
      {/* Esquina de las reglas */}
      <div
        className="absolute left-0 top-0 border-b border-r bg-muted"
        style={{ width: RULER_PX, height: RULER_PX }}
      />
      <Ruler
        orientation="horizontal"
        zoom={zoom}
        lengthPx={widthPx}
        marks={rulerMarks('x')}
        segments={pageRulerSegments(projection.page, 'x', t)}
      />
      <Ruler
        orientation="vertical"
        zoom={zoom}
        lengthPx={heightPx}
        marks={rulerMarks('y')}
        segments={pageRulerSegments(projection.page, 'y', t)}
      />
    </>
  );
}

/**
 * Marcos discontinuos de la **multiselección** (U3): se miden del nodo Konva
 * real y se pintan por refs (sin estado de React) para no re-renderizar el
 * stage ni caer en bucles de efecto.
 */
function ExtraSelectionFrames({
  stageRef,
  ids,
  revision,
}: {
  stageRef: RefObject<Konva.Stage | null>;
  /** Ids separados por `|` (una sola prop estable). */
  ids: string;
  /** Cambia con la proyección: fuerza una remedición cuando algo se mueve. */
  revision: unknown;
}): ReactNode {
  const rectsRef = useRef(new Map<string, Konva.Rect>());
  const groupRef = useRef<Konva.Group | null>(null);
  const list = ids.length > 0 ? ids.split('|') : [];

  useEffect(() => {
    const stage = stageRef.current;
    const group = groupRef.current;
    if (!stage || !group) return;
    const wanted = new Set(ids.length > 0 ? ids.split('|') : []);
    for (const [id, rect] of rectsRef.current) {
      const measured = wanted.has(id) ? measureSelection(stage, id) : null;
      if (measured) rect.setAttrs({ ...measured, visible: true });
      else rect.visible(false);
    }
    group.getLayer()?.batchDraw();
    // `ids`/`revision` son las señales de cambios en la selección o el dibujo.
  }, [ids, revision, stageRef]);

  if (list.length === 0) return null;
  return (
    <Group ref={groupRef} listening={false}>
      {list.map((id) => (
        <Rect
          key={id}
          ref={(node) => {
            if (node) rectsRef.current.set(id, node);
            else rectsRef.current.delete(id);
          }}
          stroke="#2563eb"
          strokeWidth={1.5}
          dash={[5, 4]}
          strokeScaleEnabled={false}
          visible={false}
        />
      ))}
    </Group>
  );
}

/**
 * Etiqueta accesible del grupo: «Página del informe, 3 elementos» (plural ICU).
 * Helper puro: el traductor entra por parámetro, como en `canvasA11y`.
 */
function pageLabel(count: number, t: Translator['t']): string {
  return t('canvas.a11y.pageLabel', { count });
}
