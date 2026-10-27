import { describe, expect, it } from 'vitest';
import {
  findUnbalancedBrackets,
  findUnbalancedBracketsInCode,
  lintBracketsInExpression,
  lintUnbalancedBrackets,
} from '../../../src/domain/lint/rules/unbalancedBrackets.js';
import { reportRoot, textbox } from './support.js';

/**
 * Regla `unbalancedBracket`: paréntesis, corchetes y llaves desemparejados
 * en expresiones VB y en el `<Code>` del informe. Las cadenas `"…"` (con
 * `""` escapada) y los comentarios `'` no cuentan.
 */

describe('findUnbalancedBrackets', () => {
  it('no encuentra nada en una expresión equilibrada', () => {
    expect(findUnbalancedBrackets('=Format((Fields!Amount.Value * 2), "N2")')).toEqual([]);
    expect(findUnbalancedBrackets('=Fields!Name.Value & {[x]}')).toEqual([]);
  });

  it('reporta paréntesis, corchetes y llaves sin cerrar', () => {
    expect(findUnbalancedBrackets('=Round((1 + 2')).toEqual([
      { kind: 'unclosed', char: '(', index: 6 },
      { kind: 'unclosed', char: '(', index: 7 },
    ]);
    expect(findUnbalancedBrackets('=Fields![Name')).toEqual([
      { kind: 'unclosed', char: '[', index: 8 },
    ]);
    expect(findUnbalancedBrackets('={a')).toEqual([{ kind: 'unclosed', char: '{', index: 1 }]);
  });

  it('reporta un cierre sin apertura como unexpected', () => {
    expect(findUnbalancedBrackets('=1 + 2)')).toEqual([
      { kind: 'unexpected', char: ')', index: 6 },
    ]);
  });

  it('detecta el orden incorrecto de cierre', () => {
    // `)` no cierra el `[` más reciente: es inesperado, y `(` queda abierto.
    // Los hallazgos salen ordenados por índice.
    expect(findUnbalancedBrackets('=([)]')).toEqual([
      { kind: 'unclosed', char: '(', index: 1 },
      { kind: 'unexpected', char: ')', index: 3 },
    ]);
  });

  it('trata "" dentro de una cadena como comilla escapada', () => {
    // La cadena es `di "hola" (` y se cierra con la última comilla.
    expect(findUnbalancedBrackets('="di ""hola"" (" & x')).toEqual([]);
    // La cadena es `a"(b`; el `(x)` posterior está equilibrado.
    expect(findUnbalancedBrackets('="a""(b" & (x)')).toEqual([]);
  });

  it('ignora los corchetes dentro de una cadena', () => {
    expect(findUnbalancedBrackets('="(((" & Fields!A.Value')).toEqual([]);
  });

  it('reporta una cadena sin cerrar como unclosed "', () => {
    expect(findUnbalancedBrackets('="abc')).toEqual([
      { kind: 'unclosed', char: '"', index: 1 },
    ]);
  });

  it('un comentario ' + "'" + ' ignora el resto de la línea, incluidos corchetes', () => {
    expect(findUnbalancedBrackets("=1 + 2 ' ((( ]]]")).toEqual([]);
    expect(findUnbalancedBrackets("=1 + (2 ' cierra ya\n + 3)")).toEqual([]);
  });
});

describe('lintBracketsInExpression', () => {
  it('convierte los desemparejados en hallazgos error con params', () => {
    expect(
      lintBracketsInExpression('=Round((1', { itemId: 'Textbox5', location: 'Value' }),
    ).toEqual([
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'Textbox5',
        location: 'Value',
        params: { char: '(', index: 6 },
      },
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'Textbox5',
        location: 'Value',
        params: { char: '(', index: 7 },
      },
    ]);
  });

  it('omite itemId cuando el contexto no lo trae', () => {
    const [finding] = lintBracketsInExpression('=(', { location: 'Code' });
    expect(finding).toBeDefined();
    expect(finding).not.toHaveProperty('itemId');
    expect(finding?.location).toBe('Code');
  });

  it('no analiza texto plano: sin "=" no hay hallazgos', () => {
    expect(lintBracketsInExpression("Customer's (VAT", { location: 'Value' })).toEqual([]);
    expect(lintBracketsInExpression('  Texto (suelto', { location: 'Value' })).toEqual([]);
  });

  it('acepta el "=" precedido de espacios', () => {
    expect(lintBracketsInExpression('   =(1', { location: 'Value' })).toHaveLength(1);
  });
});

describe('findUnbalancedBracketsInCode', () => {
  it('analiza un <Code> de varias líneas con comentarios por línea', () => {
    const code = [
      'Function Total(a As Decimal) As Decimal',
      "    ' cálculo ((( de prueba",
      '    Total = (a * 2',
      'End Function',
    ].join('\n');
    expect(findUnbalancedBracketsInCode(code)).toEqual([
      { kind: 'unclosed', char: '(', index: code.indexOf('(a * 2') },
    ]);
  });

  it('un <Code> equilibrado no produce hallazgos', () => {
    const code = [
      'Function F(x As Integer) As String',
      '    F = Format(x, "0") & "(" & ")"',
      'End Function',
    ].join('\n');
    expect(findUnbalancedBracketsInCode(code)).toEqual([]);
  });

  it('una cadena que no cierra en su línea no traga el resto del código', () => {
    const code = 'x = "abc\ny = (1';
    expect(findUnbalancedBracketsInCode(code)).toEqual([
      { kind: 'unclosed', char: '"', index: 4 },
      { kind: 'unclosed', char: '(', index: code.indexOf('(1') },
    ]);
  });
});

describe('lintUnbalancedBrackets', () => {
  it('reporta las expresiones de cualquier elemento con el item más cercano', () => {
    const root = reportRoot({
      items: `<Tablix Name="TX"><TablixBody/><TablixRowHierarchy><TablixMembers><TablixMember><Visibility><Hidden>=IsNothing((1</Hidden></Visibility></TablixMember></TablixMembers></TablixRowHierarchy></Tablix>`,
    });
    expect(lintUnbalancedBrackets(root)).toEqual([
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'TX',
        location: 'Hidden',
        params: { char: '(', index: 10 },
      },
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'TX',
        location: 'Hidden',
        params: { char: '(', index: 11 },
      },
    ]);
  });

  it('ignora el texto plano que no empieza por =', () => {
    const root = reportRoot({ items: textbox('T1', 'texto (suelto') });
    expect(lintUnbalancedBrackets(root)).toEqual([]);
  });

  it('analiza el bloque Code del informe sin itemId', () => {
    const root = reportRoot({ code: 'Public Function F()\r\n  Return (1\r\nEnd Function' });
    expect(lintUnbalancedBrackets(root)).toEqual([
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        location: 'Code',
        params: { char: '(', index: 30 },
      },
    ]);
  });
});
