import type { NewItemSpec } from '@rdlc-designer/contracts';
import {
  Copy,
  FolderOpen,
  Image,
  Minus,
  Plus,
  Redo2,
  Save,
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
import { Separator } from '@/components/ui/separator';
import { ITEM_DRAG_TYPE } from '@/lib/dragTypes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface EditorToolbarProps {
  hasDocument: boolean;
  hasSelection: boolean;
  selectedId: string | null;
  zoom: number;
  showVariables: boolean;
  onOpen: () => void;
  onSave: () => void;
  onClose: () => void;
  onOpenProperties: () => void;
  onToggleVariables: () => void;
  onInsert: (kind: NewItemSpec['kind']) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (zoom: number) => void;
}

/** Toolbar superior: fichero, informe, insertar (arrastrable), edición y zoom. */
export function EditorToolbar({
  hasDocument,
  hasSelection,
  selectedId,
  zoom,
  showVariables,
  onOpen,
  onSave,
  onClose,
  onOpenProperties,
  onToggleVariables,
  onInsert,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
  onZoomChange,
}: EditorToolbarProps): ReactNode {
  return (
    <TooltipProvider>
      <header className="flex items-center gap-1.5 border-b bg-background px-3 py-1.5">
        <span className="mr-2 text-sm font-semibold">RDLC Report Designer</span>

        <Button variant="outline" size="sm" onClick={onOpen}>
          <FolderOpen data-icon="inline-start" />
          Abrir…
        </Button>
        <Button variant="outline" size="sm" onClick={onSave} disabled={!hasDocument}>
          <Save data-icon="inline-start" />
          Guardar
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onZoomChange(Math.max(0.2, zoom - 0.1))}
            aria-label="Reducir zoom"
          >
            <Minus />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
            aria-label="Aumentar zoom"
          >
            <Plus />
          </Button>
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
