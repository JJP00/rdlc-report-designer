import type { ProjectionDto } from '@rdlc-designer/contracts';
import {
  Braces,
  FolderOpen,
  Frame,
  Image,
  Minus,
  Redo2,
  Save,
  Settings2,
  Square,
  Table,
  Type,
  Undo2,
  Variable,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { PALETTE_ACTIONS, paletteElements, type PaletteActionId } from '@/lib/palette';
import { itemKindLabel } from '@/lib/palette';
import { variableEntries } from '@/lib/variables';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projection: ProjectionDto | null;
  /** Saltar a un elemento del lienzo (seleccionarlo). */
  onSelectItem: (id: string) => void;
  /** Insertar una variable/expresión (en el editor activo o al portapapeles). */
  onPickExpression: (expression: string, name: string) => void;
  onAction: (action: PaletteActionId) => void;
  /** Deshabilita las acciones que necesitan documento abierto. */
  hasDocument: boolean;
}

const ACTION_ICONS: Record<PaletteActionId, ReactNode> = {
  open: <FolderOpen />,
  save: <Save />,
  undo: <Undo2 />,
  redo: <Redo2 />,
  'insert:textbox': <Type />,
  'insert:rectangle': <Square />,
  'insert:line': <Minus />,
  'insert:image': <Image />,
  'insert:tablix': <Table />,
  'toggle-variables': <Variable />,
  'report-properties': <Settings2 />,
};

/** Acciones que no tienen sentido sin un informe abierto. */
const NEEDS_DOCUMENT = new Set<PaletteActionId>([
  'save',
  'undo',
  'redo',
  'insert:textbox',
  'insert:rectangle',
  'insert:line',
  'insert:image',
  'insert:tablix',
  'report-properties',
  'toggle-variables',
]);

/**
 * Paleta de comandos (Ctrl+K): busca **elementos** del informe (por nombre y
 * por contenido), **variables** del informe (campos, parámetros, funciones de
 * `<Code>`, Globals!, User!) y **acciones** del editor.
 */
export function CommandPalette({
  open,
  onOpenChange,
  projection,
  onSelectItem,
  onPickExpression,
  onAction,
  hasDocument,
}: CommandPaletteProps): ReactNode {
  const elements = useMemo(() => (projection ? paletteElements(projection) : []), [projection]);
  const variables = useMemo(
    () => (projection ? variableEntries(projection.meta) : []),
    [projection],
  );

  const run = (callback: () => void): void => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Paleta de comandos"
      description="Busca elementos del informe, variables o acciones del editor"
    >
      <Command>
        <CommandInput placeholder="Buscar elemento, variable o acción…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>

          {elements.length > 0 ? (
            <CommandGroup heading="Elementos del informe">
              {elements.map((element) => (
                <CommandItem
                  key={element.id}
                  value={element.id}
                  keywords={[element.haystack]}
                  onSelect={() => run(() => onSelectItem(element.id))}
                >
                  <Frame />
                  <span className="truncate font-mono text-xs">{element.id}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {itemKindLabel(element.kind)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {variables.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Variables">
                {variables.map((entry) => (
                  <CommandItem
                    key={`${entry.group}.${entry.name}`}
                    value={`${entry.name} ${entry.expression}`}
                    keywords={[entry.group, entry.detail ?? '']}
                    onSelect={() => run(() => onPickExpression(entry.expression, entry.name))}
                  >
                    <Braces />
                    <span className="truncate font-mono text-xs">{entry.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {entry.group}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
          <CommandGroup heading="Acciones">
            {PALETTE_ACTIONS.map((action) => {
              const disabled = NEEDS_DOCUMENT.has(action.id) && !hasDocument;
              return (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.group}`}
                  disabled={disabled}
                  onSelect={() => run(() => onAction(action.id))}
                >
                  {ACTION_ICONS[action.id]}
                  <span>{action.label}</span>
                  {action.shortcut ? (
                    <CommandShortcut>{action.shortcut}</CommandShortcut>
                  ) : (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {action.group}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
