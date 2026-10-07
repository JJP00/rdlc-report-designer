import { useCallback, useState } from 'react';

/** Modo de color del editor: claro u oscuro (blanco y negro invertido). */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rdlc-designer-theme';

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
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
