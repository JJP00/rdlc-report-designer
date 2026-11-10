import type { ProjectionDto } from '@rdlc-designer/contracts';
import { LOCALE_LABELS } from '@rdlc-designer/i18n';
import { useLocale, useT } from '@rdlc-designer/i18n/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Braces,
  ArrowLeftToLine,
  ArrowRightToLine,
  BringToFront,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Copy,
  CopyPlus,
  CornerLeftUp,
  FilePlus,
  Filter,
  FolderOpen,
  Frame,
  History,
  Image,
  Italic,
  Languages,
  List,
  ListOrdered,
  ListTree,
  ListX,
  Minus,
  Moon,
  MoveHorizontal,
  PanelRight,
  PencilLine,
  Percent,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  SaveAll,
  Scissors,
  SendToBack,
  Settings2,
  Square,
  Table,
  Trash2,
  Type,
  Underline,
  Undo2,
  Variable,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { RecentPath } from '@/components/RecentPath';
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
  PALETTE_CATEGORY_KEYS,
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
  /** Informes recientes (rutas) y abrir uno. */
  recents: string[];
  onOpenRecent: (path: string) => void;
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
  'toggle-inspector': <PanelRight />,
  'toggle-problems': <CircleAlert />,
  'reset-panels': <RotateCcw />,
  'toggle-theme': <Moon />,
  'tab:next': <ChevronRight />,
  'tab:prev': <ChevronLeft />,
  'tab:move-left': <ArrowLeftToLine />,
  'tab:move-right': <ArrowRightToLine />,
  'tab:close-others': <X />,
  'tab:close-right': <X />,
  'tab:close-saved': <X />,
  'tab:close-all': <X />,
  'zoom:in': <ZoomIn />,
  'zoom:out': <ZoomOut />,
  copy: <Copy />,
  cut: <Scissors />,
  paste: <ClipboardPaste />,
  duplicate: <CopyPlus />,
  delete: <Trash2 />,
  'bring-to-front': <BringToFront />,
  'send-to-back': <SendToBack />,
  'select-parent': <CornerLeftUp />,
  'format:bold': <Bold />,
  'format:italic': <Italic />,
  'format:underline': <Underline />,
  'align:left': <AlignLeft />,
  'align:center': <AlignCenter />,
  'align:right': <AlignRight />,
  'valign:top': <AlignVerticalJustifyStart />,
  'valign:middle': <AlignVerticalJustifyCenter />,
  'valign:bottom': <AlignVerticalJustifyEnd />,
  'list:bulleted': <List />,
  'list:numbered': <ListOrdered />,
  'list:none': <ListX />,
  'check-updates': <RefreshCw />,
  'report-properties': <Settings2 />,
};

/**
 * Paleta de comandos (Ctrl+K): busca **acciones** del editor (las de la barra,
 * los menús y los atajos), **informes recientes**, **elementos** del informe
 * (por nombre y por contenido) y **variables** (campos, parámetros, funciones de
 * `<Code>`, Globals!, User!).
 */
export function CommandPalette({
  open,
  onOpenChange,
  projection,
  onSelectItem,
  onPickExpression,
  onAction,
  capabilities,
  recents,
  onOpenRecent,
}: CommandPaletteProps): ReactNode {
  const t = useT();
  const { locale, locales, setLocale } = useLocale();
  const appGroup = t(PALETTE_CATEGORY_KEYS.app);
  const elements = useMemo(() => (projection ? paletteElements(projection) : []), [projection]);
  const variables = useMemo(
    () => (projection ? variableEntries(projection.meta, t) : []),
    [projection, t],
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
      title={t('palette.dialog.title')}
      description={t('palette.dialog.description')}
    >
      <Command filter={paletteFilter}>
        <CommandInput placeholder={t('palette.search.placeholder')} />
        <CommandList>
          <CommandEmpty>{t('palette.search.empty')}</CommandEmpty>

          <CommandGroup heading={t('palette.section.actions')}>
            {PALETTE_ACTIONS.map((action) => {
              const disabled = disabledActions.has(action.id);
              const label = t(action.labelKey);
              const group = t(PALETTE_CATEGORY_KEYS[action.group]);
              return (
                <CommandItem
                  key={action.id}
                  value={`${PALETTE_ACTION_MARK}${label}`}
                  keywords={[group]}
                  disabled={disabled}
                  onSelect={() => run(() => onAction(action.id))}
                >
                  {ACTION_ICONS[action.id]}
                  <span>{label}</span>
                  {action.shortcutKey || action.shortcut ? (
                    <CommandShortcut>
                      {action.shortcutKey ? t(action.shortcutKey) : action.shortcut}
                    </CommandShortcut>
                  ) : (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {group}
                    </span>
                  )}
                </CommandItem>
              );
            })}
            {/* Idioma: una entrada por cada idioma distinto del actual. */}
            {locales
              .filter((code) => code !== locale)
              .map((code) => {
                const label = t('palette.action.switchLanguage', { language: LOCALE_LABELS[code] });
                return (
                  <CommandItem
                    key={`language:${code}`}
                    value={`${PALETTE_ACTION_MARK}${label}`}
                    keywords={[appGroup, LOCALE_LABELS[code]]}
                    onSelect={() => run(() => setLocale(code))}
                  >
                    <Languages />
                    <span>{label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {appGroup}
                    </span>
                  </CommandItem>
                );
              })}
          </CommandGroup>

          {recents.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={t('palette.section.recents')}>
                {recents.map((path) => (
                  <CommandItem
                    key={path}
                    value={`recent:${path}`}
                    keywords={[path]}
                    title={path}
                    onSelect={() => run(() => onOpenRecent(path))}
                  >
                    <History />
                    <RecentPath path={path} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {elements.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={t('palette.section.elements')}>
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
              <CommandGroup heading={t('palette.section.variables')}>
                {variables.map((entry) => (
                  <CommandItem
                    key={`${entry.group}.${entry.name}`}
                    value={`${entry.name} ${entry.expression}`}
                    keywords={[entry.groupLabel ?? entry.group, entry.detail ?? '']}
                    onSelect={() => run(() => onPickExpression(entry.expression, entry.name))}
                  >
                    <Braces />
                    <span className="truncate font-mono text-xs">{entry.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {entry.groupLabel ?? entry.group}
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
