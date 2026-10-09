import { describe, expect, it } from 'vitest';
import { focusActiveTab, shouldLeaveCanvas } from './canvasA11y';
import { resolveTheme } from './useTheme';

const base = {
  key: 'Escape',
  defaultPrevented: false,
  hasSelection: false,
  inCanvas: true,
  typing: false,
  dialogOpen: false,
};

describe('resolveTheme', () => {
  it('usa el valor guardado por encima del sistema', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });
  it('sin valor guardado (o inválido) usa el esquema del sistema', () => {
    expect(resolveTheme(null, 'dark')).toBe('dark');
    expect(resolveTheme('x', 'light')).toBe('light');
  });
});

describe('shouldLeaveCanvas', () => {
  it('Esc en el lienzo sin selección sale', () => {
    expect(shouldLeaveCanvas(base)).toBe(true);
  });
  it.each([
    { key: 'Enter' },
    { hasSelection: true },
    { inCanvas: false },
    { typing: true },
    { dialogOpen: true },
    { defaultPrevented: true },
  ])('no sale con %o', (patch) => {
    expect(shouldLeaveCanvas({ ...base, ...patch })).toBe(false);
  });
});

describe('focusActiveTab', () => {
  it('false sin pestañas', () => {
    const root = { querySelector: () => null } as unknown as ParentNode;
    expect(focusActiveTab(root)).toBe(false);
  });
  it('enfoca la pestaña seleccionada', () => {
    let focused = false;
    const root = {
      querySelector: () => ({ focus: () => (focused = true) }),
    } as unknown as ParentNode;
    expect(focusActiveTab(root)).toBe(true);
    expect(focused).toBe(true);
  });
});
