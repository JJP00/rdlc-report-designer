import { AlertTriangle, FilePlus, FolderOpen, History, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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
  /** Hay una operación de fichero en curso: el menú `+` se deshabilita. */
  busy: boolean;
  recents: readonly string[];
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
}

/**
 * Tira de pestañas (siempre visible): una por sesión del backend — nombre del
 * fichero con `*` si hay cambios, marca de conflicto y botón de cerrar con
 * guarda. El menú `+` ofrece Nuevo / Abrir / recientes, igual que el menú
 * «Fichero» de la toolbar. Con muchas pestañas hace scroll horizontal.
 */
export function TabStrip({
  tabs,
  activeSessionId,
  busy,
  recents,
  onActivate,
  onClose,
  onNew,
  onOpen,
  onOpenRecent,
}: TabStripProps): ReactNode {
  return (
    <div data-testid="tab-strip" className="flex items-stretch border-b bg-muted/40">
      <div
        role="tablist"
        aria-label="Informes abiertos"
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-1 pt-1"
      >
        {tabs.map((tab) => {
          const name = fileBasename(tab.path);
          const active = tab.sessionId === activeSessionId;
          return (
            <div
              key={tab.sessionId}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-testid="tab-item"
              data-session-id={tab.sessionId}
              data-path={tab.path}
              data-dirty={tab.dirty ? 'true' : 'false'}
              data-conflict={tab.conflict ? 'true' : 'false'}
              title={tab.path}
              className={cn(
                'group flex h-7 max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs select-none',
                active
                  ? 'border-border bg-background font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted',
              )}
              onClick={() => onActivate(tab.sessionId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onActivate(tab.sessionId);
                }
              }}
            >
              {tab.conflict ? (
                <AlertTriangle
                  className="size-3 shrink-0 text-amber-600"
                  aria-label="Conflicto: el fichero cambió en disco"
                />
              ) : null}
              <span className="min-w-0 truncate">
                {name}
                {tab.dirty ? (
                  <span className="text-amber-600" aria-hidden>
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
          );
        })}
      </div>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="tab-new-menu"
                aria-label="Nueva pestaña: nuevo, abrir o recientes"
                className="m-1 shrink-0"
                disabled={busy}
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Nuevo / Abrir / recientes</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem disabled={busy} onSelect={onNew}>
            <FilePlus />
            Nuevo…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={onOpen}>
            <FolderOpen />
            Abrir…
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={busy || recents.length === 0}>
              <History />
              Recientes
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-96">
              {recents.map((path) => (
                <DropdownMenuItem
                  key={path}
                  onSelect={() => onOpenRecent(path)}
                  title={path}
                  className="font-mono text-xs"
                >
                  <span className="truncate">{path}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
