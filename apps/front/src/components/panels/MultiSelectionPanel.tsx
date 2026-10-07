import type {
  BatchableCommand,
  BorderSides,
  ItemDto,
  StyleDto,
  StylePatch,
} from '@rdlc-designer/contracts';
import { DEFAULT_FONT_FAMILY } from '@rdlc-designer/contracts';
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
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BorderField } from '@/components/panels/BorderField';
import { PaddingSection } from '@/components/panels/PaddingSection';
import { useAvailableFonts } from '@/hooks/useAvailableFonts';
import { alignBoxes, alignCommands, distributeCommands, topLevelIds, type AlignBox } from '@/lib/align';
import { effectiveTextStyle, sameStyleValue, toPt } from '@/lib/style';

export interface MultiSelectionPanelProps {
  /** Items seleccionados (en orden de selección). */
  items: ItemDto[];
  /** De los seleccionados, los que pueden moverse (no contenido de celda). */
  movableIds: string[];
  /** Envía los comandos como un solo paso de undo (`batch`). */
  onBatchEdit: (commands: BatchableCommand[]) => void;
  /** true si el id es contenido directo de una celda (para bordes/padding). */
  isCellContentId?: (id: string) => boolean;
  /** Qué se está editando (solo cambia la cabecera): elementos o celdas. */
  label?: 'elementos' | 'celdas';
}

/**
 * Valor común entre los seleccionados, o `undefined` (mezcla). La igualdad es
 * **estructural**: los objetos de la proyección (bordes, padding…) no comparten
 * referencia aunque el valor sea idéntico.
 */
function common<T>(
  items: ItemDto[],
  read: (item: ItemDto) => T,
  equals: (a: T, b: T) => boolean = sameStyleValue,
): T | undefined {
  if (items.length === 0) return undefined;
  const first = read(items[0]!);
  return items.every((item) => equals(read(item), first)) ? first : undefined;
}

/**
 * Estilo de texto que se está **pintando**: para un textbox, el efectivo
 * (run > párrafo > item); para el resto, el declarado del item. Comparar solo
 * lo declarado marcaba «—» entre dos items que se ven iguales pero heredan el
 * estilo en niveles distintos.
 */
function textStyleOf(item: ItemDto): StyleDto | undefined {
  return item.kind === 'textbox' ? effectiveTextStyle(item) : item.style;
}

/**
 * Panel de edición en lote (U3): propiedades comunes de estilo (texto, bordes,
 * padding, visibilidad), alinear/distribuir y borrado. Todo se envía en **un
 * solo `batch`** (un paso de undo) y el lienzo refresca con la proyección.
 *
 * Convención de estados mixtos: un control muestra «—» cuando los elementos no
 * comparten el valor; elegir uno lo aplica a todos.
 */
export function MultiSelectionPanel({
  items,
  movableIds,
  onBatchEdit,
  isCellContentId,
  label = 'elementos',
}: MultiSelectionPanelProps): ReactNode {
  const movable = alignBoxes(items, movableIds);
  const count = items.length;
  // Un hijo seleccionado junto a su contenedor viaja con él: borrar ambos por
  // separado rechazaba el `batch` entero (el hijo ya no existe tras quitar el
  // padre) y no se borraba nada (BUG-35).
  const deletableIds = useMemo(
    () => topLevelIds(items, items.map((item) => item.id)),
    [items],
  );

  /** Los bordes/padding no aplican al contenido de celdas (lo fija la celda). */
  const styledItems = useMemo(() => {
    if (!isCellContentId) return items;
    const styled = new Set(items.map((item) => item.id).filter((id) => !isCellContentId(id)));
    return items.filter((item) => styled.has(item.id));
  }, [items, isCellContentId]);

  const styleBatch = (patch: StylePatch): void => {
    if (styledItems.length === 0) return;
    onBatchEdit(styledItems.map((item) => ({ cmd: 'setStyle', id: item.id, style: patch })));
  };

  return (
    <div className="flex flex-col gap-3 border-b p-3" data-testid="multi-selection-panel">
      <header className="text-sm font-medium">
        Selección múltiple
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({count} {label})
        </span>
        <p className="mt-0.5 text-xs font-normal text-muted-foreground">
          Los cambios se aplican a todos en un solo paso de undo. «—» = valores distintos.
        </p>
      </header>

      <TextSection items={styledItems} onStyle={styleBatch} />
      <BoxSection items={styledItems} onStyle={styleBatch} />
      <VisibilitySection items={items} onBatchEdit={onBatchEdit} />
      <AlignSection movable={movable} onBatchEdit={onBatchEdit} />

      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => onBatchEdit(deletableIds.map((id) => ({ cmd: 'deleteItem', id })))}
      >
        <Trash2 data-icon="inline-start" />
        {label === 'celdas'
          ? `Eliminar el contenido de ${count} celdas`
          : `Eliminar los ${count} elementos`}
      </Button>
    </div>
  );
}

