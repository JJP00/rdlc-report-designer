import { describe, expect, it } from 'vitest';
import {
  isLocale,
  normalizeLocale,
  resolveEffectiveLocale,
  resolvePreferredLocale,
} from './locale.js';

describe('normalizeLocale', () => {
  it('extrae el idioma de etiquetas BCP 47', () => {
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('es_MX')).toBe('es');
    expect(normalizeLocale('EN-us')).toBe('en');
  });

  it('rechaza idiomas no soportados y vacíos', () => {
    expect(normalizeLocale('de-DE')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('isLocale', () => {
  it('solo acepta idiomas soportados', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('qps-ploc')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('resolución del idioma', () => {
  it('preferencia guardada → idioma del SO → EN', () => {
    expect(resolvePreferredLocale({ saved: 'es', system: 'en-US' })).toBe('es');
    expect(resolvePreferredLocale({ system: 'es-ES' })).toBe('es');
    expect(resolvePreferredLocale({ system: 'de-DE' })).toBe('en');
    expect(resolvePreferredLocale({})).toBe('en');
  });

  it('el entorno gana para dev/QA (`RDLC_LOCALE`)', () => {
    expect(resolveEffectiveLocale({ env: 'es', saved: 'en' })).toBe('es');
    expect(resolveEffectiveLocale({ env: 'qps-ploc', saved: 'es' })).toBe('qps-ploc');
    expect(resolveEffectiveLocale({ env: 'fr-FR', saved: 'es' })).toBe('es');
  });

  it('el pseudo-idioma nunca es preferencia', () => {
    expect(resolvePreferredLocale({ env: 'qps-ploc', saved: 'es' })).toBe('es');
    expect(resolvePreferredLocale({ env: 'qps-ploc', system: 'es-ES' })).toBe('es');
    expect(resolvePreferredLocale({ env: 'qps-ploc' })).toBe('en');
  });
});
