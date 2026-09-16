import type { ProjectionDto, RegionDto } from '@rdlc-designer/contracts';
import { toPx } from './geometry';

/**
 * Geometría del papel: dónde cae cada banda (encabezado/cuerpo/pie) y qué ancho
 * tiene el informe. La usan el lienzo (hit-test, "traer a la vista") y el
 * componente `Paper` (pintado), para no duplicar cuentas.
 */

export interface PaperLayout {
  sheetWidth: number;
  sheetHeight: number;
  marginLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  /** Ancho de sección (manda el mayor de las bandas). */
  reportWidth: number;
  bands: Band[];
}

export interface Band {
  key: 'header' | 'body' | 'footer';
  region: RegionDto;
  x: number;
  y: number;
  visible: boolean;
}

export function paperLayout(projection: ProjectionDto): PaperLayout {
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
  const footerHeight = toPx(projection.page.footer.height);

  /**
   * Posición de cada banda sobre el papel:
   * encabezado arriba (margen superior), cuerpo debajo y pie pegado al margen
   * inferior (como en el render real/Report Builder).
   */
  const bands: Band[] = [
    {
      key: 'header',
      region: projection.page.header,
      x: marginLeft,
      y: marginTop,
      visible: hasContent(projection.page.header),
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
      visible: hasContent(projection.page.footer),
    },
  ];

  return {
    sheetWidth,
    sheetHeight,
    marginLeft,
    marginTop,
    marginRight,
    marginBottom,
    reportWidth,
    bands,
  };
}

/** Una banda tiene contenido si trae items o altura declarada. */
export function hasContent(region: RegionDto): boolean {
  return region.items.length > 0 || region.height.value > 0;
}

/** Punto en cm relativos a una banda (o `undefined` si la banda no lo cubre). */
export function bandAt(layout: PaperLayout, x: number, y: number): Band | undefined {
  const hit = [...layout.bands]
    .reverse()
    .find(
      (candidate) =>
        candidate.visible &&
        x >= candidate.x &&
        x <= candidate.x + layout.reportWidth &&
        y >= candidate.y &&
        y <= candidate.y + toPx(candidate.region.height),
    );
  return hit ?? layout.bands.find((candidate) => candidate.key === 'body');
}
