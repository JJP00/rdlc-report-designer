import { useCallback, useState } from 'react';

/** Modo de color del editor: claro u oscuro (blanco y negro invertido). */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rdlc-designer-theme';

/** Esquema del sistema (`prefers-color-scheme`); claro si no se puede consultar. */
function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Valor guardado si existe; si no, el esquema del sistema. */
export function resolveTheme(stored: string | null, system: Theme): Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return system;
}

function readStoredTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Almacenamiento bloqueado: se usa el esquema del sistema.
  }
  return resolveTheme(stored, systemTheme());
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Tema claro/oscuro persistido en `localStorage`. La clase `dark` va en
 * `<html>`: los tokens de `styles.css` (y el fondo del lienzo) cambian solos.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = readStoredTheme();
    applyTheme(initial);
    return initial;
  });

  const toggleTheme = useCallback((): void => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Sin persistencia (almacenamiento bloqueado): el tema dura la sesión.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
