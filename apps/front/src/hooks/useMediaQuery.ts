import { useEffect, useState } from 'react';

/**
 * ¿La ventana cumple la media query? Se suscribe a `change` para seguir los
 * cambios de tamaño en vivo (p. ej. estrechar la ventana con la app abierta).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    // La query pudo cambiar entre el primer render y el efecto.
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
