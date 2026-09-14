import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VariablesPanelProps {
  meta: ReportMetaDto;
  /** Copia la expresión al portapapeles después de insertarla en el estado. */
  onPick?: (expression: string) => void;
}

interface VariableEntry {
  group: string;
  name: string;
  expression: string;
  detail?: string;
}

/** Globals y User son listas estáticas del estándar RDL. */
const GLOBALS = [
  'PageNumber',
  'TotalPages',
  'ExecutionTime',
  'ReportName',
  'PageName',
  'RenderFormat',
];

const USER_FIELDS = ['UserID', 'Language'];

/**
 * Lista de variables del informe con buscador: campos del dataset, parámetros,
 * funciones del bloque `<Code>`, Globals! y User!. Al pinchar se copia la
 * expresión (el autocompletado/inserción en Monaco llega con el dominio
 * `expression`).
 */
export function VariablesPanel({ meta, onPick }: VariablesPanelProps): ReactNode {
  const [query, setQuery] = useState('');

  const entries = useMemo<VariableEntry[]>(() => {
    const fields = meta.fields.map((field) => ({
      group: 'Campos (Fields!)',
      name: field.name,
      expression: `=Fields!${field.name}.Value`,
      detail: field.dataType,
    }));

    const parameters = meta.parameters.map((parameter) => ({
      group: 'Parámetros',
      name: parameter.name,
      expression: `=Parameters!${parameter.name}.Value`,
      detail: parameter.dataType,
    }));

    const functions = meta.code.functions.map((fn) => ({
      group: 'Funciones Code.',
      name: fn.name,
      expression: `=Code.${fn.name}(`,
      detail: fn.parameters?.join(', '),
    }));

    const globals = GLOBALS.map((name) => ({
      group: 'Globals!',
      name,
      expression: `=Globals!${name}.Value`,
    }));

    const user = USER_FIELDS.map((name) => ({
      group: 'User!',
      name,
      expression: `=User!${name}`,
    }));

    return [...fields, ...parameters, ...functions, ...globals, ...user];
  }, [meta]);

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

  const pick = (entry: VariableEntry): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(entry.expression);
    }
    onPick?.(entry.expression);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Variables</span>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <Input
          className="h-7 text-xs"
          placeholder="Buscar campo, parámetro, función…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {groups.map(([group, list]) => (
            <div key={group} className="flex flex-col gap-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                {group} ({list.length})
              </div>
              {list.map((entry) => (
                <button
                  key={`${group}.${entry.name}`}
                  type="button"
                  onClick={() => pick(entry)}
                  title={entry.expression}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left font-mono text-xs hover:bg-muted"
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
          ))}
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin resultados.</p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
