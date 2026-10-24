import type { Length, ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect, useRef, useState } from 'react';
import { toCm } from '@/lib/projection';
import type { ReportPropertiesFormProps } from './ReportPropertiesForm';

/** Presets de papel en cm (vertical), como la lista de Report Builder. */
export const PAPER_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'Letter', width: 21.59, height: 27.94 },
  { name: 'Tabloid', width: 27.94, height: 43.18 },
  { name: 'Legal', width: 21.59, height: 35.56 },
  { name: 'Statement', width: 13.97, height: 21.59 },
  { name: 'Executive', width: 18.41, height: 26.67 },
  { name: 'A3', width: 29.7, height: 42 },
  { name: 'A4', width: 21, height: 29.7 },
  { name: 'A5', width: 14.8, height: 21 },
  { name: 'A6', width: 10.5, height: 14.8 },
  { name: '215 x 330', width: 21.5, height: 33 },
  { name: '9 x 11', width: 22.86, height: 27.94 },
  { name: 'B4', width: 25, height: 35.3 },
  { name: '5 x 7', width: 12.7, height: 17.78 },
  { name: 'B6', width: 12.5, height: 17.6 },
  { name: '8 x 10', width: 20.32, height: 25.4 },
  { name: 'Postcard', width: 10.16, height: 15.24 },
  { name: 'Oversized A4', width: 22.7, height: 31.7 },
];

/** Tolerancia para reconocer un preset (cm). */
const PAPER_TOLERANCE_CM = 0.05;

/** Alto por defecto de una banda recién insertada (igual que el dominio). */
const DEFAULT_BAND_CM = 1.25;

/** Nombre del preset que corresponde a esas medidas en esa orientación. */
function paperNameFor(width: number, height: number): string {
  const landscape = width > height;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= PAPER_TOLERANCE_CM;
  const preset = PAPER_PRESETS.find((candidate) =>
    landscape
      ? near(width, candidate.height) && near(height, candidate.width)
      : near(width, candidate.width) && near(height, candidate.height),
  );
  return preset?.name ?? 'custom';
}

function cmLength(value: number): Length {
  return { value: Math.round(value * 10000) / 10000, unit: 'cm' };
}

/** Borrador de una banda de página (encabezado o pie). */
export interface BandDraft {
  present: boolean;
  height: number;
  /** Se imprime en la primera página. */
  first: boolean;
  /** Se imprime en la última página. */
  last: boolean;
}

export type MarginSide = 'top' | 'bottom' | 'left' | 'right';

type PageDraftActions = Pick<
  ReportPropertiesFormProps,
  | 'onSetPageSize'
  | 'onSetPageMargins'
  | 'onSetRegionHeight'
  | 'onSetSectionWidth'
  | 'onSetHeaderFooterOptions'
  | 'onSetRegionPresent'
>;

/**
 * Borrador de la pestaña «Página» de las propiedades del informe (tamaño,
 * márgenes, bandas, cuerpo) y su «Aplicar», que emite los comandos solo de lo
 * que el usuario cambió. No se resincroniza solo: el contenedor decide cuándo
 * remontar el formulario.
 */