/* ------------------------------- secciones ------------------------------- */

/** Tamaño y colores por defecto del editor cuando ningún nivel declara valor. */
const DEFAULT_FONT_SIZE_PT = 10;
const DEFAULT_TEXT_COLOR = '#111827';
const DEFAULT_BACKGROUND = '#ffffff';

/**
 * Fuente, tamaño y formato común del texto, sobre el **valor efectivo con su
 * defecto**: dos textboxes sin `<FontFamily>` declarado se ven igual (Arial) y
 * deben compararse igual, no como «—».
 */
function TextSection({
  items,
  onStyle,
}: {
  items: ItemDto[];
  onStyle: (patch: StylePatch) => void;
}): ReactNode {
  const fonts = useAvailableFonts();
  const disabled = items.length === 0;
  const familyOptions = useMemo(() => {
    const all = new Set([DEFAULT_FONT_FAMILY, ...fonts]);
    for (const item of items) {
      const family = textStyleOf(item)?.fontFamily;
      if (family) all.add(family);
    }
    return [...all].sort((a, b) => a.localeCompare(b, 'es'));
  }, [fonts, items]);

  const family = common(items, (item) => textStyleOf(item)?.fontFamily ?? DEFAULT_FONT_FAMILY);
  /** Tamaño común en pt (se compara en pt: los items pueden declararlo en mm, cm…). */
  const sizePt = useMemo(() => {
    if (items.length === 0) return null;
    const sizes = items.map(
      (item) => textStyleOf(item)?.fontSize ?? { value: DEFAULT_FONT_SIZE_PT, unit: 'pt' as const },
    );
    const pt = Math.round(toPt(sizes[0]!) * 100) / 100;
    return sizes.every((size) => Math.abs(toPt(size) - pt) < 0.01) ? pt : null;
  }, [items]);

  const bold = !disabled && items.every((item) => textStyleOf(item)?.fontWeight === 'Bold');
  const italic = !disabled && items.every((item) => textStyleOf(item)?.fontStyle === 'Italic');
  const underlined =
    !disabled && items.every((item) => textStyleOf(item)?.textDecoration === 'Underline');
  const color = common(items, (item) => textStyleOf(item)?.color ?? DEFAULT_TEXT_COLOR);
  const background = common(
    items,
    (item) => textStyleOf(item)?.backgroundColor ?? DEFAULT_BACKGROUND,
  );

  return (
    <section className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Texto</span>
      <div className="flex items-center gap-1.5">
        <select
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={family ?? ''}
          aria-label="Fuente de la selección"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value) onStyle({ fontFamily: event.target.value });
          }}
        >
          <option value="">—</option>
          {familyOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <NumberInput
          value={sizePt}
          placeholder="—"
          min={1}
          max={200}
          suffix="pt"
          label="Tamaño de la selección (pt)"
          step={1}
          perPx={0.1}
          decimals={0}
          disabled={disabled}
          onCommit={(value) => onStyle({ fontSize: { value: Math.round(value), unit: 'pt' } })}
          className="h-8 w-20 text-sm"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant={bold ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label="Negrita en la selección"
          aria-pressed={bold}
          disabled={disabled}
          onClick={() => onStyle({ fontWeight: bold ? 'Normal' : 'Bold' })}
        >
          <Bold />
        </Button>
        <Button
          variant={italic ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label="Cursiva en la selección"
          aria-pressed={italic}
          disabled={disabled}
          onClick={() => onStyle({ fontStyle: italic ? 'Normal' : 'Italic' })}
        >
          <Italic />
        </Button>
        <Button
          variant={underlined ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label="Subrayado en la selección"
          aria-pressed={underlined}
          disabled={disabled}
          onClick={() => onStyle({ textDecoration: underlined ? 'None' : 'Underline' })}
        >
          <Underline />
        </Button>
        <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
          Color{color === undefined ? ' —' : ''}
          <input
            type="color"
            aria-label="Color de texto de la selección"
            value={/^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color! : DEFAULT_TEXT_COLOR}
            disabled={disabled}
            onChange={(event) => onStyle({ color: event.target.value })}
            className="h-7 w-9 cursor-pointer rounded border"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Fondo{background === undefined ? ' —' : ''}
          <input
            type="color"
            aria-label="Color de fondo de la selección"
            value={/^#[0-9a-fA-F]{6}$/.test(background ?? '') ? background! : DEFAULT_BACKGROUND}
            disabled={disabled}
            onChange={(event) => onStyle({ backgroundColor: event.target.value })}
            className="h-7 w-9 cursor-pointer rounded border"
          />
        </label>
      </div>
    </section>
  );
}

/** Bordes (lados mezclados editables) y padding con los controles del panel de un item. */
function BoxSection({
  items,
  onStyle,
}: {
  items: ItemDto[];
  onStyle: (patch: StylePatch) => void;
}): ReactNode {
  /** Lados que difieren entre los seleccionados: se marcan «—» y se dejan editar. */
  const mixedSides = useMemo(() => {
    const sides: (keyof BorderSides)[] = ['top', 'left', 'bottom', 'right'];
    const mixed = new Set<keyof BorderSides>();
    const sideOf = (item: ItemDto, side: keyof BorderSides): unknown =>
      item.style?.border?.[side] ?? { style: 'None' };
    for (const side of sides) {
      const first = sideOf(items[0]!, side);
      if (items.some((item) => !sameStyleValue(sideOf(item, side), first))) mixed.add(side);
    }
    return mixed;
  }, [items]);

  return (
    <section className="flex flex-col gap-2">
      <BorderField border={items[0]?.style?.border} mixedSides={mixedSides} onSetStyle={onStyle} />
      <PaddingSection padding={common(items, (item) => item.style?.padding)} onSetStyle={onStyle} />
    </section>
  );
}

/**
 * Visibilidad efectiva en lote: `Hidden` sin declarar = **Visible** (defecto
 * RDL), así que dos items sin declaración comparan igual (Visible), no «—».
 * Las expresiones no se pueden editar en lote (se muestran como mezcla).
 */
function VisibilitySection({
  items,
  onBatchEdit,
}: {
  items: ItemDto[];
  onBatchEdit: (commands: BatchableCommand[]) => void;
}): ReactNode {
  const effectiveHidden = (item: ItemDto): boolean | string =>
    item.hidden === true
      ? true
      : item.hidden === false || item.hidden === undefined
        ? false
        : item.hidden;
  const hidden = common(items, effectiveHidden);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">Visibilidad</span>
      <select
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Visibilidad de la selección"
        value={hidden === true ? 'hidden' : hidden === false ? 'visible' : ''}
        onChange={(event) => {
          if (!event.target.value) return;
          // «Visible» quita la declaración (vuelve a la predeterminada), como el
          // panel de un solo item.
          const next = event.target.value === 'hidden' ? true : null;
          onBatchEdit(items.map((item) => ({ cmd: 'setVisibility', id: item.id, hidden: next })));
        }}
      >
        <option value="">—</option>
        <option value="visible">Visible</option>
        <option value="hidden">Oculta</option>
      </select>
    </div>
  );
}

/** Alinear/distribuir por la caja envolvente de los items movibles. */
function AlignSection({
  movable,
  onBatchEdit,
}: {
  movable: AlignBox[];
  onBatchEdit: (commands: BatchableCommand[]) => void;
}): ReactNode {
  return (
    <section className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
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
      <span className="text-xs font-medium text-muted-foreground">
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
