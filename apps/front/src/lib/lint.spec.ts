import type { LintFindingDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { countLintSeverities, lintMessage, sortLintFindings } from './lint';

/** Traductor de prueba: solo conoce dos reglas con parámetros ICU simples. */
const fakeTranslate = (
  key: string,
  params?: Record<string, string | number>,
): string | undefined => {
  const messages: Record<string, string> = {
    'lint.rule.unknownField': 'Campo «{field}» inexistente.',
    'lint.rule.unbalancedBracket': 'Paréntesis «{char}» en {index}.',
  };
  const template = messages[key];
  if (template === undefined) return undefined;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''));
};

describe('sortLintFindings', () => {
  it('ordena por severidad y conserva el orden dentro de cada una', () => {
    const findings: LintFindingDto[] = [
      { rule: 'imageNotBCPattern', severity: 'hint' },
      { rule: 'fontNotInBC', severity: 'warning', itemId: 'a' },
      { rule: 'unknownField', severity: 'error', itemId: 'b' },
      { rule: 'unbalancedBracket', severity: 'error', itemId: 'c' },
      { rule: 'fontNotInBC', severity: 'warning', itemId: 'd' },
    ];
    expect(sortLintFindings(findings).map((f) => f.itemId ?? f.rule)).toEqual([
      'b',
      'c',
      'a',
      'd',
      'imageNotBCPattern',
    ]);
  });
});

describe('countLintSeverities', () => {
  it('cuenta cada severidad (lista vacía = ceros)', () => {
    expect(countLintSeverities([])).toEqual({ error: 0, warning: 0, hint: 0 });
    expect(
      countLintSeverities([
        { rule: 'a', severity: 'error' },
        { rule: 'b', severity: 'error' },
        { rule: 'c', severity: 'hint' },
      ]),
    ).toEqual({ error: 2, warning: 0, hint: 1 });
  });
});

describe('lintMessage', () => {
  it('traduce la regla con sus parámetros', () => {
    const finding: LintFindingDto = {
      rule: 'unknownField',
      severity: 'error',
      params: { field: 'Cliente' },
    };
    expect(lintMessage(finding, fakeTranslate)).toBe('Campo «Cliente» inexistente.');
  });

  it('muestra el código de la regla si no hay traducción', () => {
    const finding: LintFindingDto = { rule: 'regla_nueva', severity: 'warning' };
    expect(lintMessage(finding, fakeTranslate)).toBe('regla_nueva');
  });

  it('no lanza si el traductor falla', () => {
    const finding: LintFindingDto = { rule: 'unknownField', severity: 'error' };
    const throwing = (): string => {
      throw new Error('missing value');
    };
    expect(lintMessage(finding, throwing)).toBe('unknownField');
  });
});
