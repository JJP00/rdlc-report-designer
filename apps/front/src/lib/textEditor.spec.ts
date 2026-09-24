import { describe, expect, it } from 'vitest';
import type { ParagraphDto } from '@rdlc-designer/contracts';
import {
  addParagraph,
  addRun,
  duplicateParagraph,
  duplicateRun,
  isExpressionRun,
  isSimpleText,
  moveParagraph,
  moveRun,
  newRun,
  paragraphIndexAt,
  paragraphsToText,
  removeParagraph,
  removeRun,
  setRunStyle,
  textToParagraphs,
  toggleRunKind,
  updateRun,
} from './textEditor';

const BASE: ParagraphDto[] = [
  {
    runs: [
      { value: 'IVA: ' },
      { value: '=Fields!X.Value', label: 'X', style: { fontWeight: 'Bold', color: '#FF0000' } },
    ],
  },
];

describe('textEditor · runs', () => {
  it('distingue expresión y texto, y el textbox simple', () => {
    expect(isExpressionRun({ value: '=Fields!X.Value' })).toBe(true);
    expect(isExpressionRun({ value: 'hola' })).toBe(false);
    expect(isSimpleText(BASE)).toBe(false);
    expect(isSimpleText([{ runs: [{ value: 'hola' }] }])).toBe(true);
    expect(isSimpleText([])).toBe(true);
  });

  it('el run nuevo hereda el formato del vecino', () => {
    expect(newRun('expression', { value: 'x', style: { fontWeight: 'Bold' } })).toEqual({
      value: '=',
      style: { fontWeight: 'Bold' },
    });
    expect(newRun('text')).toEqual({ value: '' });
  });

  it('añade, duplica, mueve y borra runs', () => {
    const added = addRun(BASE, 0, 'expression');
    expect(added[0]!.runs).toHaveLength(3);
    expect(added[0]!.runs[2]).toEqual({
      value: '=',
      style: { fontWeight: 'Bold', color: '#FF0000' },
    });

    const duplicated = duplicateRun(BASE, 0, 1);
    expect(duplicated[0]!.runs).toHaveLength(3);
    expect(duplicated[0]!.runs[2]!.value).toBe('=Fields!X.Value');
    // El estilo se clona (no se comparte la referencia).
    expect(duplicated[0]!.runs[2]!.style).not.toBe(BASE[0]!.runs[1]!.style);

    expect(moveRun(BASE, 0, 1, -1)[0]!.runs[0]!.value).toBe('=Fields!X.Value');
    expect(moveRun(BASE, 0, 0, -1)).toBe(BASE);

    expect(removeRun(BASE, 0, 0)[0]!.runs).toHaveLength(1);
    // No se puede dejar un párrafo sin runs (el XSD lo exige).
    expect(removeRun([{ runs: [{ value: 'solo' }] }], 0, 0)[0]!.runs).toHaveLength(1);
  });

  it('alterna texto ↔ expresión conservando el valor', () => {
    const toExpression = toggleRunKind(BASE, 0, 0);
    expect(toExpression[0]!.runs[0]!.value).toBe('=IVA: ');
    const back = toggleRunKind(toExpression, 0, 0);
    expect(back[0]!.runs[0]!.value).toBe('IVA: ');
  });

  it('actualiza valor, etiqueta y estilo del run', () => {
    const updated = updateRun(BASE, 0, 0, { value: 'Total: ' });
    expect(updated[0]!.runs[0]!.value).toBe('Total: ');
    // La etiqueta (`<Label>` de BC) también se edita; vacío la quita.
    expect(updateRun(BASE, 0, 1, { label: 'Nuevo' })[0]!.runs[1]!.label).toBe('Nuevo');
    expect(updateRun(BASE, 0, 1, { label: undefined })[0]!.runs[1]!.label).toBeUndefined();
    const styled = setRunStyle(BASE, 0, 0, { fontStyle: 'Italic' });
    expect(styled[0]!.runs[0]!.style).toEqual({ fontStyle: 'Italic' });
    // El estilo existente se fusiona.
    expect(setRunStyle(BASE, 0, 1, { color: '#00FF00' })[0]!.runs[1]!.style).toEqual({
      fontWeight: 'Bold',
      color: '#00FF00',
    });
    // Un valor vacío quita la propiedad (heredar del nivel superior).
    expect(setRunStyle(BASE, 0, 1, { fontWeight: '' } as never)[0]!.runs[1]!.style).toEqual({
      color: '#FF0000',
    });
  });
});

