import type Konva from 'konva';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Group, Layer, Line, Rect, Text as KonvaText } from 'react-konva';
import { toCm } from '@/lib/projection';
import { bandHeightFrom, formatCm, sectionWidthFrom } from '@/lib/pageResize';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';
import type { PaperLayout } from './bands';
import { PX_PER_CM, toPx } from './geometry';

/**
 * U10 · redimensionado de **página** en el lienzo, como Report Builder:
 *
 * - **Bandas**: el borde inferior del encabezado y del cuerpo, y el superior del
 *   pie. Cambian su `Height` (`setRegionHeight`).
 * - **Ancho de sección**: el borde derecho de la zona del informe
 *   (`ReportSection > Width`, manda en las tres bandas).
 *
 * Durante el arrastre se pinta una **línea discontinua** en la frontera destino
 * y una etiqueta con los cm resultantes (los mismos cálculos que al soltar:
 * `lib/pageResize`). La previsualización se mueve por refs, sin re-render, para
 * no matar el drag de Konva (misma lección que el redimensionado de celdas).
 *
 * Los **márgenes** se arrastran desde los marcadores de la regla (estilo Word) y
 * usan la API imperativa de este componente para su previsualización.
 */

export type PageRegion = 'pageHeader' | 'pageFooter' | 'body';

export interface PageResizeHandle {
  /** Previsualiza una frontera de margen (línea + etiqueta) desde la regla. */
  showMarginPreview: (orientation: 'horizontal' | 'vertical', cm: number, label: string) => void;
  /** Oculta la previsualización (al soltar o cancelar el arrastre). */
  hidePreview: () => void;
}

export interface PageResizeLayerProps {
  layout: PaperLayout;
  zoom: number;
  /** Alto de banda/cuerpo al soltar un borde (cm). */
  onResizeRegion?: (region: PageRegion, cm: number) => void;
  /** Ancho de sección al soltar el borde derecho (cm). */
  onResizeSectionWidth?: (cm: number) => void;
}

/** Grosor de las zonas de arrastre (px de pantalla). */
const ZONE_PX = 8;
/** Ancho de la etiqueta de la previsualización (px de pantalla). */
const BADGE_PX = 74;

