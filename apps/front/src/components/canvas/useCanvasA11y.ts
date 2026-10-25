import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { edgeReadingId, nextReadingId, selectionAnnouncement } from '@/hooks/canvasA11y';
import { flattenItems } from '@/lib/projection';

/**
 * Accesibilidad del lienzo: orden de lectura, anuncios de la selección en la
 * región viva y teclado (Tab/Home/End recorren los elementos, Enter edita el
 * texto).
 */
export function useCanvasA11y({
  projection,
  selectedId,
  onSelect,
  onEditText,
  revealItem,
}: {
  projection: ProjectionDto;
  selectedId: string | null | undefined;
  onSelect: ((id: string | null, additive?: boolean) => void) | undefined;
  onEditText: ((id: string) => void) | undefined;
  revealItem: (id: string) => void;
}) {
  const t = useT();
  const items = useMemo(() => flattenItems(projection), [projection]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const descriptionId = useId();
  const selectedItem = useMemo(
    () => (selectedId ? items.find((item) => item.id === selectedId) : undefined),
    [items, selectedId],
  );
  const [liveMessage, setLiveMessage] = useState('');
  const announcedSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedItem) {
      announcedSelectionRef.current = null;
      if (items.length === 0) setLiveMessage(t('canvas.a11y.emptyPage'));
      return;
    }
    // Selección nueva: se anuncia al instante; mover con flechas, con retardo
    // para no encadenar mensajes.
    if (announcedSelectionRef.current !== selectedItem.id) {
      announcedSelectionRef.current = selectedItem.id;
      setLiveMessage(selectionAnnouncement(selectedItem, t));
      return;
    }
    const timer = window.setTimeout(
      () => setLiveMessage(selectionAnnouncement(selectedItem, t)),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [selectedItem, items.length, t]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented) return;
    if (event.key === 'Tab') {
      const next = onSelect
        ? nextReadingId(itemIds, selectedId ?? null, event.shiftKey ? -1 : 1)
        : null;
      // Sin siguiente (fuera del rango) el Tab sigue su curso y sale del lienzo.
      if (!next) return;
      event.preventDefault();
      onSelect?.(next);
      revealItem(next);
      return;
    }
    if (
      (event.key === 'Home' || event.key === 'End') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      onSelect
    ) {
      const edge = edgeReadingId(itemIds, event.key === 'Home' ? 'first' : 'last');
      if (!edge) return;
      event.preventDefault();
      onSelect(edge);
      revealItem(edge);
      return;
    }
    if (
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      selectedItem?.kind === 'textbox'
    ) {
      event.preventDefault();
      onEditText?.(selectedItem.id);
    }
  };

  const handleFocus = (event: ReactFocusEvent<HTMLDivElement>): void => {
    // Solo al llegar con teclado (no con clic): selecciona el primero.
    if (event.target !== event.currentTarget) return;
    if (!event.currentTarget.matches(':focus-visible')) return;
    if (itemIds.length === 0) {
      setLiveMessage(t('canvas.a11y.emptyPage'));
      return;
    }
    if (!selectedId || !itemIds.includes(selectedId)) {
      const first = edgeReadingId(itemIds, 'first');
      if (first) onSelect?.(first);
    }
  };

  return { itemCount: items.length, descriptionId, liveMessage, handleKeyDown, handleFocus };
}