describe('textEditor · documento ↔ texto', () => {
  it('la expresión con etiqueta se muestra en el textarea por su etiqueta', () => {
    expect(paragraphsToText(BASE)).toBe('IVA: ⟨X⟩');
    // Sin etiqueta se muestra la expresión.
    expect(paragraphsToText([{ runs: [{ value: '=Fields!Y.Value' }] }])).toBe('⟨=Fields!Y.Value⟩');
  });

  it('parsea de vuelta conservando expresión, etiqueta y formato (round-trip)', () => {
    const parsed = textToParagraphs(paragraphsToText(BASE), BASE);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.runs).toHaveLength(2);
    expect(parsed[0]!.runs[0]).toEqual({ value: 'IVA: ' });
    expect(parsed[0]!.runs[1]!.value).toBe('=Fields!X.Value');
    expect(parsed[0]!.runs[1]!.label).toBe('X');
    expect(parsed[0]!.runs[1]!.style).toEqual({ fontWeight: 'Bold', color: '#FF0000' });
  });

  it('acepta la expresión en el marcador aunque el run tenga etiqueta', () => {
    const parsed = textToParagraphs('IVA: ⟨=Fields!X.Value⟩', BASE);
    expect(parsed[0]!.runs[1]!.label).toBe('X');
  });

  it('un marcador escrito a mano se convierte en expresión', () => {
    const parsed = textToParagraphs('Hola ⟨=Fields!Y.Value⟩ fin', []);
    expect(parsed[0]!.runs.map((run) => run.value)).toEqual(['Hola ', '=Fields!Y.Value', ' fin']);
  });

  it('un marcador que no es expresión ni etiqueta conocida queda como texto', () => {
    const parsed = textToParagraphs('Total ⟨21%⟩ aplicado', []);
    expect(parsed[0]!.runs.map((run) => run.value)).toEqual(['Total ', '21%', ' aplicado']);
  });

  it('las líneas vacías son párrafos con un run vacío', () => {
    const parsed = textToParagraphs('a\n\nb', []);
    expect(parsed).toHaveLength(3);
    expect(parsed[1]!.runs).toEqual([{ value: '' }]);
  });

  it('los runs nuevos heredan el formato del run anterior del párrafo', () => {
    const previous: ParagraphDto[] = [
      {
        runs: [{ value: 'IVA: ' }, { value: '=Fields!X.Value', style: { fontWeight: 'Bold' } }],
      },
    ];
    // El usuario escribe " total" al final de la línea con la expresión.
    const parsed = textToParagraphs('IVA: ⟨=Fields!X.Value⟩ total', previous);
    expect(parsed[0]!.runs).toHaveLength(3);
    expect(parsed[0]!.runs[2]!.value).toBe(' total');
    expect(parsed[0]!.runs[2]!.style).toEqual({ fontWeight: 'Bold' });
  });

  it('un marcador sin cerrar queda como texto', () => {
    const parsed = textToParagraphs('⟨=Fields!X.Value', []);
    expect(parsed[0]!.runs.map((run) => run.value)).toEqual(['⟨=Fields!X.Value']);
  });

  it('localiza el párrafo del caret', () => {
    expect(paragraphIndexAt('a\nbb\nccc', 0)).toBe(0);
    expect(paragraphIndexAt('a\nbb\nccc', 2)).toBe(1);
    expect(paragraphIndexAt('a\nbb\nccc', 6)).toBe(2);
    expect(paragraphIndexAt('a\nbb\nccc', 99)).toBe(2);
  });
});

describe('textEditor · párrafos', () => {
  it('añade, duplica, mueve y borra párrafos', () => {
    expect(addParagraph(BASE)).toHaveLength(2);

    const duplicated = duplicateParagraph(BASE, 0);
    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]!.runs[1]!.label).toBe('X');

    const moved = moveParagraph(addParagraph(BASE), 0, 1);
    expect(moved).toHaveLength(2);
    expect(moveParagraph(BASE, 0, -1)).toBe(BASE);

    // Nunca se queda sin párrafos.
    expect(removeParagraph(BASE, 0)).toBe(BASE);
  });
});
