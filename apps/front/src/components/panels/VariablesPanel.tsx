import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { VARIABLE_GROUPS, variableEntries, type VariableEntry } from '@/lib/variables';

interface VariablesPanelProps {
  meta: ReportMetaDto;
  /**
   * Elige una variable: con un editor de expresiones enfocado se inserta en el
   * cursor; si no, el contenedor (App) cae al portapapeles.
   */
  onPick?: (expression: string, name: string) => void;
}

/**
 * Lista de variables del informe con buscador y **grupos colapsables**:
 * campos del dataset, parámetros, funciones del bloque `<Code>`, Globals! y
 * User!. Al pinchar se copia la expresión (el autocompletado/inserción en
 * Monaco llega con el dominio `expression`).
 */
export function VariablesPanel({ meta, onPick }: VariablesPanelProps): ReactNode {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    [VARIABLE_GROUPS.fields]: true,
  });

  const entries = useMemo<VariableEntry[]>(() => variableEntries(meta), [meta]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.group.toLowerCase().includes(needle) ||
        entry.expression.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  const groups = useMemo(() => {
    const map = new Map<string, VariableEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const searching = query.trim().length > 0;
  const allCollapsed = groups.length > 0 && groups.every(([group]) => collapsed[group]);

  const toggleGroup = (group: string): void => {
    setCollapsed((current) => ({ ...current, [group]: !current[group] }));
  };

  const toggleAll = (): void => {
    if (allCollapsed) {
      setCollapsed({});
      return;
    }
    setCollapsed(Object.fromEntries(groups.map(([group]) => [group, true])));
  };

  const pick = (entry: VariableEntry): void => {
    onPick?.(entry.expression, entry.name);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Variables</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{filtered.length}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
              title={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
              onClick={toggleAll}
            >
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
            </Button>
          </div>
        </div>
        <Input
          className="h-7 text-xs"
          placeholder="Buscar campo, parámetro, función…"
          aria-label="Buscar variables"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Scroll nativo con el estilo global de barras. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0.5 p-1">
          {groups.map(([group, list]) => {
            // Al buscar, los grupos con resultados se muestran siempre abiertos.
            const isOpen = searching || !collapsed[group];
            return (
              <Collapsible
                key={group}
                open={isOpen}
                onOpenChange={() => toggleGroup(group)}
                className="flex flex-col"
              >
                <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted">
                  {isOpen ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 text-[11px] font-medium text-muted-foreground">
                    {group}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{list.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-0.5 pb-1 pl-4">
                    {list.map((entry) => (
                      <button
                        key={`${group}.${entry.name}`}
                        type="button"
                        onClick={() => pick(entry)}
                        title={entry.expression}
                        className="flex items-center justify-between gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[11px] hover:bg-muted"
                      >
                        <span className="truncate">{entry.name}</span>
                        {entry.detail ? (
                          <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                            {entry.detail}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin resultados.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
