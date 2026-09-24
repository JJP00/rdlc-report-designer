import { describe, expect, it } from 'vitest';
import { runDisplayText } from './text';

/**
 * Texto de diseño que el lienzo pinta para cada run: texto plano tal cual, la
 * etiqueta de BC entre corchetes si la expresión la tiene, el nombre del campo
 * si es una referencia simple y `[exp]` para el resto (las expresiones no se
 * evalúan en el diseñador).
 */

describe('runDisplayText', () => {
  it('texto plano se muestra tal cual', () => {
    expect(runDisplayText({ value: ':' })).toBe(':');
    expect(runDisplayText({ value: 'Total: ' })).toBe('Total: ');
    expect(runDisplayText({ value: 'Total: ', label: 'Total' })).toBe('Total: ');
  });

  it('una expresión con <Label> muestra la etiqueta entre corchetes (como BC)', () => {
    expect(
      runDisplayText({ value: '=Fields!BTCDescriptionLbl.Value', label: 'BTCDescriptionLbl' }),
    ).toBe('[BTCDescriptionLbl]');
    expect(runDisplayText({ value: '=IIf(1, "a", "b")', label: 'Descripción' })).toBe(
      '[Descripción]',
    );
    expect(runDisplayText({ value: '=Code.GetData(13, 1)', label: 'BTCMyCompanyName' })).toBe(
      '[BTCMyCompanyName]',
    );
    // La etiqueta manda sobre el nombre del campo simple.
    expect(runDisplayText({ value: '=Fields!ItemNo.Value', label: 'Nº' })).toBe('[Nº]');
  });

  it('una expresión simple de campo muestra el nombre del campo', () => {
    expect(runDisplayText({ value: '=Fields!BTCDescriptionLbl.Value' })).toBe('BTCDescriptionLbl');
    expect(runDisplayText({ value: '=Fields!Item_No.Value' })).toBe('Item_No');
    // Tolerante a espacios y a `.Value` omitido.
    expect(runDisplayText({ value: '= Fields!ItemNo .Value' })).toBe('ItemNo');
    expect(runDisplayText({ value: '=Fields!ItemNo' })).toBe('ItemNo');
  });

  it('el resto de expresiones se resumen como [exp]', () => {
    expect(runDisplayText({ value: '=Sum(Fields!Amount.Value)' })).toBe('[exp]');
    expect(runDisplayText({ value: '=IIf(Fields!Qty.Value < 1, "", "x")' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Code.BlankZero(Fields!Tot.Value)' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Globals!PageNumber' })).toBe('[exp]');
  });
});
