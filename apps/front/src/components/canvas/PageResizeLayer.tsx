import type Konva from 'konva';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Group, Line, Rect, Text as KonvaText } from 'react-konva';
import { useT } from '@rdlc-designer/i18n/react';
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
 * Las **zonas** van en una capa **por debajo del papel**: donde hay contenido,
 * el contenido gana el clic (una tabla pegada al borde del cuerpo no debe
 * quedar bloqueada); la línea se agarra en los tramos libres, que es donde se
 * redimensiona de verdad. La **previsualización** (línea discontinua + etiqueta
 * con los cm) vive en una capa superior sin `listening`, y se mueve por refs
 * (sin re-render: un re-render mataría el drag de Konva).
 *
 * Los **márgenes** se arrastran desde los marcadores de la regla (estilo Word) y
 * usan la API imperativa de la capa de previsualización.
 *
 * Para que se vea que esos bordes se arrastran, cada uno lleva un **asa**
 * visible (`variant="grips"`, en la capa superior) en el margen de la página,
 * donde nunca hay contenido; al pasar por el asa o por el borde, la **pista**
 * resalta el borde entero y dice qué cambia y cuánto mide ahora.
 */

export type PageRegion = 'pageHeader' | 'pageFooter' | 'body';

export interface PageResizeHandle {
  /** Previsualiza una frontera (línea + etiqueta) en px de papel. */
  showPreview: (orientation: 'horizontal' | 'vertical', position: number, label: string) => void;
  /** Previsualiza un margen desde la regla (cm de papel). */
  showMarginPreview: (orientation: 'horizontal' | 'vertical', cm: number, label: string) => void;
  /** Oculta la previsualización (al soltar o cancelar el arrastre). */
  hidePreview: () => void;
  /**
   * Pista al pasar por un borde arrastrable: el borde resaltado y su medida
   * actual. `along` = dónde empieza la etiqueta a lo largo del borde (px de papel).
   */
  showHint: (
    orientation: 'horizontal' | 'vertical',
    position: number,
    label: string,
    along: number,
  ) => void;
  hideHint: () => void;
}

export interface PageResizeZonesProps {
  layout: PaperLayout;
  zoom: number;
  /** Alto de banda/cuerpo al soltar un borde (cm). */
  onResizeRegion?: (region: PageRegion, cm: number) => void;
  /** Ancho de sección al soltar el borde derecho (cm). */
  onResizeSectionWidth?: (cm: number) => void;
  /** Mínimo por contenido (cm): el cuerpo no queda a la izquierda de sus items. */
  sectionMinCm?: number;
  /** Mínimos por contenido (cm) de cada banda: su alto no baja de sus items. */
  bandMinCm?: { header: number; body: number; footer: number };
  /** Pinta la previsualización (vive en `PageResizePreview`, sobre el contenido). */
  onPreview: (orientation: 'horizontal' | 'vertical', position: number, label: string) => void;
  /** Oculta la previsualización al soltar/cancelar. */
  onPreviewEnd: () => void;
  /**
   * `zones` (por defecto): franjas invisibles a lo largo de cada borde, bajo el
   * papel. `grips`: un asa visible por borde, en la capa superior.
   */
  variant?: 'zones' | 'grips';
  /** Pista al pasar por un borde (ver `PageResizeHandle.showHint`). */
  onHint?: (
    orientation: 'horizontal' | 'vertical',
    position: number,
    label: string,
    along: number,
  ) => void;
  onHintEnd?: () => void;
}

