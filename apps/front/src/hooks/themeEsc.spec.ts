import { describe, expect, it } from 'vitest';
import { focusActiveTab, isTextEditingTarget, shouldLeaveCanvas } from './canvasA11y';
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

describe('isTextEditingTarget', () => {
  /** Elemento mínimo: `insideMonaco` simula `closest('.monaco-editor')`. */
  const el = (tagName: string, opts: { editable?: boolean; insideMonaco?: boolean } = {}) =>
    ({
      tagName,
      isContentEditable: opts.editable ?? false,
      closest: (selector: string) =>
        selector === '.monaco-editor' && opts.insideMonaco ? {} : null,
    }) as unknown as HTMLElement;

  it('campos nativos y contenteditable son texto', () => {
    expect(isTextEditingTarget(el('INPUT'))).toBe(true);
    expect(isTextEditingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTextEditingTarget(el('SELECT'))).toBe(true);
    expect(isTextEditingTarget(el('DIV', { editable: true }))).toBe(true);
  });

  it('el EditContext de Monaco (div sin contenteditable) es texto: Ctrl+C/V son suyos', () => {
    expect(isTextEditingTarget(el('DIV', { insideMonaco: true }))).toBe(true);
  });

  it('el lienzo y los botones no son texto', () => {
    expect(isTextEditingTarget(el('DIV'))).toBe(false);
    expect(isTextEditingTarget(el('BUTTON'))).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });
});
