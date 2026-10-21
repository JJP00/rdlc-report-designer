import { describe, expect, it } from 'vitest';
import { createTranslator, createTranslatorFor } from './translate.js';

describe('createTranslator', () => {
  it('traduce una clave simple en ambos idiomas', () => {
    expect(createTranslator('es').t('common.cancel')).toBe('Cancelar');
    expect(createTranslator('en').t('common.cancel')).toBe('Cancel');
  });

  it('el formateo ICU se aplica en el pseudo-idioma', () => {
    expect(createTranslator('qps-ploc').tUnsafe('common.cancel')).toBeDefined();
  });

  it('devuelve la clave y avisa cuando no existe', () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      // @ts-expect-error — clave inexistente a propósito.
      expect(createTranslator('es').t('no.existe.esta.clave')).toBe('no.existe.esta.clave');
    } finally {
      console.error = original;
    }
    expect(errors.length).toBe(1);
  });

  it('has/tUnsafe para claves dinámicas', () => {
    const es = createTranslator('es');
    expect(es.has('common.cancel')).toBe(true);
    expect(es.has('common.noExiste')).toBe(false);
    expect(es.tUnsafe('common.noExiste')).toBeUndefined();
  });
});

describe('createTranslatorFor', () => {
  it('normaliza etiquetas BCP 47', () => {
    expect(createTranslatorFor('es-ES').locale).toBe('es');
    expect(createTranslatorFor('es_MX').locale).toBe('es');
    expect(createTranslatorFor('en-US').locale).toBe('en');
  });

  it('cae a EN con idiomas no soportados o vacíos', () => {
    expect(createTranslatorFor('de-DE').locale).toBe('en');
    expect(createTranslatorFor(undefined).locale).toBe('en');
    expect(createTranslatorFor('').locale).toBe('en');
  });

  it('reconoce el pseudo-idioma de desarrollo', () => {
    expect(createTranslatorFor('qps-ploc').locale).toBe('qps-ploc');
  });
});
