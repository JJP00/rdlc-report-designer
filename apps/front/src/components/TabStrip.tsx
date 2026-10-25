import { useT } from '@rdlc-designer/i18n/react';
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  dropTargetIndex,
  focusTargetIndex,
  moveAnnouncement,
  moveTargetIndex,
} from '@/lib/tabNavigation';
import type { CloseScope } from '@/lib/workspace';
import { fileBasename } from '@/lib/windowTitle';
import { TabEntry } from './TabEntry';
import { TabOverflowMenu } from './TabOverflowMenu';

/** Pestaña tal y como la pinta la tira (subconjunto de `TabState`). */
export interface TabStripItem {
  sessionId: string;
  path: string;
  dirty: boolean;
  conflict: string | null;
}

export interface TabStripProps {
  tabs: readonly TabStripItem[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  /** Reordenar: mueve la pestaña a la posición `toIndex` de la tira. */
  onMove: (sessionId: string, toIndex: number) => void;
  onClose: (sessionId: string) => void;
  /** Menú contextual: cierra varias pestañas desde la pulsada, con guarda. */
  onCloseMany: (scope: CloseScope, sessionId: string) => void;
}

/**
 * Tira de pestañas (siempre visible): una por sesión del backend — nombre del
 * fichero con `*` si hay cambios, marca de conflicto y botón de cerrar con
 * guarda. Abrir, Nuevo y recientes viven en el menú «Fichero» y en el arrastre de
 * ficheros a la ventana.
 *
 * Accesibilidad (hallazgos 3, 9, 21, 24): `tablist` con roving tabindex y
 * navegación ←/→/Inicio/Fin que activa al enfocar; la activa se trae a la vista;
 * si la tira desborda hay un menú «Todas las pestañas» fuera de la zona con
 * scroll; el estado sin guardar/conflicto va en el nombre accesible; el
 * reordenado (arrastre o Alt+←/→) se anuncia en una región viva. Los nombres
 * largos se truncan por la izquierda para no perder la extensión.
 */
export function TabStrip({
  tabs,
  activeSessionId,
  onActivate,
  onMove,
  onClose,
  onCloseMany,
}: TabStripProps): ReactNode {
  const t = useT();

  // Reordenar por arrastre (HTML5 DnD): `dragId` es la pestaña en vuelo y
  // `drop` la ranura de destino (índice de inserción en la lista **actual**).
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  /** Último anuncio de la región viva (reordenado por arrastre o teclado). */
  const [liveMessage, setLiveMessage] = useState('');
  /** La tira desborda: se ofrece el menú «Todas las pestañas». */
  const [overflowing, setOverflowing] = useState(false);
  /** Contenedor con scroll de las pestañas (para medir el desbordamiento). */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Pestañas por sesión: roving tabindex, foco y `scrollIntoView`. */
  const tabRefs = useRef(new Map<string, HTMLDivElement>());

  /** Cambios que pueden alterar el ancho de la tira (`*` y conflicto suman ancho). */
  const tabsSignature = tabs
    .map((tab) => `${tab.sessionId}:${tab.dirty ? 1 : 0}:${tab.conflict ? 1 : 0}`)
    .join('|');

  /**
   * Publica un anuncio. Repetir el mismo texto no re-renderiza (React descarta
   * el estado igual), así que se alterna con un ancho cero invisible para forzar
   * el anuncio cuando la posición no cambia.
   */
  const announce = (message: string): void => {
    setLiveMessage((current) => (current === message ? `${message}\u200B` : message));
  };

  /** Enfoca una pestaña y la trae a la vista (navegación por teclado). */
  const focusTab = (sessionId: string): void => {
    const element = tabRefs.current.get(sessionId);
    if (!element) return;
    element.focus();
    element.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  const registerTab = (sessionId: string, element: HTMLDivElement | null): void => {
    if (element) tabRefs.current.set(sessionId, element);
    else tabRefs.current.delete(sessionId);
  };

  // La pestaña activa siempre a la vista (apertura, cambio, cierre de vecinas y
  // cuando el botón «Todas las pestañas» aparece o desaparece y el contenedor
  // cambia de ancho).
  useEffect(() => {
    if (activeSessionId === null) return;
    tabRefs.current.get(activeSessionId)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeSessionId, tabsSignature, overflowing]);

  // Desbordamiento: `scrollWidth > clientWidth` (+1 por redondeo). El
  // `ResizeObserver` cubre el tamaño de la ventana; las dependencias, los
  // cambios de contenido (nueva pestaña, `*`, conflicto, activa).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = (): void => setOverflowing(scroller.scrollWidth > scroller.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [tabsSignature, activeSessionId]);

  /** Ranura bajo el cursor: antes o después de la pestaña según su mitad. */
  const slotFor = (event: DragEvent<HTMLElement>, index: number): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? index : index + 1;
  };

  const endDrag = (): void => {
    setDragId(null);
    setDrop(null);
  };

  /** Tras soltar: reordena y anuncia la posición final (hallazgo 21). */
  const commitDrop = (): void => {
    if (dragId !== null && drop !== null) {
      const from = tabs.findIndex((tab) => tab.sessionId === dragId);
      const moved = from < 0 ? undefined : tabs[from];
      if (moved) {
        const target = dropTargetIndex(from, drop);
        onMove(dragId, target);
        announce(moveAnnouncement(fileBasename(moved.path), target, tabs.length, t));
      }
    }
    endDrag();
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, sessionId: string): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sessionId);
    setDragId(sessionId);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number): void => {
    if (dragId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const slot = slotFor(event, index);
    if (slot !== drop) setDrop(slot);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (dragId === null) return;
    event.preventDefault();
    commitDrop();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number): void => {
    const tab = tabs[index];
    if (!tab) return;
    // Las teclas del botón de cerrar (o de cualquier descendiente) no son de la
    // pestaña.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(tab.sessionId);
      return;
    }
    // Reordenar con teclado: Alt+←/→ mueve esta pestaña.
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const target = moveTargetIndex(index, event.key === 'ArrowLeft' ? -1 : 1, tabs.length);
      onMove(tab.sessionId, target);
      announce(moveAnnouncement(fileBasename(tab.path), target, tabs.length, t));
      return;
    }
    // Roving: ←/→ (circular) e Inicio/Fin mueven el foco y activan.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = focusTargetIndex(index, tabs.length, event.key);
    const targetTab = target === null ? undefined : tabs[target];
    if (!targetTab) return;
    event.preventDefault();
    onActivate(targetTab.sessionId);
    focusTab(targetTab.sessionId);
  };

  const from = dragId === null ? -1 : tabs.findIndex((entry) => entry.sessionId === dragId);
  const hasSaved = tabs.some((entry) => !entry.dirty);

  return (
    <div data-testid="tab-strip" className="flex items-stretch border-b bg-tabstrip">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={t('app.tabs.listLabel')}
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1 pt-1"
      >
        {tabs.map((tab, index) => {
          // Indicador de la ranura: línea en el borde izquierdo o derecho.
          const markBefore = drop === index && drop !== from && drop !== from + 1;
          const markAfter =
            drop === tabs.length && index === tabs.length - 1 && drop !== from && drop !== from + 1;
          return (
            <TabEntry
              key={tab.sessionId}
              tab={tab}
              index={index}
              tabCount={tabs.length}
              active={tab.sessionId === activeSessionId}
              dragging={dragId === tab.sessionId}
              dropMark={markBefore ? 'before' : markAfter ? 'after' : undefined}
              hasSaved={hasSaved}
              registerElement={registerTab}
              onActivate={onActivate}
              onClose={onClose}
              onCloseMany={onCloseMany}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={endDrag}
              onKeyDown={handleKeyDown}
            />
          );
        })}
      </div>
      {overflowing ? (
        <TabOverflowMenu tabs={tabs} activeSessionId={activeSessionId} onActivate={onActivate} />
      ) : null}
      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