export const PageResizeLayer = forwardRef<PageResizeHandle, PageResizeLayerProps>(
  function PageResizeLayer({ layout, zoom, onResizeRegion, onResizeSectionWidth }, ref): ReactNode {
    const layerRef = useRef<Konva.Layer | null>(null);
    const previewGroup = useRef<Konva.Group | null>(null);
    const previewLine = useRef<Konva.Line | null>(null);
    const previewBadge = useRef<Konva.Rect | null>(null);
    const previewText = useRef<Konva.Text | null>(null);

    const header = layout.bands.find((band) => band.key === 'header');
    const body = layout.bands.find((band) => band.key === 'body');
    const footer = layout.bands.find((band) => band.key === 'footer');

    const showPreview = (
      orientation: 'horizontal' | 'vertical',
      position: number,
      label: string,
    ): void => {
      const group = previewGroup.current;
      const line = previewLine.current;
      const badge = previewBadge.current;
      const text = previewText.current;
      if (!group || !line || !badge || !text) return;

      // Tamaños en px de pantalla (no escalan con el zoom).
      const badgeWidth = BADGE_PX / zoom;
      const badgeHeight = 16 / zoom;
      const gap = 6 / zoom;
      if (orientation === 'horizontal') {
        line.setAttrs({ points: [0, position, layout.sheetWidth, position] });
        const above = position - badgeHeight - gap;
        const badgeY = above < gap ? position + gap : above;
        badge.setAttrs({ x: gap, y: badgeY, width: badgeWidth, height: badgeHeight });
        text.setAttrs({
          x: gap,
          y: badgeY,
          width: badgeWidth,
          height: badgeHeight,
          text: label,
        });
      } else {
        line.setAttrs({ points: [position, 0, position, layout.sheetHeight] });
        badge.setAttrs({ x: gap, y: gap, width: badgeWidth, height: badgeHeight });
        text.setAttrs({ x: gap, y: gap, width: badgeWidth, height: badgeHeight, text: label });
      }
      group.visible(true);
      group.getLayer()?.batchDraw();
    };

    const hidePreview = (): void => {
      previewGroup.current?.visible(false);
      previewGroup.current?.getLayer()?.batchDraw();
    };

    useImperativeHandle(ref, () => ({
      showMarginPreview: (orientation, cm, label) =>
        showPreview(orientation, cm * PX_PER_CM, label),
      hidePreview,
    }));

    // QA (Playwright): centro de cada zona en coordenadas de pantalla.
    useEffect(() => {
      if (!TEST_HOOKS_ENABLED) return;
      const container = layerRef.current?.getStage()?.container().getBoundingClientRect();
      const headerBand = layout.bands.find((band) => band.key === 'header');
      const bodyBand = layout.bands.find((band) => band.key === 'body');
      const footerBand = layout.bands.find((band) => band.key === 'footer');
      if (!container || !headerBand || !bodyBand || !footerBand) return;
      const headerEnd = headerBand.y + toPx(headerBand.region.height);
      const bodyEnd = bodyBand.y + toPx(bodyBand.region.height);
      const footerEnd = footerBand.visible
        ? footerBand.y + toPx(footerBand.region.height)
        : headerEnd;
      const right = layout.marginLeft + layout.reportWidth;
      const bottom = Math.max(headerEnd, bodyEnd, footerBand.y, footerEnd);
      const at = (x: number, y: number): { x: number; y: number } => ({
        x: container.left + x * zoom,
        y: container.top + y * zoom,
      });
      const centerX = layout.marginLeft + layout.reportWidth / 2;
      (
        window as Window & {
          __rdlcPageResize?: Record<string, { x: number; y: number }>;
        }
      ).__rdlcPageResize = {
        header: at(centerX, headerEnd),
        body: at(centerX, bodyEnd),
        footer: at(centerX, footerBand.y),
        section: at(right, (layout.marginTop + bottom) / 2),
      };
    });

    if (!header || !body || !footer) return <Layer listening={false} />;

    // Fronteras (px de papel).
    const headerBottom = header.y + toPx(header.region.height);
    const bodyBottom = body.y + toPx(body.region.height);
    const footerBase = footer.y + toPx(footer.region.height);
    const reportRight = layout.marginLeft + layout.reportWidth;
    const reportBottom = Math.max(headerBottom, bodyBottom, footer.visible ? footerBase : 0);

    const headerCm = toCm(header.region.height);
    const bodyCm = toCm(body.region.height);
    const footerCm = toCm(footer.region.height);
    const sectionCm = layout.reportWidth / PX_PER_CM;
    const sheetWidthCm = layout.sheetWidth / PX_PER_CM;

    /** Previsualiza el alto resultante de una banda con base `originY`. */
    const previewBand = (originY: number, heightCm: number): void =>
      showPreview('horizontal', originY + heightCm * PX_PER_CM, formatCm(heightCm));

    /** Previsualiza el ancho de sección resultante. */
    const previewSection = (widthCm: number): void =>
      showPreview('vertical', layout.marginLeft + widthCm * PX_PER_CM, formatCm(widthCm));

    return (
      <Layer ref={layerRef}>
        {/* Previsualización (oculta hasta el drag): línea + etiqueta. */}
        <Group ref={previewGroup} name="page-resize-preview" visible={false} listening={false}>
          <Line
            ref={previewLine}
            points={[0, 0, 0, 0]}
            stroke="#2563eb"
            strokeWidth={1.5}
            dash={[5, 4]}
            strokeScaleEnabled={false}
          />
          <Rect ref={previewBadge} width={BADGE_PX} height={16} fill="#2563eb" cornerRadius={3} />
          <KonvaText
            ref={previewText}
            name="page-resize-label"
            width={BADGE_PX}
            height={16}
            align="center"
            verticalAlign="middle"
            fontSize={10}
            fontStyle="bold"
            fill="#ffffff"
          />
        </Group>

        {/* Borde inferior del encabezado (alto del encabezado). */}
        {onResizeRegion ? (
          <PageResizeZone
            name="page-resize-header"
            x={0}
            y={headerBottom}
            length={layout.sheetWidth}
            zoom={zoom}
            onPreviewMove={(delta, shift) => {
              const heightCm = bandHeightFrom(headerCm, delta, snapStep(shift));
              previewBand(header.y, heightCm);
            }}
            onDragged={(delta, shift) =>
              onResizeRegion('pageHeader', bandHeightFrom(headerCm, delta, snapStep(shift)))
            }
            onPreviewEnd={hidePreview}
          />
        ) : null}

        {/* Borde inferior del cuerpo (alto del cuerpo). */}
        {onResizeRegion ? (
          <PageResizeZone
            name="page-resize-body"
            x={0}
            y={bodyBottom}
            length={layout.sheetWidth}
            zoom={zoom}
            onPreviewMove={(delta, shift) => {
              const heightCm = bandHeightFrom(bodyCm, delta, snapStep(shift));
              previewBand(body.y, heightCm);
            }}
            onDragged={(delta, shift) =>
              onResizeRegion('body', bandHeightFrom(bodyCm, delta, snapStep(shift)))
            }
            onPreviewEnd={hidePreview}
          />
        ) : null}

        {/* Borde superior del pie (hacia arriba crece). */}
        {onResizeRegion ? (
          <PageResizeZone
            name="page-resize-footer"
            x={0}
            y={footer.y}
            length={layout.sheetWidth}
            zoom={zoom}
            onPreviewMove={(delta, shift) => {
              const heightCm = bandHeightFrom(footerCm, -delta, snapStep(shift));
              previewBand(footerBase - heightCm * PX_PER_CM, heightCm);
            }}
            onDragged={(delta, shift) =>
              onResizeRegion('pageFooter', bandHeightFrom(footerCm, -delta, snapStep(shift)))
            }
            onPreviewEnd={hidePreview}
          />
        ) : null}

        {/* Borde derecho de la sección (ancho del informe). */}
        {onResizeSectionWidth ? (
          <PageResizeZone
            name="page-resize-section"
            vertical
            x={reportRight}
            y={layout.marginTop}
            length={Math.max(reportBottom - layout.marginTop, ZONE_PX)}
            zoom={zoom}
            onPreviewMove={(delta, shift) => {
              const widthCm = sectionWidthFrom(sectionCm, delta, sheetWidthCm, snapStep(shift));
              previewSection(widthCm);
            }}
            onDragged={(delta, shift) =>
              onResizeSectionWidth(
                sectionWidthFrom(sectionCm, delta, sheetWidthCm, snapStep(shift)),
              )
            }
            onPreviewEnd={hidePreview}
          />
        ) : null}
      </Layer>
    );
  },
);

