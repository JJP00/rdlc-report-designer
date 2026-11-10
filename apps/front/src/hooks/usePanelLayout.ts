import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INITIAL_PANEL_LAYOUT,
  PANEL_LIMITS,
  parsePanelLayout,
  serializePanelLayout,
  type PanelKey,
  type PanelLayout,
} from '@/lib/panelLayout';

const STORAGE_KEY = 'rdlc-designer-panels';

function readStoredLayout(): PanelLayout {
  try {
    return parsePanelLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Almacenamiento bloqueado: tamaños iniciales.
    return INITIAL_PANEL_LAYOUT;
  }
}

export interface PanelLayoutApi {
  layout: PanelLayout;
  /** Tamaño ya ajustado a sus límites (lo hace el asidero). */
  setSize: (key: PanelKey, px: number) => void;
  /** Vuelve al tamaño inicial (doble clic en el asidero). */
  resetSize: (key: PanelKey) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
}

/**
 * Tamaño de los paneles y plegado de Propiedades, guardados en `localStorage`
 * (una preferencia de la app: la comparten las pestañas). El guardado va en un
 * efecto con espera: arrastrar un asidero no escribe en cada movimiento.
 */
export function usePanelLayout(): PanelLayoutApi {
  const [layout, setLayout] = useState<PanelLayout>(readStoredLayout);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializePanelLayout(layout));
      } catch {
        // Sin persistencia: los tamaños duran la sesión.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [layout]);

  const setSize = useCallback((key: PanelKey, px: number): void => {
    setLayout((current) =>
      current.sizes[key] === px && (key !== 'problems' || current.problemsSized)
        ? current
        : {
            ...current,
            sizes: { ...current.sizes, [key]: px },
            problemsSized: key === 'problems' ? true : current.problemsSized,
          },
    );
  }, []);

  const resetSize = useCallback((key: PanelKey): void => {
    setLayout((current) => ({
      ...current,
      sizes: { ...current.sizes, [key]: PANEL_LIMITS[key].initial },
      problemsSized: key === 'problems' ? false : current.problemsSized,
    }));
  }, []);

  const setInspectorCollapsed = useCallback((collapsed: boolean): void => {
    setLayout((current) =>
      current.inspectorCollapsed === collapsed
        ? current
        : { ...current, inspectorCollapsed: collapsed },
    );
  }, []);

  return { layout, setSize, resetSize, setInspectorCollapsed };
}
