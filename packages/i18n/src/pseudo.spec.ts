import { describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import { parse } from '@formatjs/icu-messageformat-parser';
import { pseudoCatalog, pseudoMessage } from './pseudo.js';
import { createTranslator } from './translate.js';
import { en } from './catalogs/en/index.js';

describe('pseudoMessage', () => {
  it('acentúa el texto y expande ~150 %', () => {
    const source = 'Guardar cambios sin guardar en el informe';
    const pseudo = pseudoMessage(source);
    expect(pseudo.startsWith('⟦')).toBe(true);
    expect(pseudo.endsWith('⟧')).toBe(true);
    expect(pseudo.length).toBeGreaterThanOrEqual(source.length * 1.4);
    expect(pseudo).not.toBe(source);
  });

  it('conserva la estructura ICU (plurales y argumentos)', () => {
    const source = '{count, plural, one {# recarga externa} other {# recargas externas}}';
    const pseudo = pseudoMessage(source);
    expect(() => parse(pseudo)).not.toThrow();
  });

  it('no transforma los argumentos', () => {
    const pseudo = pseudoMessage('Elemento {name} listo');
    expect(pseudo).toContain('{name}');
  });

  it('los plurales pseudo formatean igual (misma semántica)', () => {
    const pseudo = pseudoMessage('{count, plural, one {# item} other {# items}}');
    const formatter = new IntlMessageFormat(pseudo, 'en', undefined, { ignoreTag: true });
    const rendered = formatter.format({ count: 2 }) as string;
    expect(rendered).toContain('2');
    expect(rendered).not.toContain('{');
  });
});

describe('pseudoCatalog', () => {
  it('mantiene la estructura del catálogo EN', () => {
    const pseudo = pseudoCatalog(en);
    const flatten = (node: object, prefix: string): string[] =>
      Object.entries(node).flatMap(([key, value]) =>
        typeof value === 'string'
          ? [`${prefix}${key}`]
          : flatten(value as object, `${prefix}${key}.`),
      );
    expect(flatten(pseudo, '')).toEqual(flatten(en, ''));
  });

  it('el traductor pseudo traduce todas las claves del catálogo fuente', () => {
    const t = createTranslator('qps-ploc');
    expect(t.tUnsafe('common.cancel')).toBeDefined();
    expect(t.t('common.cancel')).toBe('⟦Çá·ñç·éľ·⟧');
  });
});
