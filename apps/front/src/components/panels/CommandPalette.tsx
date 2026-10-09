import type { ProjectionDto } from '@rdlc-designer/contracts';
import {
  Braces,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Filter,
  FolderOpen,
  Frame,
  Image,
  ListTree,
  Minus,
  Moon,
  MoveHorizontal,
  PencilLine,
  Percent,
  Redo2,
  Save,
  SaveAll,
  Settings2,
  Square,
  Table,
  Type,
  Undo2,
  Variable,
  X,
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
import {
  PALETTE_ACTIONS,
  PALETTE_ACTION_MARK,
  paletteDisabledActions,
  paletteFilter,
  paletteElements,
  type PaletteActionId,
  type PaletteCapabilities,
} from '@/lib/palette';
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
  /** Estado del editor: qué acciones están habilitadas. */
  capabilities: PaletteCapabilities;
}

const ACTION_ICONS: Record<PaletteActionId, ReactNode> = {
  new: <FilePlus />,
  open: <FolderOpen />,
  save: <Save />,
  'save-as': <SaveAll />,
  close: <X />,
  undo: <Undo2 />,
  redo: <Redo2 />,
  'zoom:fit-width': <MoveHorizontal />,
  'zoom:100': <Percent />,
  'edit-text': <PencilLine />,
  'tablix-filters': <Filter />,
  'insert:textbox': <Type />,
  'insert:rectangle': <Square />,
  'insert:line': <Minus />,
  'insert:image': <Image />,
  'insert:tablix': <Table />,
  'toggle-variables': <Variable />,
  'toggle-hierarchy': <ListTree />,
  'toggle-theme': <Moon />,
  'tab:next': <ChevronRight />,
  'tab:prev': <ChevronLeft />,
  'tab:move-left': <ArrowLeftToLine />,
  'tab:move-right': <ArrowRightToLine />,
  'report-properties': <Settings2 />,
};

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
  capabilities,
}: CommandPaletteProps): ReactNode {
  const elements = useMemo(() => (projection ? paletteElements(projection) : []), [projection]);
  const variables = useMemo(
    () => (projection ? variableEntries(projection.meta) : []),
    [projection],
  );
  const disabledActions = useMemo(() => paletteDisabledActions(capabilities), [capabilities]);

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
      <Command filter={paletteFilter}>
        <CommandInput placeholder="Buscar elemento, variable o acción…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>

          <CommandGroup heading="Acciones">
            {PALETTE_ACTIONS.map((action) => {
              const disabled = disabledActions.has(action.id);
              return (
                <CommandItem
                  key={action.id}
                  value={`${PALETTE_ACTION_MARK}${action.label}`}
                  keywords={[action.group]}
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

          {elements.length > 0 ? (
            <>
              <CommandSeparator />
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
            </>
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
