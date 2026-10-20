import {
  Check,
  ChevronDown,
  Copy,
  FilePlus,
  FileText,
  FolderOpen,
  History,
  Languages,
  ListTree,
  Minus,
  Moon,
  Plus,
  Redo2,
  Search,
  Save,
  SaveAll,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  Variable,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { LOCALE_LABELS } from '@rdlc-designer/i18n';
import { useLocale, useT } from '@rdlc-designer/i18n/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { clampZoom, ZOOM_PRESETS } from '@/lib/zoom';

export interface EditorToolbarProps {
  hasDocument: boolean;
  hasSelection: boolean;
  selectedId: string | null;
  zoom: number;
  showVariables: boolean;
  /** Panel de jerarquía visible (U4). */
  showHierarchy: boolean;
  /** Tema claro/oscuro del editor (el toggle vive en la toolbar). */
  theme: 'light' | 'dark';
  /** Hay una operación de fichero en curso (BUG-54): grupo Fichero deshabilitado. */
  busy?: boolean;
  /** Ficheros recientes (desplegable del botón Abrir). */
  recents: string[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onClose: () => void;
  onOpenProperties: () => void;
  /** Abre la paleta de comandos (Ctrl+K). */
  onOpenPalette: () => void;
  onToggleVariables: () => void;
  onToggleHierarchy: () => void;
  onToggleTheme: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (zoom: number) => void;
  /** Zoom «ajustar al ancho» (Ctrl+1). */
  onZoomFitWidth: () => void;
}

/**
 * Toolbar superior: menú **Fichero** (Nuevo/Abrir/Guardar/Cerrar), informe y
 * edición (duplicar/eliminar/deshacer) más el zoom. Los botones de insertar
 * viven en la barra de formato (`FormatToolbar`). En anchos estrechos se puede
 * desplazar en horizontal y las etiquetas largas se pliegan a icono (con
 * `aria-label` y tooltip).
 */
export function EditorToolbar(props: EditorToolbarProps): ReactNode {
  const t = useT();
  // El botón ofrece el modo contrario al vigente.
  const themeLabel = props.theme === 'dark' ? t('toolbar.theme.light') : t('toolbar.theme.dark');

  return (
    <TooltipProvider>
      <header className="flex items-center gap-1.5 overflow-x-auto border-b bg-chrome px-3 py-1.5">
        <span className="mr-2 hidden whitespace-nowrap text-sm font-semibold xl:inline">
          RDLC Report Designer
        </span>
        <FileGroup
          hasDocument={props.hasDocument}
          busy={props.busy}
          recents={props.recents}
          onNew={props.onNew}
          onOpen={props.onOpen}
          onOpenRecent={props.onOpenRecent}
          onSave={props.onSave}
          onSaveAs={props.onSaveAs}
          onClose={props.onClose}
        />
        <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
        <ReportGroup
          hasDocument={props.hasDocument}
          showVariables={props.showVariables}
          showHierarchy={props.showHierarchy}
          onOpenProperties={props.onOpenProperties}
          onToggleVariables={props.onToggleVariables}
          onToggleHierarchy={props.onToggleHierarchy}
        />
        <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
        <EditGroup
          hasDocument={props.hasDocument}
          hasSelection={props.hasSelection}
          onDuplicate={props.onDuplicate}
          onDelete={props.onDelete}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
        />
        <div className="flex-1" />
        {props.selectedId ? (
          <Badge variant="secondary" className="shrink-0 font-mono">
            {props.selectedId}
          </Badge>
        ) : null}
        <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
              onClick={props.onOpenPalette}
              aria-label={t('toolbar.palette.open')}
            >
              <Search />
              <span className="hidden 2xl:inline">Ctrl+K</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.palette.open')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={props.onToggleTheme}
              aria-label={themeLabel}
            >
              {props.theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{themeLabel}</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
        <ZoomGroup
          zoom={props.zoom}
          onZoomChange={props.onZoomChange}
          onZoomFitWidth={props.onZoomFitWidth}
        />
      </header>
    </TooltipProvider>
  );
}

/** Menú «Fichero»: Nuevo / Abrir … / recientes / Guardar / Cerrar / Idioma. */
function FileGroup({
  hasDocument,
  busy = false,
  recents,
  onNew,
  onOpen,
  onOpenRecent,
  onSave,
  onSaveAs,
  onClose,
}: Pick<
  EditorToolbarProps,
  | 'hasDocument'
  | 'busy'
  | 'recents'
  | 'onNew'
  | 'onOpen'
  | 'onOpenRecent'
  | 'onSave'
  | 'onSaveAs'
  | 'onClose'
>): ReactNode {
  const t = useT();
  const { locale, locales, setLocale } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0" aria-label={t('common.file')}>
          <FileText data-icon="inline-start" />
          {t('common.file')}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem disabled={busy} onSelect={onNew}>
          <FilePlus />
          {t('toolbar.file.new')}
          <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={onOpen}>
          <FolderOpen />
          {t('toolbar.file.open')}
          <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={busy || recents.length === 0}>
            <History />
            {t('toolbar.file.recent')}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasDocument || busy} onSelect={onSave}>
          <Save />
          {t('toolbar.file.save')}
          <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasDocument || busy} onSelect={onSaveAs}>
          <SaveAll />
          {t('toolbar.file.saveAs')}
          <DropdownMenuShortcut>{t('common.shortcuts.saveAs')}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasDocument} onSelect={onClose}>
          <X />
          {t('common.close')}
          <DropdownMenuShortcut>Ctrl+W</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages />
            {t('common.language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {locales.map((code) => (
              <DropdownMenuCheckboxItem
                key={code}
                checked={locale === code}
                onSelect={() => setLocale(code)}
              >
                {LOCALE_LABELS[code]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Informe… / Variables / Jerarquía. */
function ReportGroup({
  hasDocument,
  showVariables,
  showHierarchy,
  onOpenProperties,
  onToggleVariables,
  onToggleHierarchy,
}: Pick<
  EditorToolbarProps,
  | 'hasDocument'
  | 'showVariables'
  | 'showHierarchy'
  | 'onOpenProperties'
  | 'onToggleVariables'
  | 'onToggleHierarchy'
>): ReactNode {
  const t = useT();

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-[7px] xl:pl-1.5 xl:pr-2.5"
            onClick={onOpenProperties}
            disabled={!hasDocument}
            aria-label={t('toolbar.report.open')}
          >
            <Settings2 />
            <span className="hidden xl:inline">{t('toolbar.report.open')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.report.propertiesTooltip')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showVariables ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
            onClick={onToggleVariables}
            disabled={!hasDocument}
            aria-label={t('toolbar.report.variables')}
          >
            <Variable />
            <span className="hidden 2xl:inline">{t('toolbar.report.variables')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.report.toggleVariables')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showHierarchy ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
            onClick={onToggleHierarchy}
            disabled={!hasDocument}
            aria-label={t('toolbar.report.hierarchy')}
          >
            <ListTree />
            <span className="hidden 2xl:inline">{t('toolbar.report.hierarchy')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.report.toggleHierarchy')}</TooltipContent>
      </Tooltip>
    </>
  );
}

/** Duplicar / Eliminar y Deshacer / Rehacer. */
function EditGroup({
  hasDocument,
  hasSelection,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
}: Pick<
  EditorToolbarProps,
  'hasDocument' | 'hasSelection' | 'onDuplicate' | 'onDelete' | 'onUndo' | 'onRedo'
>): ReactNode {
  const t = useT();
  const duplicateTooltip = t('toolbar.edit.duplicateTooltip', {
    action: t('toolbar.edit.duplicate'),
  });
  const deleteTooltip = t('toolbar.edit.deleteTooltip', { action: t('toolbar.edit.delete') });

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasSelection}
            onClick={onDuplicate}
            aria-label={duplicateTooltip}
          >
            <Copy />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{duplicateTooltip}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasSelection}
            onClick={onDelete}
            aria-label={deleteTooltip}
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{deleteTooltip}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
            onClick={onUndo}
            disabled={!hasDocument}
            aria-label={t('common.undo')}
          >
            <Undo2 />
            <span className="hidden 2xl:inline">{t('common.undo')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t('toolbar.edit.undoTooltip', { action: t('common.undo') })}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
            onClick={onRedo}
            disabled={!hasDocument}
            aria-label={t('common.redo')}
          >
            <Redo2 />
            <span className="hidden 2xl:inline">{t('common.redo')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t('toolbar.edit.redoTooltip', { action: t('common.redo') })}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

/** Zoom: −, porcentaje con presets, +. */
function ZoomGroup({
  zoom,
  onZoomChange,
  onZoomFitWidth,
}: Pick<EditorToolbarProps, 'zoom' | 'onZoomChange' | 'onZoomFitWidth'>): ReactNode {
  const t = useT();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onZoomChange(clampZoom(zoom - 0.1))}
            aria-label={t('toolbar.zoom.out')}
          >
            <Minus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.zoom.out')}</TooltipContent>
      </Tooltip>

      {/* Un clic en el porcentaje abre los presets y «ajustar al ancho». */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-14 justify-center px-1 text-xs tabular-nums"
            aria-label={t('toolbar.zoom.ariaLabel', { percent: Math.round(zoom * 100) })}
            title={t('toolbar.zoom.title')}
          >
            {Math.round(zoom * 100)}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t('toolbar.zoom.label')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onZoomFitWidth}>
            {t('toolbar.zoom.fitWidth')}
            <DropdownMenuShortcut>Ctrl+1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onZoomChange(1)}>
            {t('toolbar.zoom.actualSize')}
            <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ZOOM_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} onSelect={() => onZoomChange(preset)}>
              <span className="tabular-nums">
                {t('toolbar.zoom.percent', { percent: Math.round(preset * 100) })}
              </span>
              {Math.abs(zoom - preset) < 0.005 ? <Check aria-hidden /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onZoomChange(clampZoom(zoom + 0.1))}
            aria-label={t('toolbar.zoom.in')}
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.zoom.in')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
