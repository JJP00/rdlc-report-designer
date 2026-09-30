import type { BatchableCommand, ItemDto, StylePatch } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Bold,
  Italic,
  Trash2,
  Underline,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { alignBoxes, alignCommands, distributeCommands } from '@/lib/align';
import { toCm } from '@/lib/projection';

export interface MultiSelectionPanelProps {
  /** Items seleccionados (en orden de selección). */
  items: ItemDto[];
  /** De los seleccionados, los que pueden moverse (no contenido de celda). */
  movableIds: string[];
  /** Envía los comandos como un solo paso de undo (`batch`). */
  onBatchEdit: (commands: BatchableCommand[]) => void;
}

/**
 * Panel de edición en lote (U3): propiedades comunes del estilo, alinear y
 * distribuir y borrado de la multiselección. Todo se envía en **un solo
 * `batch`** (un paso de undo) y el lienzo refresca con la proyección.
 */
export function MultiSelectionPanel({
  items,
  movableIds,
  onBatchEdit,
}: MultiSelectionPanelProps): ReactNode {
  const movable = alignBoxes(items, movableIds);
  const count = items.length;

  const styleCommands = (patch: StylePatch): BatchableCommand[] =>
    items.map((item) => ({ cmd: 'setStyle', id: item.id, style: patch }));

  const bold = items.every((item) => item.style?.fontWeight === 'Bold');
  const italic = items.every((item) => item.style?.fontStyle === 'Italic');
  const underlined = items.every((item) => item.style?.textDecoration === 'Underline');

  const allTextboxes = items.every((item) => item.kind === 'textbox');
  const family = allTextboxes ? (items[0]?.style?.fontFamily ?? '') : '';
  const [familyDraft, setFamilyDraft] = useState(family);
  useEffect(() => setFamilyDraft(family), [family]);
  const fontSize = items[0]?.style?.fontSize ? toCm(items[0].style.fontSize!) * 10 : 10;
  const color = items[0]?.style?.color ?? '#111827';
  const background = items[0]?.style?.backgroundColor ?? '#ffffff';

  return (
    <div className="flex flex-col gap-3 border-b p-3" data-testid="multi-selection-panel">
      <header className="text-sm font-medium">
        Selección múltiple
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({count} elementos)
        </span>
        <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
          Los cambios se aplican a todos en un solo paso de undo.
        </p>
      </header>

      {/* Estilo común */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Texto</span>
        <div className="flex items-center gap-1">
          <Input
            value={familyDraft}
            onChange={(event) => setFamilyDraft(event.target.value)}
            onBlur={() => {
              if (familyDraft && familyDraft !== family) {
                onBatchEdit(styleCommands({ fontFamily: familyDraft }));
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            aria-label="Fuente de la selección"
            placeholder="Fuente"
            className="h-7 text-[11px]"
          />
          <NumberInput
            value={fontSize}
            min={1}
            max={200}
            suffix="pt"
            label="Tamaño de la selección (pt)"
            onCommit={(value) => onBatchEdit(styleCommands({ fontSize: { value, unit: 'pt' } }))}
            className="w-16"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={bold ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Negrita en la selección"
            aria-pressed={bold}
            onClick={() => onBatchEdit(styleCommands({ fontWeight: bold ? 'Normal' : 'Bold' }))}
          >
            <Bold />
          </Button>
          <Button
            variant={italic ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Cursiva en la selección"
            aria-pressed={italic}
            onClick={() => onBatchEdit(styleCommands({ fontStyle: italic ? 'Normal' : 'Italic' }))}
          >
            <Italic />
          </Button>
          <Button
            variant={underlined ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Subrayado en la selección"
            aria-pressed={underlined}
            onClick={() =>
              onBatchEdit(styleCommands({ textDecoration: underlined ? 'None' : 'Underline' }))
            }
          >
            <Underline />
          </Button>
          <label className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            Color
            <input
              type="color"
              aria-label="Color de texto de la selección"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#111827'}
              onChange={(event) => onBatchEdit(styleCommands({ color: event.target.value }))}
              className="h-6 w-8 cursor-pointer rounded border"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Fondo
            <input
              type="color"
              aria-label="Color de fondo de la selección"
              value={/^#[0-9a-fA-F]{6}$/.test(background) ? background : '#ffffff'}
              onChange={(event) => onBatchEdit(styleCommands({ backgroundColor: event.target.value }))}
              className="h-6 w-8 cursor-pointer rounded border"
            />
          </label>
        </div>
      </section>

      {/* Alinear / distribuir */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Alinear {movable.length < 2 ? '(necesita 2 elementos movibles)' : ''}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <AlignButton
            label="Alinear a la izquierda"
            icon={<AlignStartVertical />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'left'))}
          />
          <AlignButton
            label="Centrar horizontalmente"
            icon={<AlignCenterVertical />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'centerX'))}
          />
          <AlignButton
            label="Alinear a la derecha"
            icon={<AlignEndVertical />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'right'))}
          />
          <AlignButton
            label="Alinear arriba"
            icon={<AlignStartHorizontal />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'top'))}
          />
          <AlignButton
            label="Centrar verticalmente"
            icon={<AlignCenterHorizontal />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'middleY'))}
          />
          <AlignButton
            label="Alinear abajo"
            icon={<AlignEndHorizontal />}
            disabled={movable.length < 2}
            onClick={() => onBatchEdit(alignCommands(movable, 'bottom'))}
          />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          Distribuir {movable.length < 3 ? '(necesita 3 elementos movibles)' : ''}
        </span>
        <div className="flex items-center gap-1">
          <AlignButton
            label="Distribuir horizontalmente"
            icon={<AlignHorizontalDistributeCenter />}
            disabled={movable.length < 3}
            onClick={() => onBatchEdit(distributeCommands(movable, 'x'))}
          />
          <AlignButton
            label="Distribuir verticalmente"
            icon={<AlignVerticalDistributeCenter />}
            disabled={movable.length < 3}
            onClick={() => onBatchEdit(distributeCommands(movable, 'y'))}
          />
        </div>
      </section>

      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => onBatchEdit(items.map((item) => ({ cmd: 'deleteItem', id: item.id })))}
      >
        <Trash2 data-icon="inline-start" />
        Eliminar los {count} elementos
      </Button>
    </div>
  );
}

function AlignButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
