import type { TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  edgeReadingId,
  formatCmEs,
  insertDestinationLabel,
  nextReadingId,
  selectionAnnouncement,
} from './canvasA11y';

const textbox = (id: string, left: number, top: number): TextboxDto => ({
  kind: 'textbox',
  id,
  left: { value: left, unit: 'cm' },
  top: { value: top, unit: 'cm' },
  width: { value: 5, unit: 'cm' },
  height: { value: 1, unit: 'cm' },
  paragraphs: [{ runs: [{ value: 'x' }] }],
});

describe('formatCmEs', () => {
  it('usa coma decimal y dos decimales', () => {
    expect(formatCmEs(2)).toBe('2,00 cm');
    expect(formatCmEs(3.4)).toBe('3,40 cm');
    expect(formatCmEs(3.456)).toBe('3,46 cm');
  });

  it('acepta otras unidades a través de la proyección', () => {
    const inches: TextboxDto = {
      ...textbox('Textbox1', 0, 0),
      left: { value: 1, unit: 'in' },
    };
    // 1 in = 2,54 cm
    expect(selectionAnnouncement(inches)).toBe('Textbox1, x 2,54 cm, y 0,00 cm');
  });
});

describe('selectionAnnouncement', () => {
  it('anuncia el nombre y la posición en cm', () => {
    expect(selectionAnnouncement(textbox('Textbox2', 2, 3.4))).toBe(
      'Textbox2, x 2,00 cm, y 3,40 cm',
    );
  });
});

describe('nextReadingId', () => {
  const ids = ['a', 'b', 'c'];

  it('avanza y retrocede en el orden de lectura', () => {
    expect(nextReadingId(ids, 'a', 1)).toBe('b');
    expect(nextReadingId(ids, 'b', -1)).toBe('a');
  });

  it('en los bordes no hay destino: no se intercepta la tecla', () => {
    expect(nextReadingId(ids, 'c', 1)).toBeNull();
    expect(nextReadingId(ids, 'a', -1)).toBeNull();
  });

  it('sin selección, Tab entra por el primero y Shift+Tab no intercepta', () => {
    expect(nextReadingId(ids, null, 1)).toBe('a');
    expect(nextReadingId(ids, null, -1)).toBeNull();
  });

  it('con una selección que ya no existe, Tab entra por el primero', () => {
    expect(nextReadingId(ids, 'z', 1)).toBe('a');
    expect(nextReadingId(ids, 'z', -1)).toBeNull();
  });

  it('sin elementos no hay destino', () => {
    expect(nextReadingId([], 'a', 1)).toBeNull();
    expect(nextReadingId([], null, -1)).toBeNull();
  });
});

describe('edgeReadingId', () => {
  it('devuelve el primero o el último', () => {
    expect(edgeReadingId(['a', 'b', 'c'], 'first')).toBe('a');
    expect(edgeReadingId(['a', 'b', 'c'], 'last')).toBe('c');
  });

  it('sin elementos no hay destino', () => {
    expect(edgeReadingId([], 'first')).toBeNull();
    expect(edgeReadingId([], 'last')).toBeNull();
  });
});

describe('insertDestinationLabel', () => {
  it('etiqueta las celdas como la Jerarquía', () => {
    expect(insertDestinationLabel({ kind: 'tablixCell', id: 'Tablix1', row: 0, col: 1 })).toBe(
      'Celda 1,2',
    );
  });

  it('nombra las bandas y los contenedores para el mensaje', () => {
    expect(insertDestinationLabel({ kind: 'body' })).toBe('el cuerpo');
    expect(insertDestinationLabel({ kind: 'pageHeader' })).toBe('el encabezado de página');
    expect(insertDestinationLabel({ kind: 'pageFooter' })).toBe('el pie de página');
    expect(insertDestinationLabel({ kind: 'rectangle', id: 'Rectangle1' })).toBe(
      'el rectángulo Rectangle1',
    );
  });
});
