import { createTranslator, type Translator } from '@rdlc-designer/i18n';
import { useT } from '@rdlc-designer/i18n/react';
import { AlertTriangle, Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CloseScope } from '@/lib/workspace';
import { fileBasename } from '@/lib/windowTitle';

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
 * Traductor por defecto de los helpers puros de la tira: los tests los ejercen
 * sin React y afirman los textos ES del catálogo; la app pasa siempre el
 * traductor del idioma vigente.
 */
const defaultT: Translator['t'] = createTranslator('es').t;

/**
 * Nombre accesible de la pestaña: nombre del fichero y, si procede, el estado
 * que un lector de pantalla no puede deducir del `*` ámbar (hallazgo 9). El
 * conflicto puede darse sin cambios locales.
 */
export function tabAriaLabel(
  name: string,
  dirty: boolean,
  conflict: boolean,
  t: Translator['t'] = defaultT,
): string {
  const states = [
    dirty ? t('app.tabs.stateDirty') : null,
    conflict ? t('app.tabs.stateConflict') : null,
  ].filter((state): state is string => state !== null);
  return [name, ...states].join(', ');
}

/**
 * Índice de la pestaña destino de ←/→ (con vuelta circular) e Inicio/Fin
 * (extremos) en el `tablist`. `null` si la tecla no navega.
 */
export function focusTargetIndex(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'ArrowRight':
      return (index + 1) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Índice final de un arrastre: la ranura de destino cuenta con la pestaña aún
 * en su sitio, así que al quitarla las de la derecha se desplazan una posición
 * (el mismo cálculo que recibe `onMove`).
 */
export function dropTargetIndex(from: number, drop: number): number {
  return drop > from ? drop - 1 : drop;
}

/**
 * Índice final de reordenar `delta` puestos, acotado al rango como `moveTab`
 * (`lib/workspace`); así el anuncio coincide con la posición real.
 */
export function moveTargetIndex(index: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index + delta));
}