export function usePageDraft(projection: ProjectionDto, actions: PageDraftActions) {
  const [width, setWidth] = useState(() => toCm(projection.page.width));
  const [height, setHeight] = useState(() => toCm(projection.page.height));
  const [margins, setMargins] = useState(() => ({
    top: toCm(projection.page.margins.top),
    bottom: toCm(projection.page.margins.bottom),
    left: toCm(projection.page.margins.left),
    right: toCm(projection.page.margins.right),
  }));
  // Presencia original de cada banda: solo se envía el comando si cambia al Aplicar.
  const initialPresent = useRef({
    header: projection.page.header.present !== false,
    footer: projection.page.footer.present !== false,
  }).current;
  // Altos vigentes al montar (y tras cada «Aplicar»): solo se envía el comando
  // si el usuario cambió el valor; si no, una banda corta (0,6 cm) se quedaría
  // como está en lugar de crecer al mínimo del editor.
  const appliedHeights = useRef({
    header: toCm(projection.page.header.height),
    footer: toCm(projection.page.footer.height),
  }).current;
  // En RDL los flags de impresión valen `true` por defecto si no se declaran.
  // El mínimo (`DEFAULT_BAND_CM`) solo se propone al **insertar** una banda ausente.
  const [header, setHeader] = useState<BandDraft>(() => ({
    present: initialPresent.header,
    height: initialPresent.header
      ? appliedHeights.header
      : Math.max(appliedHeights.header, DEFAULT_BAND_CM),
    first: projection.page.header.printOnFirstPage ?? true,
    last: projection.page.header.printOnLastPage ?? true,
  }));
  const [footer, setFooter] = useState<BandDraft>(() => ({
    present: initialPresent.footer,
    height: initialPresent.footer
      ? appliedHeights.footer
      : Math.max(appliedHeights.footer, DEFAULT_BAND_CM),
    first: projection.page.footer.printOnFirstPage ?? true,
    last: projection.page.footer.printOnLastPage ?? true,
  }));
  /** Alto del cuerpo (`Body > Height`); también se arrastra en el lienzo (U10). */
  const [bodyHeight, setBodyHeight] = useState(() => toCm(projection.page.body.height));
  /** Ancho de la sección (`ReportSection > Width`); también se arrastra (U10). */
  const [bodyWidth, setBodyWidth] = useState(() => toCm(projection.page.body.width));
  /**
   * Ctrl+Intro pide un aplicar **diferido**: el `NumberInput` confirma su
   * borrador en el mismo keydown (setState aún sin propagar) y aplicar aquí en
   * el acto leería el valor viejo (BUG-34). El contador dispara el aplicar en
   * el efecto posterior al render, ya con el estado confirmado.
   */
  const [applyRequest, setApplyRequest] = useState(0);

  const landscape = width > height;
  const selectedPaper = paperNameFor(width, height);

  /** Cambia de orientación intercambiando ancho y alto. */
  const setOrientation = (nextLandscape: boolean): void => {
    if (nextLandscape === landscape) return;
    setWidth(height);
    setHeight(width);
  };

  /** Aplica un preset conservando la orientación actual. */
  const selectPaper = (name: string): void => {
    const preset = PAPER_PRESETS.find((candidate) => candidate.name === name);
    if (!preset) return; // «Custom»: no toca las medidas.
    setWidth(landscape ? preset.height : preset.width);
    setHeight(landscape ? preset.width : preset.height);
  };

  const applyPage = (): void => {
    actions.onSetPageSize(cmLength(width), cmLength(height));
    actions.onSetPageMargins({
      top: cmLength(margins.top),
      bottom: cmLength(margins.bottom),
      left: cmLength(margins.left),
      right: cmLength(margins.right),
    });
    // Insertar/quitar la banda solo si el usuario lo cambió (el valor aplicado
    // pasa a ser la referencia para el siguiente «Aplicar»).
    if (header.present !== initialPresent.header) {
      actions.onSetRegionPresent('pageHeader', header.present);
      initialPresent.header = header.present;
    }
    if (footer.present !== initialPresent.footer) {
      actions.onSetRegionPresent('pageFooter', footer.present);
      initialPresent.footer = footer.present;
    }
    if (header.present) {
      if (header.height !== appliedHeights.header) {
        actions.onSetRegionHeight('pageHeader', cmLength(header.height));
        appliedHeights.header = header.height;
      }
      actions.onSetHeaderFooterOptions('pageHeader', {
        printOnFirstPage: header.first,
        printOnLastPage: header.last,
      });
    }
    if (footer.present) {
      if (footer.height !== appliedHeights.footer) {
        actions.onSetRegionHeight('pageFooter', cmLength(footer.height));
        appliedHeights.footer = footer.height;
      }
      actions.onSetHeaderFooterOptions('pageFooter', {
        printOnFirstPage: footer.first,
        printOnLastPage: footer.last,
      });
    }
    actions.onSetSectionWidth(cmLength(bodyWidth));
    actions.onSetRegionHeight('body', cmLength(bodyHeight));
  };

  // El aplicar diferido de Ctrl+Intro usa siempre el `applyPage` del último
  // render (con los setState del keydown ya confirmados).
  const applyPageRef = useRef(applyPage);
  useEffect(() => {
    applyPageRef.current = applyPage;
  });
  useEffect(() => {
    if (applyRequest > 0) applyPageRef.current();
  }, [applyRequest]);

  return {
    width,
    height,
    setWidth,
    setHeight,
    margins,
    setMargin: (side: MarginSide, value: number): void =>
      setMargins((current) => ({ ...current, [side]: value })),
    header,
    footer,
    patchHeader: (patch: Partial<BandDraft>): void =>
      setHeader((current) => ({ ...current, ...patch })),
    patchFooter: (patch: Partial<BandDraft>): void =>
      setFooter((current) => ({ ...current, ...patch })),
    bodyWidth,
    bodyHeight,
    setBodyWidth,
    setBodyHeight,
    landscape,
    selectedPaper,
    setOrientation,
    selectPaper,
    applyPage,
    requestApply: (): void => setApplyRequest((request) => request + 1),
  };
}
