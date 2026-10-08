import {
  Check,
  ChevronDown,
  Copy,
  FilePlus,
  FileText,
  FolderOpen,
  History,
  ListTree,
  Minus,
  Moon,
  Plus,
  Redo2,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
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
  return (
    <TooltipProvider>
      <header className="flex items-center gap-1.5 overflow-x-auto border-b bg-background px-3 py-1.5">
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
              size="icon-sm"
              className="shrink-0"
              onClick={props.onToggleTheme}
              aria-label={props.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {props.theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {props.theme === 'dark' ? 'Modo claro' : 'Modo oscuro (blanco y negro)'}
          </TooltipContent>
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

/** Menú «Fichero»: Nuevo / Abrir … / recientes / Guardar / Cerrar. */
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0" aria-label="Fichero">
          <FileText data-icon="inline-start" />
          Fichero
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem disabled={busy} onSelect={onNew}>
          <FilePlus />
          Nuevo
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
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasDocument || busy} onSelect={onSave}>
          <Save />
          Guardar
          <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasDocument || busy} onSelect={onSaveAs}>
          <SaveAll />
          Guardar como…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasDocument} onSelect={onClose}>
          <X />
          Cerrar
        </DropdownMenuItem>
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
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 px-[7px] xl:pl-1.5 xl:pr-2.5"
        onClick={onOpenProperties}
        disabled={!hasDocument}
        aria-label="Informe…"
      >
        <Settings2 />
        <span className="hidden xl:inline">Informe…</span>
      </Button>
      <Button
        variant={showVariables ? 'secondary' : 'ghost'}
        size="sm"
        className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
        onClick={onToggleVariables}
        disabled={!hasDocument}
        aria-label="Variables"
      >
        <Variable />
        <span className="hidden 2xl:inline">Variables</span>
      </Button>
      <Button
        variant={showHierarchy ? 'secondary' : 'ghost'}
        size="sm"
        className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
        onClick={onToggleHierarchy}
        disabled={!hasDocument}
        aria-label="Jerarquía"
      >
        <ListTree />
        <span className="hidden 2xl:inline">Jerarquía</span>
      </Button>
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
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasSelection}
            onClick={onDuplicate}
            aria-label="Duplicar (Ctrl+D)"
          >
            <Copy />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Duplicar (Ctrl+D)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasSelection}
            onClick={onDelete}
            aria-label="Eliminar (Supr)"
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Eliminar (Supr)</TooltipContent>
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
            aria-label="Deshacer"
          >
            <Undo2 />
            <span className="hidden 2xl:inline">Deshacer</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ctrl+Z</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-[7px] 2xl:pl-1.5 2xl:pr-2.5"
            onClick={onRedo}
            disabled={!hasDocument}
            aria-label="Rehacer"
          >
            <Redo2 />
            <span className="hidden 2xl:inline">Rehacer</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ctrl+Shift+Z o Ctrl+Y</TooltipContent>
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
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onZoomChange(clampZoom(zoom - 0.1))}
            aria-label="Reducir zoom"
          >
            <Minus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reducir zoom</TooltipContent>
      </Tooltip>

      {/* Un clic en el porcentaje abre los presets y «ajustar al ancho». */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-14 justify-center px-1 text-xs tabular-nums"
            aria-label={`Zoom: ${Math.round(zoom * 100)} %`}
            title="Zoom: presets y atajos"
          >
            {Math.round(zoom * 100)}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Zoom</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onZoomFitWidth}>
            Ajustar al ancho
            <DropdownMenuShortcut>Ctrl+1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onZoomChange(1)}>
            Tamaño real (100 %)
            <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ZOOM_PRESETS.map((preset) => (
            <DropdownMenuItem key={preset} onSelect={() => onZoomChange(preset)}>
              <span className="tabular-nums">{Math.round(preset * 100)} %</span>
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
            aria-label="Aumentar zoom"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Aumentar zoom</TooltipContent>
      </Tooltip>
    </div>
  );
}
