import { useT } from '@rdlc-designer/i18n/react';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tabAriaLabel } from '@/lib/tabNavigation';
import { fileBasename } from '@/lib/windowTitle';
import type { TabStripItem } from './TabStrip';

export interface TabOverflowMenuProps {
  tabs: readonly TabStripItem[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
}

/** Menú «Todas las pestañas»: sale cuando la tira desborda y deja saltar a cualquiera. */
export function TabOverflowMenu({
  tabs,
  activeSessionId,
  onActivate,
}: TabOverflowMenuProps): ReactNode {
  const t = useT();

  return (
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
  );
}
