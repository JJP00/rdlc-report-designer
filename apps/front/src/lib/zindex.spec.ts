import type { TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { sortByZIndex } from './projection';

/** Orden de pintado/hit-test: `ZIndex` manda y, a igualdad, el orden del XML. */

function box(id: string, zIndex?: number): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: { value: 0, unit: 'cm' },
    left: { value: 0, unit: 'cm' },
    width: { value: 1, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    paragraphs: [{ runs: [{ value: id }] }],
    ...(zIndex !== undefined ? { zIndex } : {}),
  };
}

describe('sortByZIndex', () => {
  it('pinta de menor a mayor ZIndex (el mayor queda encima)', () => {
    const ordered = sortByZIndex([box('C', 3), box('A', 1), box('B', 2)]);
    expect(ordered.map((item) => item.id)).toEqual(['A', 'B', 'C']);
  });

  it('los items sin ZIndex cuentan como 0', () => {
    const ordered = sortByZIndex([box('ConZ', 1), box('SinZ'), box('Negativo', -1)]);
    expect(ordered.map((item) => item.id)).toEqual(['Negativo', 'SinZ', 'ConZ']);
  });

  it('a igualdad de ZIndex conserva el orden del XML (estable)', () => {
    const ordered = sortByZIndex([box('Primero'), box('Segundo'), box('Tercero', 0)]);
    expect(ordered.map((item) => item.id)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('no muta la lista original', () => {
    const items = [box('B', 2), box('A', 1)];
    sortByZIndex(items);
    expect(items.map((item) => item.id)).toEqual(['B', 'A']);
  });
});
