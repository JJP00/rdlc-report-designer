import { describe, expect, it } from 'vitest';
import type { PageDto } from '@rdlc-designer/contracts';
import { createTranslator } from '@rdlc-designer/i18n';
import {
  bandContentMinCm,
  bandHeightFrom,
  clampMargin,
  formatCm,
  marginFromPointer,
  pageRulerSegments,
  sectionContentMinCm,
  sectionWidthFrom,
  snapCm,
} from './pageResize';

/** El módulo es puro: los textos llegan por el traductor (aquí, ES). */
const es = createTranslator('es').t;

/**
 * U10 · matemática del redimensionado de página: alto de bandas (encabezado,
 * cuerpo y pie), ancho de sección y márgenes, con imán de 0,1 cm y los límites
 * del dominio (bandas ≥ 0, sección ≥ el contenido y ≥ 1 cm, contenido ≥ 1 cm
 * entre márgenes).
 */

describe('U10 · pageResize', () => {
  it('snapCm imanta a 0,1 y con paso 0 solo redondea (Shift)', () => {
    expect(snapCm(2.44, 0.1)).toBe(2.4);
    expect(snapCm(2.46, 0.1)).toBe(2.5);
    expect(snapCm(2.4449, 0)).toBe(2.44);
  });

  it('bandHeightFrom arrastra el alto con imán y lo deja colapsar a 0', () => {
    expect(bandHeightFrom(2.5, 1.04)).toBe(3.5);
    expect(bandHeightFrom(2.5, -1)).toBe(1.5);
    // Nunca negativo: la banda puede quedarse a 0.
    expect(bandHeightFrom(0.4, -1)).toBe(0);
    // Shift (sin imán) conserva el valor exacto redondeado.
    expect(bandHeightFrom(2.5, 0.07, 0, 0)).toBe(2.57);
  });

  it('bandHeightFrom no baja del contenido de la banda', () => {
    // El contenido del encabezado llega a 6.7: pedir 1 deja 6.7.
    expect(bandHeightFrom(8.44, -7, 6.7)).toBe(6.7);
    // Hacia arriba no cambia nada.
    expect(bandHeightFrom(8.44, 1, 6.7)).toBe(9.4);
  });

  it('bandContentMinCm toma el fondo más lejano de la banda', () => {
    const length = (value: number): { value: number; unit: string } => ({ value, unit: 'cm' });
    const item = (top: number, height: number): Record<string, unknown> => ({
      id: `item-${top}-${height}`,
      kind: 'textbox',
      top: length(top),
      left: length(0),
      width: length(2),
      height: length(height),
      paragraphs: [],
    });
    const page = {
      header: { items: [item(1, 2)] },
      body: { items: [item(0, 12), item(3, 2)] },
      footer: { items: [item(0.5, 1.2)] },
    } as unknown as PageDto;
    expect(bandContentMinCm(page, 'header')).toBe(3);
    expect(bandContentMinCm(page, 'body')).toBe(12);
    expect(bandContentMinCm(page, 'footer')).toBe(1.7);
  });

  it('sectionWidthFrom limita la sección a [1 cm, ancho del papel]', () => {
    expect(sectionWidthFrom(19, -0.96, 21)).toBe(18);
    expect(sectionWidthFrom(19, -25, 21)).toBe(1);
    expect(sectionWidthFrom(19, 5, 21)).toBe(21);
    expect(sectionWidthFrom(19, 0.03, 21)).toBe(19);
  });

  it('sectionWidthFrom no encoge por debajo del contenido (mínimo)', () => {
    // El contenido llega a 18.94: pedir 10 deja la sección en 18.94.
    expect(sectionWidthFrom(19, -9, 21, 18.94)).toBe(18.94);
    // Hacia la derecha no cambia nada.
    expect(sectionWidthFrom(19, 0.5, 21, 18.94)).toBe(19.5);
  });

  it('sectionContentMinCm toma el borde derecho más lejano de las tres bandas', () => {
    const length = (value: number): { value: number; unit: string } => ({ value, unit: 'cm' });
    const item = (left: number, width: number): Record<string, unknown> => ({
      id: `item-${left}-${width}`,
      kind: 'textbox',
      top: length(0),
      left: length(left),
      width: length(width),
      height: length(1),
      paragraphs: [],
    });
    const page = {
      header: { items: [item(1, 2)] },
      body: { items: [item(0, 19), item(2, 3)] },
      footer: { items: [item(0.5, 1)] },
    } as unknown as PageDto;
    expect(sectionContentMinCm(page)).toBe(19);
  });

  it('marginFromPointer mide desde el borde que se arrastra', () => {
    // Lado inicial (izquierda/arriba): el margen es la posición del puntero.
    expect(marginFromPointer('start', 2.54, 21)).toBe(2.5);
    // Lado final (derecha/abajo): el margen es lo que queda hasta el borde.
    expect(marginFromPointer('end', 18.5, 21)).toBe(2.5);
  });

  it('clampMargin deja el contenido mínimo entre lados opuestos', () => {
    expect(clampMargin(2.5, 1.27, 21)).toBe(2.5);
    // 21 - 1.27 - 1 = 18.73 como máximo.
    expect(clampMargin(25, 1.27, 21)).toBe(18.73);
    expect(clampMargin(-1, 1.27, 21)).toBe(0);
  });

  it('formatCm limpia los ceros de relleno', () => {
    expect(formatCm(2.4)).toBe('2.4 cm');
    expect(formatCm(12)).toBe('12 cm');
    expect(formatCm(13.456)).toBe('13.46 cm');
  });
});