/** Grosor de las zonas de arrastre (px de pantalla). */
const ZONE_PX = 8;
/** Asa: largo y grueso visibles, y margen extra de acierto alrededor (px de pantalla). */
const GRIP_LONG_PX = 28;
/** Asa más corta que se dibuja (en márgenes estrechos). */
const GRIP_MIN_PX = 14;
const GRIP_SHORT_PX = 6;
const GRIP_HIT_PAD_PX = 6;
/** Asa en reposo (slate-500: 4,8:1 sobre el papel blanco) y al pasar por encima. */
const GRIP_FILL = '#64748b';
const GRIP_HOVER = '#2563eb';
/** Ancho **mínimo** de la etiqueta de la previsualización (px de pantalla). */
const BADGE_PX = 74;
/** Aire a cada lado del texto dentro de la etiqueta (px de pantalla). */
const BADGE_PADDING_PX = 16;
/**
 * Puntos iniciales de las líneas, **una sola referencia**: con un array nuevo
 * en cada render, react-konva reaplicaba la prop y devolvía a 0 una línea que
 * se estaba dibujando por ref (el lienzo re-renderiza a mitad del arrastre
 * cuando llega la proyección del arrastre anterior).
 */
const NO_POINTS = [0, 0, 0, 0];
/** Letra de las etiquetas (px de pantalla). */
const LABEL_FONT_PX = 10;

