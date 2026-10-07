import { BUSINESS_CENTRAL_FONT_FAMILIES } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { BusinessCentralFontsAdapter } from '../../src/infrastructure/fonts/BusinessCentralFontsAdapter.js';

/**
 * Fuentes disponibles en Business Central: la lista oficial es la única que la
 * UI ofrece (el entorno no admite fuentes propias).
 */

describe('BusinessCentralFontsAdapter', () => {
  it('sirve la lista oficial: ordenada, sin duplicados ni entradas vacías', async () => {
    const fonts = await new BusinessCentralFontsAdapter().list();

    expect(fonts).toEqual([...BUSINESS_CENTRAL_FONT_FAMILIES]);
    expect(new Set(fonts).size).toBe(fonts.length);
    expect(fonts.every((font) => font.trim().length > 0)).toBe(true);

    const sorted = [...fonts].sort((a, b) => a.localeCompare(b, 'es'));
    expect(fonts).toEqual(sorted);
  });

  it('incluye las familias habituales y las especiales documentadas', async () => {
    const fonts = await new BusinessCentralFontsAdapter().list();

    for (const family of [
      'Arial',
      'Calibri',
      'Consolas',
      'Segoe UI',
      'Times New Roman',
      'Aptos',
      'IDAutomation2D',
      'MICR',
      'OCRB',
    ]) {
      expect(fonts).toContain(family);
    }
  });

  it('devuelve una copia (mutar el resultado no contamina la lista)', async () => {
    const adapter = new BusinessCentralFontsAdapter();
    const fonts = await adapter.list();
    fonts.length = 0;

    expect((await adapter.list()).length).toBe(BUSINESS_CENTRAL_FONT_FAMILIES.length);
  });
});