describe('U10 · tramos de la regla', () => {
  interface LooseLength {
    value: number;
    unit: string;
  }

  const cm = (value: number): LooseLength => ({ value, unit: 'cm' });

  /** Página en mm (21×29,7) con márgenes y bandas en cm. */
  function page(
    headerCm = 3,
    footerCm = 2,
  ): {
    width: LooseLength;
    height: LooseLength;
    margins: { top: LooseLength; bottom: LooseLength; left: LooseLength; right: LooseLength };
    header: { height: LooseLength };
    footer: { height: LooseLength };
  } {
    return {
      width: { value: 210, unit: 'mm' },
      height: { value: 297, unit: 'mm' },
      margins: { top: cm(1.5), bottom: cm(1), left: cm(2), right: cm(2) },
      header: { height: cm(headerCm) },
      footer: { height: cm(footerCm) },
    };
  }

  it('la regla horizontal resalta solo el área imprimible (entre márgenes)', () => {
    expect(pageRulerSegments(page(), 'x', es)).toEqual([
      { key: 'printable', from: 2, to: 19, kind: 'printable', label: 'Área imprimible' },
    ]);
  });

  it('la regla vertical añade el encabezado y el pie (anclados a sus bordes)', () => {
    expect(pageRulerSegments(page(3, 4), 'y', es)).toEqual([
      { key: 'printable', from: 1.5, to: 28.7, kind: 'printable', label: 'Área imprimible' },
      { key: 'header', from: 1.5, to: 4.5, kind: 'band', label: 'Encabezado' },
      { key: 'footer', from: 24.7, to: 28.7, kind: 'band', label: 'Pie' },
    ]);
  });

  it('las bandas a 0 no se pintan', () => {
    expect(pageRulerSegments(page(0, 0), 'y', es)).toEqual([
      { key: 'printable', from: 1.5, to: 28.7, kind: 'printable', label: 'Área imprimible' },
    ]);
  });

  it('convierte las unidades declaradas (pt) a cm', () => {
    const custom = page();
    custom.margins = { ...custom.margins, left: { value: 72, unit: 'pt' } };
    expect(pageRulerSegments(custom, 'x', es)[0]).toMatchObject({ from: 2.54, to: 19 });
  });
});
