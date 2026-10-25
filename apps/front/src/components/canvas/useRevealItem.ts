import { useEffect, useRef, type RefObject } from 'react';
import type { PaperLayout } from './bands';
import { scrollToItem } from './canvasHit';

/**
 * «Traer a la vista»: al pedirlo la paleta (Ctrl+K) o la navegación por teclado,
 * desplaza el lienzo hasta el item con un margen cómodo. Devuelve la función
 * para pedirlo a mano.
 */
export function useRevealItem({
  scrollRef,
  bands,
  reveal,
  zoom,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bands: PaperLayout['bands'];
  reveal: { id: string; nonce: number } | null | undefined;
  zoom: number;
}): (id: string) => void {
  // Bandas actuales en un ref: el efecto de "traer a la vista" no debe
  // re-ejecutarse en cada render (las bandas son un array nuevo cada vez).
  const bandsRef = useRef(bands);
  useEffect(() => {
    bandsRef.current = bands;
  });

  // Trae a la vista el elemento pedido (paleta Ctrl+K) con un margen cómodo.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !reveal) return;
    scrollToItem(container, bandsRef.current, reveal.id, zoom);
  }, [reveal, zoom, scrollRef]);

  return (id: string): void => {
    const container = scrollRef.current;
    if (container) scrollToItem(container, bandsRef.current, id, zoom);
  };
}
