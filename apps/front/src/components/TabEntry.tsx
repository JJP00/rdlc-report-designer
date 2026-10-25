import { useT } from '@rdlc-designer/i18n/react';
import { AlertTriangle, X } from 'lucide-react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
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
import { tabAriaLabel } from '@/lib/tabNavigation';
import { fileBasename } from '@/lib/windowTitle';
import type { TabStripItem } from './TabStrip';

export interface TabEntryProps {
  tab: TabStripItem;
  index: number;
  tabCount: number;
  active: boolean;
  /** Esta pestaña es la que está en vuelo (arrastre). */
  dragging: boolean;
  /** Indicador de la ranura de destino: línea en el borde izquierdo o derecho. */
  dropMark: 'before' | 'after' | undefined;
  /** Hay alguna pestaña sin cambios (habilita «Cerrar las guardadas»). */
  hasSaved: boolean;
  /** Registra/borra el elemento para el roving tabindex, el foco y el scroll. */
  registerElement: (sessionId: string, element: HTMLDivElement | null) => void;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCloseMany: (scope: CloseScope, sessionId: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, sessionId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
}

/**
 * Una pestaña de la tira con su menú contextual de cierre. El estado compartido
 * (arrastre, foco, anuncios) vive en `TabStrip`; aquí solo se pinta y se
 * delegan los eventos.
 */
export function TabEntry({
  tab,
  index,
  tabCount,
  active,
  dragging,
  dropMark,
  hasSaved,
  registerElement,
  onActivate,
  onClose,
  onCloseMany,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyDown,
}: TabEntryProps): ReactNode {
  const t = useT();
  const name = fileBasename(tab.path);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={(element) => registerElement(tab.sessionId, element)}
          role="tab"
          id={`tab-${tab.sessionId}`}
          aria-controls={active ? `panel-${tab.sessionId}` : undefined}
          aria-selected={active}
          aria-label={tabAriaLabel(name, tab.dirty, tab.conflict !== null, t)}
          tabIndex={active ? 0 : -1}
          data-testid="tab-item"
          draggable
          data-dragging={dragging ? 'true' : 'false'}
          data-drop={dropMark}
          data-session-id={tab.sessionId}
          data-path={tab.path}
          data-dirty={tab.dirty ? 'true' : 'false'}
          data-conflict={tab.conflict ? 'true' : 'false'}
          title={tab.path}
          className={cn(
            'group flex h-7 max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs select-none',
            dragging && 'opacity-50',
            dropMark === 'before' && 'shadow-[inset_2px_0_0_0_var(--color-primary,#2563eb)]',
            dropMark === 'after' && 'shadow-[inset_-2px_0_0_0_var(--color-primary,#2563eb)]',
            active
              ? 'border-border border-t-2 border-t-primary bg-background font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
          )}
          onClick={() => onActivate(tab.sessionId)}
          onDragStart={(event) => onDragStart(event, tab.sessionId)}
          onDragOver={(event) => onDragOver(event, index)}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.conflict ? (
            <span role="img" aria-label={t('app.tabs.stateConflict')} className="shrink-0">
              <AlertTriangle className="size-3 text-amber-700 dark:text-amber-400" aria-hidden />
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
        <ContextMenuItem disabled={!hasSaved} onSelect={() => onCloseMany('saved', tab.sessionId)}>
          {t('app.tabs.closeSaved')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={tabCount < 2}
          onSelect={() => onCloseMany('others', tab.sessionId)}
        >
          {t('app.tabs.closeOthers')}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={index >= tabCount - 1}
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
}
