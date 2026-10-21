/**
 * Todo `reason` del dominio tiene mensaje en los catálogos EN y ES
 * (`errors.<reason>`) y un fallback por código (`errors.fallback.<code>`).
 *
 * Es la red que evita que un error llegue a la UI sin traducción; el formato
 * ICU y la sustitución de parámetros de cada mensaje los verifica además
 * `packages/i18n` (`parity.spec.ts`).
 */
import { describe, expect, it } from 'vitest';
import { en, es, lookup, type CatalogShape } from '@rdlc-designer/i18n';
import { ERROR_CODES } from '@rdlc-designer/contracts';
import { ERROR_REASONS } from '../../src/shared/errorReasons.js';

const asCatalog = (catalog: unknown): CatalogShape<object> => catalog as CatalogShape<object>;

describe('motivos de error ↔ catálogos', () => {
  it('todo reason tiene mensaje en EN y ES', () => {
    const missing = ERROR_REASONS.filter(
      (reason) =>
        lookup(asCatalog(en), `errors.${reason}`) === undefined ||
        lookup(asCatalog(es), `errors.${reason}`) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('todo código tiene fallback en EN y ES', () => {
    const missing = ERROR_CODES.filter(
      (code) =>
        lookup(asCatalog(en), `errors.fallback.${code}`) === undefined ||
        lookup(asCatalog(es), `errors.fallback.${code}`) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('no hay claves de error sobrantes para los reasons declarados', () => {
    // Las claves de `errors` (salvo `fallback`) deben ser motivos declarados.
    const declared = new Set<string>(ERROR_REASONS);
    const extra = Object.keys(en.errors)
      .filter((key) => key !== 'fallback')
      .filter((key) => !declared.has(key));
    expect(extra).toEqual([]);
  });
});
