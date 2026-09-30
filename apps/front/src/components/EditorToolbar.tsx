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

/** Toolbar superior: fichero, informe, insertar (arrastrable), edición y zoom. */
export function EditorToolbar({
  hasDocument,
  hasSelection,
  selectedId,
  zoom,
  showVariables,
  showHierarchy,
  recents,
  onNew,
  onOpen,
  onOpenRecent,
  onSave,
  onSaveAs,
  onClose,
  onOpenProperties,
  onToggleVariables,
  onToggleHierarchy,
  onInsert,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
  onZoomChange,
  onZoomFitWidth,
}: EditorToolbarProps): ReactNode {
  return (
    <TooltipProvider>
      <header className="flex items-center gap-1.5 border-b bg-background px-3 py-1.5">
        <span className="mr-2 text-sm font-semibold">RDLC Report Designer</span>

        <Button variant="outline" size="sm" onClick={onNew}>
          <FilePlus data-icon="inline-start" />
          Nuevo
        </Button>
        <Button variant="outline" size="sm" onClick={onOpen}>
          <FolderOpen data-icon="inline-start" />
          Abrir…
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
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
        <Button variant="outline" size="sm" onClick={onSave} disabled={!hasDocument}>
          <Save data-icon="inline-start" />
          Guardar
        </Button>
        <Button variant="outline" size="sm" onClick={onSaveAs} disabled={!hasDocument}>
          <SaveAll data-icon="inline-start" />
          Guardar como…
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={!hasDocument}>
          <X data-icon="inline-start" />
          Cerrar
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" onClick={onOpenProperties} disabled={!hasDocument}>
          <Settings2 data-icon="inline-start" />
          Informe…
        </Button>
        <Button
          variant={showVariables ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleVariables}
          disabled={!hasDocument}
        >
          <Variable data-icon="inline-start" />
          Variables
        </Button>
        <Button
          variant={showHierarchy ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleHierarchy}
          disabled={!hasDocument}
        >
          <ListTree data-icon="inline-start" />
          Jerarquía
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <InsertButton
          kind="textbox"
          label="Insertar textbox"
          icon={<Type />}
          disabled={!hasDocument}
          onInsert={onInsert}
        />
        <InsertButton
          kind="rectangle"
          label="Insertar rectángulo"
          icon={<Square />}
          disabled={!hasDocument}
          onInsert={onInsert}
        />
        <InsertButton
          kind="line"
          label="Insertar línea"
          icon={<Minus />}
          disabled={!hasDocument}
          onInsert={onInsert}
        />
        <InsertButton
          kind="image"
          label="Insertar imagen"
          icon={<Image />}
          disabled={!hasDocument}
          onInsert={onInsert}
        />
        <InsertButton
          kind="tablix"
          label="Insertar tabla (Tablix)"
          icon={<Table />}
          disabled={!hasDocument}
          onInsert={onInsert}
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

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

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onUndo} disabled={!hasDocument}>
              <Undo2 data-icon="inline-start" />
              Deshacer
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ctrl+Z</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onRedo} disabled={!hasDocument}>
              <Redo2 data-icon="inline-start" />
              Rehacer
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ctrl+Shift+Z o Ctrl+Y</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {selectedId ? (
          <Badge variant="secondary" className="font-mono">
            {selectedId}
          </Badge>
        ) : null}

        <Separator orientation="vertical" className="mx-1 h-5" />
        <div className="flex items-center gap-1">
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
      </header>
    </TooltipProvider>
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
