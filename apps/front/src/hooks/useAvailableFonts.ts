import { BUSINESS_CENTRAL_FONT_FAMILIES } from '@rdlc-designer/contracts';
import { useEffect, useState } from 'react';

/**
 * Fuentes disponibles para los informes: las preinstaladas en Business Central
 * (lista oficial vía IPC). La comparten la barra de formato, el panel de
 * selección múltiple y el editor de texto (runs).
 *
 * Sin puente IPC (p. ej. en el navegador) se usa la misma lista del contrato.
 */
export function useAvailableFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(() => [...BUSINESS_CENTRAL_FONT_FAMILIES]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof window.api?.listFonts !== 'function') return;
        const result = await window.api.listFonts();
        if (!cancelled && result.ok && result.fonts.length > 0) setFonts(result.fonts);
      } catch {
        // Sin puente IPC: se queda la lista del contrato.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return fonts;
}
