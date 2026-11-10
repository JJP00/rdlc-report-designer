import { describe, expect, it } from 'vitest';
import type { ParagraphDto } from '@rdlc-designer/contracts';
import {
  addParagraph,
  addRun,
  duplicateParagraph,
  duplicateRun,
  insertionPointAt,
  isExpressionRun,
  isSimpleText,
  markerRunAt,
  markerSpanAt,
  moveParagraph,
  moveRun,
  newRun,
  paragraphIndexAt,
  paragraphsToText,
  protectMarkers,
  removeParagraph,
  removeRun,
  setRunStyle,
  splitMarkers,
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

describe('textEditor · resaltado de marcadores', () => {
  const join = (line: string): string =>
    splitMarkers(line)
      .map((part) => part.text)
      .join('');

  it('separa texto y marcadores sin perder un carácter', () => {
    const line = 'IVA: ⟨X⟩ al ⟨=Fields!Pct.Value⟩%';
    expect(splitMarkers(line)).toEqual([
      { text: 'IVA: ', marker: false },
      { text: '⟨X⟩', marker: true },
      { text: ' al ', marker: false },
      { text: '⟨=Fields!Pct.Value⟩', marker: true },
      { text: '%', marker: false },
    ]);
    expect(join(line)).toBe(line);
  });

  it('marca lo mismo que textToParagraphs convierte en run', () => {
    // Sin cerrar: texto. Vacío: no es run. Un `⟨` dentro: llega hasta el primer `⟩`.
    expect(splitMarkers('⟨=Fields!X.Value')).toEqual([{ text: '⟨=Fields!X.Value', marker: false }]);
    expect(splitMarkers('a⟨ ⟩b').map((part) => part.marker)).toEqual([false, false, false]);
    expect(splitMarkers('⟨a⟨b⟩c')).toEqual([
      { text: '⟨a⟨b⟩', marker: true },
      { text: 'c', marker: false },
    ]);
    expect(splitMarkers('')).toEqual([]);
  });
});

describe('textEditor · insertar un marcador', () => {
  it('no parte un marcador: dentro de ⟨…⟩ inserta detrás de su cierre', () => {
    const text = 'IVA ⟨X⟩\n⟨Fecha⟩ hoy';
    expect(insertionPointAt(text, 0)).toBe(0);
    expect(insertionPointAt(text, 4)).toBe(4); // justo antes de ⟨X⟩
    expect(insertionPointAt(text, 5)).toBe(7); // entre ⟨ y X
    expect(insertionPointAt(text, 7)).toBe(7); // justo detrás de ⟩
    expect(insertionPointAt(text, 11)).toBe(15); // dentro de ⟨Fecha⟩, línea 2
    expect(insertionPointAt(text, text.length)).toBe(text.length);
  });

  it('un ⟨ sin cerrar no desplaza el caret', () => {
    expect(insertionPointAt('a ⟨b', 3)).toBe(3);
  });
});

describe('textEditor · expresiones atómicas', () => {
  // `IVA: ⟨X⟩` + `⟨=Fields!Y.Value⟩ fin`: el marcador X ocupa [5, 8).
  const text = 'IVA: ⟨X⟩\n⟨=Fields!Y.Value⟩ fin';
  const paragraphs = textToParagraphs(text, BASE);

  it('el caret solo está en un marcador por dentro, no en sus bordes', () => {
    expect(markerSpanAt(text, 5)).toBeNull();
    expect(markerSpanAt(text, 6)).toEqual({ start: 5, end: 8 });
    expect(markerSpanAt(text, 8)).toBeNull();
    expect(markerSpanAt('a⟨ ⟩b', 2)).toBeNull(); // vacío: no es run
  });

  it('localiza el run de la expresión clicada', () => {
    expect(markerRunAt(text, 6, paragraphs)).toEqual({
      paragraph: 0,
      run: 1,
      span: { start: 5, end: 8 },
    });
    expect(markerRunAt(text, 12, paragraphs)?.paragraph).toBe(1);
    expect(markerRunAt(text, 12, paragraphs)?.run).toBe(0);
    expect(markerRunAt(text, 2, paragraphs)).toBeNull();
  });

  it('cuenta los runs del párrafo aunque dos runs de texto vayan seguidos', () => {
    const runs: ParagraphDto[] = [
      { runs: [{ value: 'a' }, { value: 'b' }, { value: '=Fields!X.Value', label: 'X' }] },
    ];
    expect(markerRunAt('ab⟨X⟩', 3, runs)?.run).toBe(2);
  });

  it('borrar un trozo de un marcador lo quita entero', () => {
    // Retroceso justo detrás de `⟩`.
    expect(protectMarkers('IVA: ⟨X⟩ fin', 'IVA: ⟨X fin', 7)).toEqual({
      text: 'IVA:  fin',
      caret: 5,
      changed: true,
    });
    // Supr justo delante de `⟨`.
    expect(protectMarkers('IVA: ⟨X⟩', 'IVA: X⟩', 5).text).toBe('IVA: ');
    // Una selección que pisa medio marcador, reemplazada por «Z».
    expect(protectMarkers('ab⟨XY⟩c', 'aZY⟩c', 2).text).toBe('aZc');
  });

  it('escribir o pegar dentro de un marcador va detrás de él', () => {
    expect(protectMarkers('a⟨XY⟩b', 'a⟨XzY⟩b', 4)).toEqual({
      text: 'a⟨XY⟩zb',
      caret: 6,
      changed: true,
    });
  });

  it('no toca lo que no roza un marcador', () => {
    expect(protectMarkers('a⟨X⟩b', 'a⟨X⟩bc', 6)).toEqual({
      text: 'a⟨X⟩bc',
      caret: 6,
      changed: false,
    });
    expect(protectMarkers('a⟨X⟩b', 'z⟨X⟩b', 1).changed).toBe(false);
    // Borrar un marcador entero (selección exacta) ya es válido.
    expect(protectMarkers('a⟨X⟩b', 'ab', 1).changed).toBe(false);
    // Escribir el cierre de un marcador nuevo.
    expect(protectMarkers('⟨=Fields!T.Value', '⟨=Fields!T.Value⟩', 17).changed).toBe(false);
  });
});
