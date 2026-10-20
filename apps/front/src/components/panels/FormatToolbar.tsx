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
import { useT } from '@rdlc-designer/i18n/react';
import { ColorButton } from '@/components/panels/ColorButton';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAvailableFonts } from '@/hooks/useAvailableFonts';
import { ITEM_DRAG_TYPE } from '@/lib/dragTypes';
import { cn } from '@/lib/utils';
import { toPt } from '@/lib/style';

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
 * **botones de insertar** (click o arrastrar al lienzo). En **una sola línea**
 * si cabe; al estrecharse reparte los controles en varias filas (nunca hace
 * scroll horizontal). Aplica al `<Style>` de **todos** los items seleccionados (en lote)
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
  const t = useT();
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
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-chrome-subtle px-3 py-1.5">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <select
          className="h-7 max-w-[130px] shrink-0 rounded-md border border-input bg-background px-1 text-xs"
          value={style?.fontFamily ?? DEFAULT_FONT_FAMILY}
          aria-label={t('toolbar.format.fontFamily')}
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
          label={t('toolbar.format.fontSize')}
          title={t('toolbar.format.fontSizeTitle')}
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
          t('toolbar.format.bold'),
        )}
        {toggle(
          style?.fontStyle === 'Italic',
          { fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' },
          <Italic />,
          t('toolbar.format.italic'),
        )}
        {toggle(
          style?.textDecoration === 'Underline',
          { textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline' },
          <Underline />,
          t('toolbar.format.underline'),
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

        <ColorButton
          title={t('toolbar.format.textColor')}
          value={style?.color}
          fallback="#111827"
          onChange={(color) => onSetStyle({ color })}
        />
        <ColorButton
          title={t('toolbar.format.highlight')}
          value={style?.backgroundColor}
          fallback="#ffffff"
          highlight
          onChange={(backgroundColor) => onSetStyle({ backgroundColor })}
        />

        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />

        {toggle(
          style?.textAlign === 'Left',
          { textAlign: 'Left' },
          <AlignLeft />,
          t('toolbar.format.alignLeft'),
        )}
        {toggle(
          style?.textAlign === 'Center',
          { textAlign: 'Center' },
          <AlignCenter />,
          t('toolbar.format.alignCenter'),
        )}
        {toggle(
          style?.textAlign === 'Right',
          { textAlign: 'Right' },
          <AlignRight />,
          t('toolbar.format.alignRight'),
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />
        {toggle(
          style?.listStyle === 'Bulleted',
          { listStyle: 'Bulleted' },
          <List />,
          t('toolbar.format.bullets'),
        )}
        {toggle(
          style?.listStyle === 'Numbered',
          { listStyle: 'Numbered' },
          <ListOrdered />,
          t('toolbar.format.numbering'),
        )}
        {toggle(
          style?.listStyle === undefined || style?.listStyle === 'None',
          { listStyle: 'None' },
          <ListX />,
          t('toolbar.format.noList'),
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5 shrink-0" />
        {toggle(
          style?.verticalAlign === 'Top',
          { verticalAlign: 'Top' },
          <span className="text-[10px] leading-none">A↑</span>,
          t('toolbar.format.alignTop'),
        )}
        {toggle(
          style?.verticalAlign === 'Middle',
          { verticalAlign: 'Middle' },
          <span className="text-[10px] leading-none">A↕</span>,
          t('toolbar.format.alignMiddle'),
        )}
        {toggle(
          style?.verticalAlign === 'Bottom',
          { verticalAlign: 'Bottom' },
          <span className="text-[10px] leading-none">A↓</span>,
          t('toolbar.format.alignBottom'),
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
  const t = useT();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <InsertButton
        kind="textbox"
        label={t('toolbar.insert.textbox')}
        icon={<Type />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="rectangle"
        label={t('toolbar.insert.rectangle')}
        icon={<Square />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="line"
        label={t('toolbar.insert.line')}
        icon={<Minus />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="image"
        label={t('toolbar.insert.image')}
        icon={<Image />}
        disabled={disabled}
        onInsert={onInsert}
      />
      <InsertButton
        kind="tablix"
        label={t('toolbar.insert.tablix')}
        icon={<Table />}
        disabled={disabled}
        onInsert={onInsert}
      />
    </div>
  );
}

/** Botón de la toolbox: click inserta y **arrastrar** suelta el item en el lienzo. */ function InsertButton({
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
  const t = useT();

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
      <TooltipContent>{t('toolbar.insert.tooltip', { label })}</TooltipContent>
    </Tooltip>
  );
}
