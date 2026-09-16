import { describe, expect, it } from 'vitest';
import { runDisplayText } from './text';

/** Texto que el diseñador pinta en el lienzo para cada run. */

describe('runDisplayText', () => {
  it('texto plano se muestra tal cual', () => {
    expect(runDisplayText({ value: ':' })).toBe(':');
    expect(runDisplayText({ value: 'Total: ' })).toBe('Total: ');
  });

  it('una referencia simple a un campo muestra el nombre del campo', () => {
    expect(runDisplayText({ value: '=Fields!BTCDescriptionLbl.Value' })).toBe('BTCDescriptionLbl');
    expect(runDisplayText({ value: '=Fields!Item_No.Value' })).toBe('Item_No');
    // Tolerante a espacios y a `.Value` omitido.
    expect(runDisplayText({ value: '= Fields!ItemNo .Value' })).toBe('ItemNo');
    expect(runDisplayText({ value: '=Fields!ItemNo' })).toBe('ItemNo');
  });

  it('las expresiones complejas se resumen como [exp]', () => {
    expect(runDisplayText({ value: '=Sum(Fields!Amount.Value)' })).toBe('[exp]');
    expect(runDisplayText({ value: '=IIf(Fields!Qty.Value < 1, "", "x")' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Fields!A.Value & " " & Fields!B.Value' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Parameters!Company.Value' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Code.BlankZero(Fields!Tot.Value)' })).toBe('[exp]');
    expect(runDisplayText({ value: '=Globals!PageNumber' })).toBe('[exp]');
  });

  it('el <Label> del run manda sobre la expresión (como BC)', () => {
    expect(runDisplayText({ value: '=Fields!BTCDescriptionLbl.Value', label: 'BTCDescriptionLbl' })).toBe(
      '[BTCDescriptionLbl]',
    );
    expect(runDisplayText({ value: '=IIf(1, "a", "b")', label: 'Descripción' })).toBe('[Descripción]');
    expect(runDisplayText({ value: 'Total:', label: 'Total' })).toBe('[Total]');
  });
});
