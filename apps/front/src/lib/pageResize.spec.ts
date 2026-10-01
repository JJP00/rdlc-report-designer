import { describe, expect, it } from 'vitest';
import {
  bandHeightFrom,
  clampMargin,
  formatCm,
  marginFromPointer,
  pageRulerSegments,
  sectionWidthFrom,
  snapCm,
} from './pageResize';

/**
 * U10 · matemática del redimensionado de página: alto de bandas (encabezado,
 * cuerpo y pie), ancho de sección y márgenes, con imán de 0,1 cm y los límites
 * del dominio (bandas ≥ 0, sección ≥ 1 cm, contenido ≥ 1 cm entre márgenes).
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
    expect(bandHeightFrom(2.5, 0.07, 0)).toBe(2.57);
  });

  it('sectionWidthFrom limita la sección a [1 cm, ancho del papel]', () => {
    expect(sectionWidthFrom(19, -0.96, 21)).toBe(18);
    expect(sectionWidthFrom(19, -25, 21)).toBe(1);
    expect(sectionWidthFrom(19, 5, 21)).toBe(21);
    expect(sectionWidthFrom(19, 0.03, 21)).toBe(19);
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
    expect(pageRulerSegments(page(), 'x')).toEqual([
      { key: 'printable', from: 2, to: 19, kind: 'printable', label: 'Área imprimible' },
    ]);
  });

  it('la regla vertical añade el encabezado y el pie (anclados a sus bordes)', () => {
    expect(pageRulerSegments(page(3, 4), 'y')).toEqual([
      { key: 'printable', from: 1.5, to: 28.7, kind: 'printable', label: 'Área imprimible' },
      { key: 'header', from: 1.5, to: 4.5, kind: 'band', label: 'Encabezado' },
      { key: 'footer', from: 24.7, to: 28.7, kind: 'band', label: 'Pie' },
    ]);
  });

  it('las bandas a 0 no se pintan', () => {
    expect(pageRulerSegments(page(0, 0), 'y')).toEqual([
      { key: 'printable', from: 1.5, to: 28.7, kind: 'printable', label: 'Área imprimible' },
    ]);
  });

  it('convierte las unidades declaradas (pt) a cm', () => {
    const custom = page();
    custom.margins = { ...custom.margins, left: { value: 72, unit: 'pt' } };
    expect(pageRulerSegments(custom, 'x')[0]).toMatchObject({ from: 2.54, to: 19 });
  });
});