/** Zonas de arrastre de los bordes de página (van **bajo** el papel en la misma capa). */
export function PageResizeZones({
  layout,
  zoom,
  onResizeRegion,
  onResizeSectionWidth,
  sectionMinCm,
  bandMinCm,
  onPreview,
  onPreviewEnd,
  variant = 'zones',
  onHint,
  onHintEnd,
}: PageResizeZonesProps): ReactNode {
  const t = useT();
  const groupRef = useRef<Konva.Group | null>(null);

  const header = layout.bands.find((band) => band.key === 'header');
  const body = layout.bands.find((band) => band.key === 'body');
  const footer = layout.bands.find((band) => band.key === 'footer');

  // QA (Playwright): centro de cada zona en coordenadas de pantalla.
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED || variant !== 'zones') return;
    const stage = groupRef.current?.getStage();
    const container = stage?.container().getBoundingClientRect();
    // El stage es la **ventana** renderizada: sus `x`/`y` (px de pantalla)
    // llevan el origen del papel al hueco visible.
    const offsetX = stage?.x() ?? 0;
    const offsetY = stage?.y() ?? 0;
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
      x: container.left + offsetX + x * zoom,
      y: container.top + offsetY + y * zoom,
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

  if (!header || !body || !footer) return null;

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
    onPreview('horizontal', originY + heightCm * PX_PER_CM, formatCm(heightCm));

  /** Previsualiza el ancho de sección resultante. */
  const previewSection = (widthCm: number): void =>
    onPreview('vertical', layout.marginLeft + widthCm * PX_PER_CM, formatCm(widthCm));

  // Asas: en una franja del margen donde nunca hay contenido (los items viven
  // dentro de las bandas), centradas y más cortas si el margen es estrecho (a
  // zoom de ajuste 1 cm son ~22 px); sin franja que valga, dentro del borde.
  const placeGrip = (
    strips: { start: number; size: number }[],
    fallback: number,
  ): { center: number; longPx: number } => {
    for (const strip of strips) {
      const roomPx = strip.size * zoom - 4;
      if (roomPx >= GRIP_MIN_PX) {
        return { center: strip.start + strip.size / 2, longPx: Math.min(GRIP_LONG_PX, roomPx) };
      }
    }
    return { center: fallback + (GRIP_LONG_PX / 2 + 4) / zoom, longPx: GRIP_LONG_PX };
  };
  /** Asas de los bordes horizontales (en el margen izquierdo o en el hueco de la derecha). */
  const across = placeGrip(
    [
      { start: 0, size: layout.marginLeft },
      { start: reportRight, size: layout.sheetWidth - reportRight },
    ],
    layout.marginLeft,
  );
  /** Asa del ancho de sección (en el margen superior o en el hueco de abajo). */
  const down = placeGrip(
    [
      { start: 0, size: layout.marginTop },
      { start: reportBottom, size: layout.sheetHeight - reportBottom },
    ],
    layout.marginTop,
  );
  /** Dónde empieza la etiqueta de la pista: justo después del asa. */
  const afterGrip = (grip: { center: number; longPx: number }): number =>
    grip.center + (grip.longPx / 2 + 6) / zoom;
  const hint = (key: 'header' | 'body' | 'footer' | 'section', cm: number): string =>
    t('canvas.pageResize.hint', { label: t(`canvas.pageResize.${key}`), size: formatCm(cm) });
  const zone = {
    zoom,
    variant,
    ...(onHint ? { onHint } : {}),
    ...(onHintEnd ? { onHintEnd } : {}),
    onPreviewEnd,
  };

  return (
    <Group ref={groupRef}>
      {/* Borde inferior del encabezado (alto del encabezado). */}
      {onResizeRegion && (variant === 'zones' || header.visible) ? (
        <PageResizeZone
          {...zone}
          name="page-resize-header"
          x={0}
          y={headerBottom}
          length={layout.sheetWidth}
          grip={{ x: across.center, y: headerBottom }}
          gripLongPx={across.longPx}
          hint={hint('header', headerCm)}
          hintAlong={afterGrip(across)}
          onPreviewMove={(delta, shift) => {
            const heightCm = bandHeightFrom(
              headerCm,
              delta,
              bandMinCm?.header ?? 0,
              snapStep(shift),
            );
            previewBand(header.y, heightCm);
          }}
          onDragged={(delta, shift) =>
            onResizeRegion(
              'pageHeader',
              bandHeightFrom(headerCm, delta, bandMinCm?.header ?? 0, snapStep(shift)),
            )
          }
        />
      ) : null}

      {/* Borde inferior del cuerpo (alto del cuerpo). */}
      {onResizeRegion ? (
        <PageResizeZone
          {...zone}
          name="page-resize-body"
          x={0}
          y={bodyBottom}
          length={layout.sheetWidth}
          grip={{ x: across.center, y: bodyBottom }}
          gripLongPx={across.longPx}
          hint={hint('body', bodyCm)}
          hintAlong={afterGrip(across)}
          onPreviewMove={(delta, shift) => {
            const heightCm = bandHeightFrom(bodyCm, delta, bandMinCm?.body ?? 0, snapStep(shift));
            previewBand(body.y, heightCm);
          }}
          onDragged={(delta, shift) =>
            onResizeRegion(
              'body',
              bandHeightFrom(bodyCm, delta, bandMinCm?.body ?? 0, snapStep(shift)),
            )
          }
        />
      ) : null}

      {/* Borde superior del pie (hacia arriba crece). */}
      {onResizeRegion && (variant === 'zones' || footer.visible) ? (
        <PageResizeZone
          {...zone}
          name="page-resize-footer"
          x={0}
          y={footer.y}
          length={layout.sheetWidth}
          grip={{ x: across.center, y: footer.y }}
          gripLongPx={across.longPx}
          hint={hint('footer', footerCm)}
          hintAlong={afterGrip(across)}
          onPreviewMove={(delta, shift) => {
            const heightCm = bandHeightFrom(
              footerCm,
              -delta,
              bandMinCm?.footer ?? 0,
              snapStep(shift),
            );
            // La guía va en el **nuevo borde superior** del pie (la base está
            // pegada al margen inferior).
            onPreview('horizontal', footerBase - heightCm * PX_PER_CM, formatCm(heightCm));
          }}
          onDragged={(delta, shift) =>
            onResizeRegion(
              'pageFooter',
              bandHeightFrom(footerCm, -delta, bandMinCm?.footer ?? 0, snapStep(shift)),
            )
          }
        />
      ) : null}

      {/* Borde derecho de la sección (ancho del informe). */}
      {onResizeSectionWidth ? (
        <PageResizeZone
          {...zone}
          name="page-resize-section"
          vertical
          x={reportRight}
          y={layout.marginTop}
          length={Math.max(reportBottom - layout.marginTop, ZONE_PX)}
          grip={{ x: reportRight, y: down.center }}
          gripLongPx={down.longPx}
          hint={hint('section', sectionCm)}
          hintAlong={afterGrip(down)}
          onPreviewMove={(delta, shift) => {
            const widthCm = sectionWidthFrom(
              sectionCm,
              delta,
              sheetWidthCm,
              sectionMinCm,
              snapStep(shift),
            );
            previewSection(widthCm);
          }}
          onDragged={(delta, shift) =>
            onResizeSectionWidth(
              sectionWidthFrom(sectionCm, delta, sheetWidthCm, sectionMinCm, snapStep(shift)),
            )
          }
        />
      ) : null}
    </Group>
  );
}

