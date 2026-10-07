import type { NewItemSpec, StyleDto, StylePatch } from '@rdlc-designer/contracts';
import { DEFAULT_FONT_FAMILY } from '@rdlc-designer/contracts';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Image,
  Italic,
  List,
  ListOrdered,
  ListX,
  Minus,
  Square,
  Table,
  Type,
  Underline,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { useAvailableFonts } from '@/hooks/useAvailableFonts';
import { ITEM_DRAG_TYPE } from '@/lib/dragTypes';
import { cn } from '@/lib/utils';
import { toHexColor, toPt } from '@/lib/style';

interface FormatToolbarProps {
  style: StyleDto | undefined;
  onSetStyle: (patch: StylePatch) => void;
  /** Sin selección los controles de formato se muestran deshabilitados. */
  disabled?: boolean;
  /** Insertar un item nuevo (click) o arrastrarlo al lienzo. */
  onInsert: (kind: NewItemSpec['kind']) => void;
  /** Sin documento abierto no se puede insertar. */
  insertDisabled?: boolean;
}

/**
 * Barra de formato de texto (como la de Report Builder): fuente, tamaño,
 * negrita/cursiva/subrayado, color, resaltado, alineación/viñetas y los
 * **botones de insertar** (click o arrastrar al lienzo). Todo en **una sola
 * línea**. Aplica al `<Style>` de **todos** los items seleccionados (en lote)
 * vía `setStyle`, igual que el panel de selección múltiple.
 * Las fuentes ofrecidas son las disponibles en **Business Central** (lista
 * oficial vía IPC).
 */
export function FormatToolbar({
  style,
  onSetStyle,
  disabled,
  onInsert,
  insertDisabled,
}: FormatToolbarProps): ReactNode {
  const fonts = useAvailableFonts();

  // La fuente del estilo actual siempre debe poder seleccionarse.
  const options =
    style?.fontFamily && !fonts.includes(style.fontFamily) ? [style.fontFamily, ...fonts] : fonts;

  /** Tamaño en pt entero (pasos de 1, sin decimales). */
  const fontSizePt = style?.fontSize ? Math.round(toPt(style.fontSize)) : 10;

  const toggle = (
    active: boolean,
    patch: StylePatch,
    icon: ReactNode,
    title: string,
  ): ReactNode => (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="icon-xs"
      title={title}
      aria-label={title}
      onClick={() => onSetStyle(patch)}
    >
      {icon}
    </Button>
  );

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-background px-3 py-1.5">
      <div
        className={cn('flex items-center gap-1.5', disabled && 'pointer-events-none opacity-40')}
      >
        <select
          className="h-7 max-w-[130px] shrink-0 rounded-md border bg-background px-1 text-xs"
          value={style?.fontFamily ?? DEFAULT_FONT_FAMILY}
          aria-label="Fuente"
          onChange={(event) => onSetStyle({ fontFamily: event.target.value })}
        >
          {options.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>

        <NumberInput
          className="h-7 w-14 shrink-0"
          value={fontSizePt}
          label="Tamaño de fuente (pt)"
          title="Tamaño (pt): flechas o arrastre (enteros)"
          axis="x"
          min={4}
          max={72}
          step={1}
          perPx={0.1}
          decimals={0}
          disabled={disabled}
          onCommit={(pt) => onSetStyle({ fontSize: { value: Math.round(pt), unit: 'pt' } })}
        />

        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

        {toggle(
          style?.fontWeight === 'Bold',
          { fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' },
          <Bold />,
          'Negrita',
        )}
        {toggle(
          style?.fontStyle === 'Italic',
          { fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' },
          <Italic />,
          'Cursiva',
        )}
        {toggle(
          style?.textDecoration === 'Underline',
          { textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline' },
          <Underline />,
          'Subrayado',
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

        <ColorField
          title="Color de texto"
          value={toHexColor(style?.color, '#111827')}
          onChange={(color) => onSetStyle({ color })}
        />
        <ColorField
          title="Resaltado"
          value={toHexColor(style?.backgroundColor, '#ffffff')}
          onChange={(backgroundColor) => onSetStyle({ backgroundColor })}
          highlight
        />

        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

        {toggle(
          style?.textAlign === 'Left',
          { textAlign: 'Left' },
          <AlignLeft />,
          'Alinear izquierda',
        )}
        {toggle(style?.textAlign === 'Center', { textAlign: 'Center' }, <AlignCenter />, 'Centrar')}
        {toggle(
          style?.textAlign === 'Right',
          { textAlign: 'Right' },
          <AlignRight />,
          'Alinear derecha',
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />
        {toggle(style?.listStyle === 'Bulleted', { listStyle: 'Bulleted' }, <List />, 'Viñetas')}
        {toggle(
          style?.listStyle === 'Numbered',
          { listStyle: 'Numbered' },
          <ListOrdered />,
          'Numeración',
        )}
        {toggle(
          style?.listStyle === undefined || style?.listStyle === 'None',
          { listStyle: 'None' },
          <ListX />,
          'Sin lista',
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />
        {toggle(
          style?.verticalAlign === 'Top',
          { verticalAlign: 'Top' },
          <span className="text-[10px] leading-none">A↑</span>,
          'Alinear arriba',
        )}
        {toggle(
          style?.verticalAlign === 'Middle',
          { verticalAlign: 'Middle' },
          <span className="text-[10px] leading-none">A↕</span>,
          'Centrar vertical',
        )}
        {toggle(
          style?.verticalAlign === 'Bottom',
          { verticalAlign: 'Bottom' },
          <span className="text-[10px] leading-none">A↓</span>,
          'Alinear abajo',
        )}
      </div>

      <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

      <InsertGroup disabled={insertDisabled ?? true} onInsert={onInsert} />
    </div>
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
    <div className="flex shrink-0 items-center gap-1">
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

function ColorField({
  title,
  value,
  onChange,
  highlight,
}: {
  title: string;
  value: string;
  onChange: (color: string) => void;
  highlight?: boolean;
}): ReactNode {
  // Commit diferido: arrastrar la paleta no lanza un comando por paso.
  const { color, change } = useDeferredColor(value, highlight ? '#ffffff' : '#111827', onChange);

  return (
    <label
      title={title}
      className="flex h-7 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-background text-[11px] font-bold hover:bg-muted"
    >
      <span
        className={highlight ? 'rounded-sm px-0.5' : ''}
        style={highlight ? { backgroundColor: color } : { color }}
      >
        A
      </span>
      <input
        type="color"
        className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        value={color}
        aria-label={title}
        onChange={(event) => change(event.target.value)}
      />
    </label>
  );
}