/** Paso del imán: 0,1 cm; con Shift se desactiva (lib/pageResize redondea). */
function snapStep(shift: boolean): number {
  return shift ? 0 : 0.1;
}

/** Zona de arrastre en un borde de la página (bandas o ancho de sección). */
function PageResizeZone({
  name,
  vertical = false,
  x,
  y,
  length,
  zoom,
  onPreviewMove,
  onDragged,
  onPreviewEnd,
}: {
  name: string;
  vertical?: boolean;
  x: number;
  y: number;
  length: number;
  zoom: number;
  onPreviewMove: (deltaCm: number, shift: boolean) => void;
  onDragged: (deltaCm: number, shift: boolean) => void;
  onPreviewEnd: () => void;
}): ReactNode {
  const thickness = ZONE_PX / zoom;
  const startPointer = useRef<{ x: number; y: number } | null>(null);
  const startLocal = useRef<{ x: number; y: number } | null>(null);

  /** Delta del puntero en cm (px de pantalla ÷ zoom ÷ px de papel por cm). */
  const deltaCm = (event: Konva.KonvaEventObject<DragEvent>): number | null => {
    const pointer = event.target.getStage()?.getPointerPosition();
    const start = startPointer.current;
    if (!pointer || !start) return null;
    const scale = event.target.getStage()?.scaleX() ?? 1;
    const screenDelta = vertical ? pointer.x - start.x : pointer.y - start.y;
    return screenDelta / scale / PX_PER_CM;
  };

  return (
    <Rect
      name={name}
      x={vertical ? x - thickness / 2 : x}
      y={vertical ? y : y - thickness / 2}
      width={vertical ? thickness : length}
      height={vertical ? length : thickness}
      fill="rgba(0,0,0,0.001)"
      draggable
      onMouseEnter={(event) => {
        const stage = event.target.getStage();
        if (stage) stage.container().style.cursor = vertical ? 'ew-resize' : 'ns-resize';
      }}
      onMouseLeave={(event) => {
        const stage = event.target.getStage();
        if (stage) stage.container().style.cursor = '';
      }}
      onMouseDown={(event) => {
        // El gesto empieza en el mousedown: el `dragstart` de Konva llega
        // después de su umbral (3 px) y el delta perdería ese tramo.
        startPointer.current = event.target.getStage()?.getPointerPosition() ?? null;
        startLocal.current = { x: event.target.x(), y: event.target.y() };
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        if (!startPointer.current) {
          startPointer.current = event.target.getStage()?.getPointerPosition() ?? null;
          startLocal.current = { x: event.target.x(), y: event.target.y() };
        }
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const delta = deltaCm(event);
        if (delta !== null) onPreviewMove(delta, event.evt.shiftKey);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const delta = deltaCm(event);
        // El nodo vuelve a su sitio: la posición la fija la proyección.
        const local = startLocal.current;
        if (local) {
          event.target.x(local.x);
          event.target.y(local.y);
        }
        event.target.getLayer()?.batchDraw();
        startPointer.current = null;
        startLocal.current = null;
        onPreviewEnd();
        if (delta !== null) onDragged(delta, event.evt.shiftKey);
      }}
    />
  );
}