/** Nodos de una línea con etiqueta (la previsualización o la pista). */
interface GuideNodes {
  group: Konva.Group;
  line: Konva.Line;
  badge: Konva.Rect;
  text: Konva.Text;
}

/**
 * Previsualización (línea discontinua + tamaño resultante, al arrastrar) y
 * pista (borde resaltado + medida actual, al pasar por encima), en la capa
 * superior y sin `listening`.
 */
export const PageResizePreview = forwardRef<
  PageResizeHandle,
  { layout: PaperLayout; zoom: number }
>(function PageResizePreview({ layout, zoom }, ref): ReactNode {
  const previewGroup = useRef<Konva.Group | null>(null);
  const previewLine = useRef<Konva.Line | null>(null);
  const previewBadge = useRef<Konva.Rect | null>(null);
  const previewText = useRef<Konva.Text | null>(null);
  const hintGroup = useRef<Konva.Group | null>(null);
  const hintLine = useRef<Konva.Line | null>(null);
  const hintBadge = useRef<Konva.Rect | null>(null);
  const hintText = useRef<Konva.Text | null>(null);

  const nodes = (kind: 'preview' | 'hint'): GuideNodes | null => {
    const group = (kind === 'preview' ? previewGroup : hintGroup).current;
    const line = (kind === 'preview' ? previewLine : hintLine).current;
    const badge = (kind === 'preview' ? previewBadge : hintBadge).current;
    const text = (kind === 'preview' ? previewText : hintText).current;
    return group && line && badge && text ? { group, line, badge, text } : null;
  };

  /**
   * Línea a lo largo de todo el papel en `position` y etiqueta junto a ella,
   * empezando en `along` (px de papel a lo largo de la línea).
   */
  const draw = (
    guide: GuideNodes,
    orientation: 'horizontal' | 'vertical',
    position: number,
    label: string,
    along: number,
  ): void => {
    const { group, line, badge, text } = guide;
    // Tamaños en px de pantalla (no escalan con el zoom). La pastilla crece con
    // el texto para que el tamaño resultante nunca se recorte.
    const badgeHeight = 16 / zoom;
    const gap = 6 / zoom;
    // La letra también es de pantalla (10 px): en px de papel encogía con el
    // zoom (6 px a zoom de ajuste) dentro de una pastilla que no encogía.
    text.fontSize(LABEL_FONT_PX / zoom);
    const textPx = text.measureSize(label).width * zoom;
    const badgeWidth = Math.max(BADGE_PX, textPx + BADGE_PADDING_PX) / zoom;
    const placeBadge = (x: number, y: number): void => {
      badge.setAttrs({ x, y, width: badgeWidth, height: badgeHeight });
      text.setAttrs({ x, y, width: badgeWidth, height: badgeHeight, text: label });
    };

    if (orientation === 'horizontal') {
      line.setAttrs({ points: [0, position, layout.sheetWidth, position] });
      const above = position - badgeHeight - gap;
      const x = Math.min(along, Math.max(gap, layout.sheetWidth - badgeWidth - gap));
      placeBadge(x, above < gap ? position + gap : above);
    } else {
      line.setAttrs({ points: [position, 0, position, layout.sheetHeight] });
      // Junto a la línea: a su derecha; si no cabe en el papel, a su izquierda.
      const right = position + gap;
      const badgeX =
        right + badgeWidth <= layout.sheetWidth - gap
          ? right
          : Math.max(gap, position - badgeWidth - gap);
      placeBadge(badgeX, Math.min(along, Math.max(gap, layout.sheetHeight - badgeHeight - gap)));
    }
    group.visible(true);
    group.getLayer()?.batchDraw();
  };

  const hide = (kind: 'preview' | 'hint'): void => {
    const group = (kind === 'preview' ? previewGroup : hintGroup).current;
    group?.visible(false);
    group?.getLayer()?.batchDraw();
  };

  const showPreview = (
    orientation: 'horizontal' | 'vertical',
    position: number,
    label: string,
  ): void => {
    const guide = nodes('preview');
    if (!guide) return;
    // Arrastrando, la pista sobra: la previsualización dice el tamaño nuevo.
    hide('hint');
    draw(guide, orientation, position, label, 6 / zoom);
  };

  useImperativeHandle(ref, () => ({
    showPreview,
    showMarginPreview: (orientation, cm, label) => showPreview(orientation, cm * PX_PER_CM, label),
    hidePreview: () => hide('preview'),
    showHint: (orientation, position, label, along) => {
      const guide = nodes('hint');
      if (guide) draw(guide, orientation, position, label, along);
    },
    hideHint: () => hide('hint'),
  }));

  return (
    <Group listening={false}>
      <Group ref={hintGroup} name="page-resize-hint" visible={false} listening={false}>
        <Line
          ref={hintLine}
          name="page-resize-hint-line"
          points={NO_POINTS}
          stroke="#2563eb"
          strokeWidth={2}
          opacity={0.7}
          strokeScaleEnabled={false}
        />
        <Rect
          ref={hintBadge}
          name="page-resize-hint-badge"
          width={BADGE_PX}
          height={16}
          fill="#1e293b"
          cornerRadius={3}
        />
        <KonvaText
          ref={hintText}
          name="page-resize-hint-label"
          width={BADGE_PX}
          height={16}
          align="center"
          verticalAlign="middle"
          fontSize={10}
          fill="#ffffff"
        />
      </Group>
      <Group ref={previewGroup} name="page-resize-preview" visible={false} listening={false}>
        <Line
          ref={previewLine}
          name="page-resize-line"
          points={NO_POINTS}
          stroke="#2563eb"
          strokeWidth={1.5}
          dash={[5, 4]}
          strokeScaleEnabled={false}
        />
        <Rect
          ref={previewBadge}
          name="page-resize-badge"
          width={BADGE_PX}
          height={16}
          fill="#2563eb"
          cornerRadius={3}
        />
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
    </Group>
  );
});

