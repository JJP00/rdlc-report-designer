import { AlertTriangle, X } from 'lucide-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
 * Tira de pestañas (siempre visible): una por sesión del backend — nombre del
 * fichero con `*` si hay cambios, marca de conflicto y botón de cerrar con
 * guarda. Abrir, Nuevo y recientes viven en el menú «Fichero» y en el arrastre de
 * ficheros a la ventana. Con muchas pestañas hace scroll horizontal.
 */
export function TabStrip({
  tabs,
  activeSessionId,
  onActivate,
  onMove,
  onClose,
  onCloseMany,
}: TabStripProps): ReactNode {
  // Reordenar por arrastre (HTML5 DnD): `dragId` es la pestaña en vuelo y
  // `drop` la ranura de destino (índice de inserción en la lista **actual**).
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<number | null>(null);

  /** Ranura bajo el cursor: antes o después de la pestaña según su mitad. */
  const slotFor = (event: DragEvent<HTMLElement>, index: number): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? index : index + 1;
  };

  const endDrag = (): void => {
    setDragId(null);
    setDrop(null);
  };

  const commitDrop = (): void => {
    if (dragId !== null && drop !== null) {
      const from = tabs.findIndex((tab) => tab.sessionId === dragId);
      // La ranura cuenta con la pestaña aún en su sitio: al quitarla, las de
      // la derecha se desplazan una posición.
      if (from >= 0) onMove(dragId, drop > from ? drop - 1 : drop);
    }
    endDrag();
  };

  return (
    <div data-testid="tab-strip" className="flex items-stretch border-b bg-tabstrip">
      <div
        role="tablist"
        aria-label="Informes abiertos"
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
                  role="tab"
                  aria-selected={active}
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
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onActivate(tab.sessionId);
                      return;
                    }
                    // Reordenar con teclado: Alt+←/→ mueve esta pestaña.
                    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                      event.preventDefault();
                      onMove(tab.sessionId, index + (event.key === 'ArrowLeft' ? -1 : 1));
                    }
                  }}
                >
                  {tab.conflict ? (
                    <AlertTriangle
                      className="size-3 shrink-0 text-amber-700 dark:text-amber-400"
                      aria-label="Conflicto: el fichero cambió en disco"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">
                    {name}
                    {tab.dirty ? (
                      <span className="text-amber-700 dark:text-amber-400" aria-hidden>
                        {' *'}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    data-testid="tab-close"
                    aria-label={`Cerrar ${name}`}
                    title={`Cerrar ${name}`}
                    className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(tab.sessionId);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56" data-testid="tab-context-menu">
                <ContextMenuItem onSelect={() => onCloseMany('self', tab.sessionId)}>
                  Cerrar
                  <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!hasSaved}
                  onSelect={() => onCloseMany('saved', tab.sessionId)}
                >
                  Cerrar guardadas
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={tabs.length < 2}
                  onSelect={() => onCloseMany('others', tab.sessionId)}
                >
                  Cerrar otras
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={index >= tabs.length - 1}
                  onSelect={() => onCloseMany('right', tab.sessionId)}
                >
                  Cerrar a la derecha
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCloseMany('all', tab.sessionId)}>
                  Cerrar todas
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