/** Texto del anuncio del reordenado (hallazgo 21): «nombre», posición i de N. */
export function moveAnnouncement(
  name: string,
  index: number,
  count: number,
  t: Translator['t'] = defaultT,
): string {
  return t('app.tabs.moveAnnouncement', { name, position: index + 1, count });
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

  return (
    <div data-testid="tab-strip" className="flex items-stretch border-b bg-tabstrip">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={t('app.tabs.listLabel')}
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1 pt-1"
      >
        {tabs.map((tab, index) => {
          const name = fileBasename(tab.path);
          const active = tab.sessionId === activeSessionId;
          const from = dragId === null ? -1 : tabs.findIndex((t) => t.sessionId === dragId);
          // Indicador de la ranura: línea en el borde izquierdo o derecho.
          const markBefore = drop === index && drop !== from && drop !== from + 1;
          const markAfter =
            drop === tabs.length && index === tabs.length - 1 && drop !== from && drop !== from + 1;
          const hasSaved = tabs.some((t) => !t.dirty);
          return (
            <ContextMenu key={tab.sessionId}>
              <ContextMenuTrigger asChild>
                <div
                  ref={(element) => {
                    if (element) tabRefs.current.set(tab.sessionId, element);
                    else tabRefs.current.delete(tab.sessionId);
                  }}
                  role="tab"
                  id={`tab-${tab.sessionId}`}
                  aria-controls={active ? `panel-${tab.sessionId}` : undefined}
                  aria-selected={active}
                  aria-label={tabAriaLabel(name, tab.dirty, tab.conflict !== null, t)}
                  tabIndex={active ? 0 : -1}
                  data-testid="tab-item"
                  draggable
                  data-dragging={dragId === tab.sessionId ? 'true' : 'false'}
                  data-drop={markBefore ? 'before' : markAfter ? 'after' : undefined}
                  data-session-id={tab.sessionId}
                  data-path={tab.path}
                  data-dirty={tab.dirty ? 'true' : 'false'}
                  data-conflict={tab.conflict ? 'true' : 'false'}
                  title={tab.path}
                  className={cn(
                    'group flex h-7 max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs select-none',
                    dragId === tab.sessionId && 'opacity-50',
                    markBefore && 'shadow-[inset_2px_0_0_0_var(--color-primary,#2563eb)]',
                    markAfter && 'shadow-[inset_-2px_0_0_0_var(--color-primary,#2563eb)]',
                    active
                      ? 'border-border border-t-2 border-t-primary bg-background font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                  onClick={() => onActivate(tab.sessionId)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', tab.sessionId);
                    setDragId(tab.sessionId);
                  }}
                  onDragOver={(event) => {
                    if (dragId === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const slot = slotFor(event, index);
                    if (slot !== drop) setDrop(slot);
                  }}
                  onDrop={(event) => {
                    if (dragId === null) return;
                    event.preventDefault();
                    commitDrop();
                  }}
                  onDragEnd={endDrag}
                  onKeyDown={(event) => {
                    // Las teclas del botón de cerrar (o de cualquier descendiente) no
                    // son de la pestaña.
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onActivate(tab.sessionId);
                      return;
                    }
                    // Reordenar con teclado: Alt+←/→ mueve esta pestaña.
                    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                      event.preventDefault();
                      const target = moveTargetIndex(
                        index,
                        event.key === 'ArrowLeft' ? -1 : 1,
                        tabs.length,
                      );
                      onMove(tab.sessionId, target);
                      announce(moveAnnouncement(name, target, tabs.length, t));
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
                  }}
                >
                  {tab.conflict ? (
                    <span role="img" aria-label={t('app.tabs.stateConflict')} className="shrink-0">
                      <AlertTriangle
                        className="size-3 text-amber-700 dark:text-amber-400"
                        aria-hidden
                      />
                    </span>
                  ) : null}
                  {/*
                   * Nombre truncado por la izquierda (`direction: rtl`): si no cabe,
                   * se recorta el principio y se conservan la extensión y el `*`
                   * (hallazgo 24). El texto interior va en LTR para que la puntuación
                   * del nombre no se reordene.
                   */}
                  <span className="min-w-0 truncate text-left [direction:rtl]">
                    <span dir="ltr">
                      {name}
                      {tab.dirty ? (
                        <span className="text-amber-700 dark:text-amber-400" aria-hidden>
                          {' *'}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="tab-close"
                    tabIndex={-1}
                    aria-label={t('app.tabs.closeTab', { name })}
                    title={t('app.tabs.closeTab', { name })}
                    className="-my-1 ml-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(tab.sessionId);
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56" data-testid="tab-context-menu">
                <ContextMenuItem onSelect={() => onCloseMany('self', tab.sessionId)}>
                  {t('common.close')}
                  <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!hasSaved}
                  onSelect={() => onCloseMany('saved', tab.sessionId)}
                >
                  {t('app.tabs.closeSaved')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={tabs.length < 2}
                  onSelect={() => onCloseMany('others', tab.sessionId)}
                >
                  {t('app.tabs.closeOthers')}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={index >= tabs.length - 1}
                  onSelect={() => onCloseMany('right', tab.sessionId)}
                >
                  {t('app.tabs.closeRight')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCloseMany('all', tab.sessionId)}>
                  {t('app.tabs.closeAll')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {overflowing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="tab-overflow"
              aria-label={t('app.tabs.overflowLabel', { count: tabs.length })}
              title={t('app.tabs.overflowLabel', { count: tabs.length })}
              className="m-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            {tabs.map((tab) => {
              const name = fileBasename(tab.path);
              const active = tab.sessionId === activeSessionId;
              const label = tabAriaLabel(name, tab.dirty, tab.conflict !== null, t);
              return (
                <DropdownMenuItem
                  key={tab.sessionId}
                  aria-label={active ? t('app.tabs.menuItemLabelActive', { label }) : label}
                  title={tab.path}
                  onSelect={() => onActivate(tab.sessionId)}
                >
                  {active ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <span className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {tab.dirty ? (
                    <span className="shrink-0 text-amber-700 dark:text-amber-400" aria-hidden>
                      {' *'}
                    </span>
                  ) : null}
                  {tab.conflict ? (
                    <AlertTriangle
                      className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400"
                      aria-hidden
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