/** Paso del imán: 0,1 cm; con Shift se desactiva (lib/pageResize redondea). */
function snapStep(shift: boolean): number {
  return shift ? 0 : 0.1;
}

/**
 * Un borde de la página que se arrastra (banda o ancho de sección): una franja
 * invisible a lo largo del borde (`zones`) o su asa visible (`grips`). El
 * gesto es el mismo: el delta del puntero en cm desde el mousedown.
 */
function PageResizeZone({
  name,
  vertical = false,
  x,
  y,
  length,
  zoom,
  variant,
  grip,
  gripLongPx,
  hint,
  hintAlong,
  onHint,
  onHintEnd,
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
  variant: 'zones' | 'grips';
  /** Centro del asa (px de papel) y su largo (px de pantalla). */
  grip: { x: number; y: number };
  gripLongPx: number;
  /** Texto de la pista (qué cambia y su medida actual). */
  hint: string;
  /** Dónde empieza la etiqueta de la pista a lo largo del borde (px de papel). */
  hintAlong: number;
  onHint?: PageResizeZonesProps['onHint'];
  onHintEnd?: () => void;
  onPreviewMove: (deltaCm: number, shift: boolean) => void;
  onDragged: (deltaCm: number, shift: boolean) => void;
  onPreviewEnd: () => void;
}): ReactNode {
  const thickness = ZONE_PX / zoom;
  const startPointer = useRef<{ x: number; y: number } | null>(null);
  const startLocal = useRef<{ x: number; y: number } | null>(null);
  /** Arrastrando: la pista no vuelve hasta soltar (manda la previsualización). */
  const draggingRef = useRef(false);

  /** Delta del puntero en cm (px de pantalla ÷ zoom ÷ px de papel por cm). */
  const deltaCm = (event: Konva.KonvaEventObject<DragEvent>): number | null => {
    const pointer = event.target.getStage()?.getPointerPosition();
    const start = startPointer.current;
    if (!pointer || !start) return null;
    const scale = event.target.getStage()?.scaleX() ?? 1;
    const screenDelta = vertical ? pointer.x - start.x : pointer.y - start.y;
    return screenDelta / scale / PX_PER_CM;
  };

  const isGrip = variant === 'grips';
  const handlers = {
    onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = event.target.getStage();
      if (stage) stage.container().style.cursor = vertical ? 'ew-resize' : 'ns-resize';
      if (isGrip) {
        (event.target as Konva.Rect).fill(GRIP_HOVER);
        event.target.getLayer()?.batchDraw();
      }
      if (!draggingRef.current) {
        onHint?.(vertical ? 'vertical' : 'horizontal', vertical ? x : y, hint, hintAlong);
      }
    },
    onMouseLeave: (event: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = event.target.getStage();
      if (stage) stage.container().style.cursor = '';
      if (isGrip) {
        (event.target as Konva.Rect).fill(GRIP_FILL);
        event.target.getLayer()?.batchDraw();
      }
      if (!draggingRef.current) onHintEnd?.();
    },
    onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => {
      // El gesto empieza en el mousedown: el `dragstart` de Konva llega
      // después de su umbral (3 px) y el delta perdería ese tramo.
      startPointer.current = event.target.getStage()?.getPointerPosition() ?? null;
      startLocal.current = { x: event.target.x(), y: event.target.y() };
    },
    onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      draggingRef.current = true;
      onHintEnd?.();
      if (!startPointer.current) {
        startPointer.current = event.target.getStage()?.getPointerPosition() ?? null;
        startLocal.current = { x: event.target.x(), y: event.target.y() };
      }
    },
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const delta = deltaCm(event);
      if (delta !== null) onPreviewMove(delta, event.evt.shiftKey);
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      draggingRef.current = false;
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
    },
  };

  if (isGrip) {
    const long = gripLongPx / zoom;
    const short = GRIP_SHORT_PX / zoom;
    const pad = GRIP_HIT_PAD_PX / zoom;
    const width = vertical ? short : long;
    const height = vertical ? long : short;
    return (
      <Rect
        name={`${name}-grip`}
        x={grip.x - width / 2}
        y={grip.y - height / 2}
        width={width}
        height={height}
        cornerRadius={short / 2}
        fill={GRIP_FILL}
        // El acierto es mayor que el asa (≥ 18 × 40 px de pantalla).
        hitFunc={(context, shape) => {
          context.beginPath();
          context.rect(-pad, -pad, width + pad * 2, height + pad * 2);
          context.closePath();
          context.fillStrokeShape(shape);
        }}
        draggable
        // El asa sigue al puntero solo en el eje del borde.
        dragBoundFunc={function (this: Konva.Node, pos) {
          const current = this.absolutePosition();
          return vertical ? { x: pos.x, y: current.y } : { x: current.x, y: pos.y };
        }}
        {...handlers}
      />
    );
  }

  return (
    <Rect
      name={name}
      x={vertical ? x - thickness / 2 : x}
      y={vertical ? y : y - thickness / 2}
      width={vertical ? thickness : length}
      height={vertical ? length : thickness}
      fill="rgba(0,0,0,0.001)"
      draggable
      {...handlers}
    />
  );
}
