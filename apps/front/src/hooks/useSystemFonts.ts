import { useEffect, useState } from 'react';

/** Lista de respaldo si no hay acceso al registro del sistema (p. ej. navegador). */
export const FONT_FAMILIES_FALLBACK = [
  'Arial',
  'Segoe UI',
  'Times New Roman',
  'Courier New',
  'Tahoma',
];

/**
 * Fuentes instaladas del sistema (registro de Windows vía IPC). La comparten la
 * barra de formato y el editor de texto (controles por run).
 */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(FONT_FAMILIES_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof window.api?.listFonts !== 'function') return;
        const result = await window.api.listFonts();
        if (!cancelled && result.ok && result.fonts.length > 0) setFonts(result.fonts);
      } catch {
        // Sin acceso al sistema: se queda la lista de respaldo.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return fonts;
}
