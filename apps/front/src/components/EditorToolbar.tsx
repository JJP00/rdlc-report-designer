import type { NewItemSpec } from '@rdlc-designer/contracts';
import {
  Check,
  ChevronDown,
  Copy,
  FilePlus,
  FolderOpen,
  Image,
  ListTree,
  Minus,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Settings2,
  Square,
  Table,
  Trash2,
  Type,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { ITEM_DRAG_TYPE } from '@/lib/dragTypes';
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
  onInsert: (kind: NewItemSpec['kind']) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (zoom: number) => void;
  /** Zoom «ajustar al ancho» (Ctrl+1). */
  onZoomFitWidth: () => void;
}

/**
 * Toolbar superior: fichero, informe, insertar (arrastrable), edición y zoom.
 * En anchos estrechos se puede desplazar en horizontal y las etiquetas largas
 * se pliegan a icono (con `aria-label` y tooltip).
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
        <InsertGroup disabled={!props.hasDocument} onInsert={props.onInsert} />
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
        <ZoomGroup
          zoom={props.zoom}
          onZoomChange={props.onZoomChange}
          onZoomFitWidth={props.onZoomFitWidth}
        />
      </header>
    </TooltipProvider>
  );
}

/** Nuevo / Abrir / recientes / Guardar / Guardar como / Cerrar. */
function FileGroup({
  hasDocument,
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
  | 'recents'
  | 'onNew'
  | 'onOpen'
  | 'onOpenRecent'
  | 'onSave'
  | 'onSaveAs'
  | 'onClose'
>): ReactNode {
  return (
    <>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onNew}>
        <FilePlus data-icon="inline-start" />
        Nuevo
      </Button>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onOpen}>
        <FolderOpen data-icon="inline-start" />
        Abrir…
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            disabled={recents.length === 0}
            aria-label="Abrir un fichero reciente"
            title="Recientes"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-96">
          <DropdownMenuLabel>Recientes</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onSave}
        disabled={!hasDocument}
      >
        <Save data-icon="inline-start" />
        Guardar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onSaveAs}
        disabled={!hasDocument}
        aria-label="Guardar como…"
      >
        <SaveAll data-icon="inline-start" />
        <span className="hidden 2xl:inline">Guardar como…</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={onClose}
        disabled={!hasDocument}
        aria-label="Cerrar"
      >
        <X data-icon="inline-start" />
        <span className="hidden xl:inline">Cerrar</span>
      </Button>
    </>
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
        className="shrink-0"
        onClick={onOpenProperties}
        disabled={!hasDocument}
        aria-label="Informe…"
      >
        <Settings2 data-icon="inline-start" />
        <span className="hidden xl:inline">Informe…</span>
      </Button>
      <Button
        variant={showVariables ? 'secondary' : 'ghost'}
        size="sm"
        className="shrink-0"
        onClick={onToggleVariables}
        disabled={!hasDocument}
        aria-label="Variables"
      >
        <Variable data-icon="inline-start" />
        <span className="hidden 2xl:inline">Variables</span>
      </Button>
      <Button
        variant={showHierarchy ? 'secondary' : 'ghost'}
        size="sm"
        className="shrink-0"
        onClick={onToggleHierarchy}
        disabled={!hasDocument}
        aria-label="Jerarquía"
      >
        <ListTree data-icon="inline-start" />
        <span className="hidden 2xl:inline">Jerarquía</span>
      </Button>
    </>
  );
}

/** Los cinco botones de insertar (click o arrastrar al lienzo). */
function InsertGroup({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (kind: NewItemSpec['kind']) => void;
}): ReactNode {
  return (
    <>
      <InsertButton
        kind="textbox"
        label="Insertar textbox"
        icon={<Type />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="rectangle"
        label="Insertar rectángulo"
        icon={<Square />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="line"
        label="Insertar línea"
        icon={<Minus />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="image"
        label="Insertar imagen"
        icon={<Image />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="tablix"
        label="Insertar tabla (Tablix)"
        icon={<Table />}
        disabled={disabled}
        onInsert={onInsert}
      />
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
            className="shrink-0"
            onClick={onUndo}
            disabled={!hasDocument}
            aria-label="Deshacer"
          >
            <Undo2 data-icon="inline-start" />
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
            className="shrink-0"
            onClick={onRedo}
            disabled={!hasDocument}
            aria-label="Rehacer"
          >
            <Redo2 data-icon="inline-start" />
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

/** Botón de la toolbox: click inserta y **arrastrar** suelta el item en el lienzo. */
function InsertButton({
  kind,
  label,
  icon,
  disabled,
  onInsert,
}: {
  kind: NewItemSpec['kind'];
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onInsert: (kind: NewItemSpec['kind']) => void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          draggable={!disabled}
          onDragStart={(event) => {
            event.dataTransfer.setData(ITEM_DRAG_TYPE, kind);
            event.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onInsert(kind)}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label} (o arrástralo al lienzo)</TooltipContent>
    </Tooltip>
  );
}
