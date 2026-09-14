import { describe, expect, it } from 'vitest';
import { parseRegQueryOutput } from '../../src/infrastructure/fonts/WindowsSystemFontsAdapter.js';

/** Parseo de `reg query "HKLM\...\Fonts"` → nombres de familia. */

const SAMPLE = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts
    Arial (TrueType)    REG_SZ    arial.ttf
    Arial Black (TrueType)    REG_SZ    ariblk.ttf
    @Arial Unicode MS (TrueType)    REG_SZ    arialuni.ttf
    Consolas (TrueType)    REG_SZ    consola.ttf
    Segoe UI (TrueType)    REG_SZ    segoeui.ttf
    Segoe UI Bold (TrueType)    REG_SZ    segoeuib.ttf
    Times New Roman (TrueType)    REG_SZ    times.ttf
    Courier New (TrueType)    REG_SZ    cour.ttf
    Some Font (OpenType)    REG_SZ    some.otf
`;

describe('WindowsSystemFontsAdapter · parseo del registro', () => {
  it('extrae familias legibles, quita estilos y variantes @verticales', () => {
    const fonts = parseRegQueryOutput(SAMPLE);

    expect(fonts).toContain('Arial');
    expect(fonts).toContain('Arial Black');
    expect(fonts).toContain('Consolas');
    expect(fonts).toContain('Times New Roman');
    expect(fonts).toContain('Courier New');
    expect(fonts).toContain('Some Font');

    expect(fonts).not.toContain('@Arial Unicode MS');
    expect(fonts.some((font) => font.includes('(TrueType)'))).toBe(false);
  });

  it('ordena alfabéticamente y no repite', () => {
    const fonts = parseRegQueryOutput(SAMPLE);
    const sorted = [...fonts].sort((a, b) => a.localeCompare(b, 'es'));
    expect(fonts).toEqual(sorted);
    expect(new Set(fonts).size).toBe(fonts.length);
  });

  it('con salida vacía no revienta', () => {
    expect(parseRegQueryOutput('')).toEqual([]);
  });
});
