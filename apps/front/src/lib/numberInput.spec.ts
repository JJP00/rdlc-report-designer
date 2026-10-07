import { describe, expect, it } from 'vitest';
import { parseNumberDraft } from './numberInput';

describe('parseNumberDraft (BUG-44)', () => {
  it('acepta enteros y decimales con coma o punto', () => {
    expect(parseNumberDraft('12')).toBe(12);
    expect(parseNumberDraft('1.5')).toBe(1.5);
    expect(parseNumberDraft('1,5')).toBe(1.5);
    expect(parseNumberDraft('.5')).toBe(0.5);
    expect(parseNumberDraft('-2,25')).toBe(-2.25);
    expect(parseNumberDraft('  3  ')).toBe(3);
  });

  it('rechaza texto con basura (parseFloat aceptaría la cola)', () => {
    expect(parseNumberDraft('12abc')).toBeUndefined();
    expect(parseNumberDraft('1 2')).toBeUndefined();
    expect(parseNumberDraft('')).toBeUndefined();
    expect(parseNumberDraft('-')).toBeUndefined();
  });

  it('interpreta separadores de miles sin truncar («1.234,5»)', () => {
    expect(parseNumberDraft('1.234,5')).toBe(1234.5);
    expect(parseNumberDraft('1,234.5')).toBe(1234.5);
    expect(parseNumberDraft('1.234.567,8')).toBe(1234567.8);
  });

  it('rechaza separadores ambiguos en vez de adivinar', () => {
    expect(parseNumberDraft('1,2,3')).toBeUndefined();
    expect(parseNumberDraft('1.2.3')).toBeUndefined();
  });
});
