import { describe, expect, it } from 'vitest';
import {
  INITIAL_PANEL_LAYOUT,
  PANEL_LIMITS,
  clampPanelSize,
  parsePanelLayout,
  serializePanelLayout,
} from './panelLayout';

describe('panelLayout · límites', () => {
  it('ajusta el tamaño a los límites del panel', () => {
    expect(clampPanelSize('inspector', 100, 320)).toBe(PANEL_LIMITS.inspector.min);
    expect(clampPanelSize('inspector', 5000, 320)).toBe(PANEL_LIMITS.inspector.max);
    expect(clampPanelSize('inspector', 400.4, 320)).toBe(400);
  });

  it('no crece más que el sitio que le queda al lienzo', () => {
    // 320 + 50 de hueco: como mucho 370, aunque el máximo del panel sea mayor.
    expect(clampPanelSize('inspector', 600, 320, 50)).toBe(370);
    // Encoger siempre se puede (hasta el mínimo), quede el hueco que quede.
    expect(clampPanelSize('inspector', 290, 320, 0)).toBe(290);
    // Sin hueco y por debajo del mínimo (ventana estrecha): el mínimo manda.
    expect(clampPanelSize('hierarchy', 150, 200, 0)).toBe(PANEL_LIMITS.hierarchy.min);
  });
});

describe('panelLayout · guardado', () => {
  it('vuelve a leer lo que guarda', () => {
    const layout = {
      sizes: { hierarchy: 300, variables: 260, inspector: 480, problems: 180 },
      problemsSized: true,
      inspectorCollapsed: true,
    };
    expect(parsePanelLayout(serializePanelLayout(layout))).toEqual(layout);
  });

  it('lo que falta o no vale vuelve al valor inicial', () => {
    expect(parsePanelLayout(null)).toEqual(INITIAL_PANEL_LAYOUT);
    expect(parsePanelLayout('no es json')).toEqual(INITIAL_PANEL_LAYOUT);
    expect(parsePanelLayout('[]').sizes).toEqual(INITIAL_PANEL_LAYOUT.sizes);
    const partial = parsePanelLayout('{"sizes":{"inspector":"ancho","hierarchy":9999}}');
    expect(partial.sizes.inspector).toBe(PANEL_LIMITS.inspector.initial);
    expect(partial.sizes.hierarchy).toBe(PANEL_LIMITS.hierarchy.max);
    expect(partial.inspectorCollapsed).toBe(false);
  });
});
