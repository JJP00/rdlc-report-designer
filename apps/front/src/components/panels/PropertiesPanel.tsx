import type { ItemDto, Length, StylePatch } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Separator } from '@/components/ui/separator';
import { toCm, cm } from '@/lib/projection';
import { useState, type ReactNode } from 'react';
import { BackgroundField } from './BackgroundField';
import { BorderField } from './BorderField';
import { PaddingSection } from './PaddingSection';
import { VisibilityField } from './VisibilityField';

/** Kinds cuyo borde se pinta en el lienzo (donde la UI no engaña). */
const BORDER_KINDS = new Set(['textbox', 'rectangle', 'image']);

/** Kinds que admiten `PageBreak` en el XSD (y que el editor soporta). */
const PAGE_BREAK_KINDS = new Set(['rectangle', 'tablix']);

/** Opciones del item que no son estilo (`CanGrow`/`KeepTogether`, cabeceras y `NoRowsMessage` del Tablix). */
export interface ItemOptionsPatch {
  canGrow?: boolean;
  keepTogether?: boolean;
  repeatColumnHeaders?: boolean;
  repeatRowHeaders?: boolean;
  noRowsMessage?: string;
}

interface PropertiesPanelProps {
  item: ItemDto;
  /** El item es contenido directo de una celda: la celda fija posición y tamaño. */
  cellContent?: boolean;
  onSetLocation: (top: Length, left: Length) => void;
  onSetSize: (width: Length, height: Length) => void;
  onSetStyle: (patch: StylePatch) => void;
  /** Renombra el elemento (el dominio valida el nombre único). */
  onSetName: (name: string) => void;
  /** `null` = quitar la visibilidad declarada. */
  onSetVisibility: (hidden: boolean | string | null) => void;
  /** `CanGrow`/`KeepTogether` (solo Textbox). */
  onSetItemOptions: (options: ItemOptionsPatch) => void;
  /** Salto de página del item (Rectangle/Tablix). */
  onSetPageBreak: (breakLocation: 'None' | 'Start' | 'End' | 'Between') => void;
}

/** Panel de propiedades: geometría, nombre, fondo y visibilidad. */
export function PropertiesPanel({
  item,
  cellContent,
  onSetLocation,
  onSetSize,
  onSetStyle,
  onSetName,
  onSetVisibility,
  onSetItemOptions,
  onSetPageBreak,
}: PropertiesPanelProps): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('panels.properties.title')}</span>
        <Badge variant="outline">{item.kind}</Badge>
      </div>

      <NameField key={`${item.id}-name`} name={item.id} onCommit={onSetName} />

      <Separator />

      <div className="text-xs font-medium text-muted-foreground">
        {t('panels.properties.positionAndSize')}
      </div>
      {cellContent ? (
        <p className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
          {/* Barrido de microcopy (guía 0006): trim — sobraba el paréntesis «igual que en Report Builder». */}
          {t('panels.properties.cellNote')}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          key={`${item.id}-left`}
          label={t('panels.properties.x')}
          value={toCm(item.left)}
          disabled={cellContent}
          axis="x"
          invert={false}
          onCommit={(value) => onSetLocation(item.top, cm(value))}
        />
        <LengthField
          key={`${item.id}-top`}
          label={t('panels.properties.y')}
          value={toCm(item.top)}
          disabled={cellContent}
          axis="y"
          invert={false}
          onCommit={(value) => onSetLocation(cm(value), item.left)}
        />
        <LengthField
          key={`${item.id}-width`}
          label={t('panels.properties.width')}
          value={toCm(item.width)}
          disabled={cellContent}
          axis="x"
          onCommit={(value) => onSetSize(cm(value), item.height)}
        />
        <LengthField
          key={`${item.id}-height`}
          label={t('panels.properties.height')}
          value={toCm(item.height)}
          disabled={cellContent}
          axis="y"
          onCommit={(value) => onSetSize(item.width, cm(value))}
        />
      </div>

      {item.zIndex !== undefined ? (
        <div className="text-xs text-muted-foreground">
          {t('panels.properties.zIndex', { index: item.zIndex })}
        </div>
      ) : null}

      {PAGE_BREAK_KINDS.has(item.kind) ? (
        <>
          <Separator />
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('panels.properties.pageBreak')}
            </Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
              aria-label={t('panels.properties.pageBreak')}
              value={item.pageBreak ?? 'None'}
              onChange={(event) =>
                onSetPageBreak(event.target.value as 'Start' | 'End' | 'Between' | 'None')
              }
            >
              <option value="None">{t('panels.properties.pageBreakNone')}</option>
              <option value="Start">{t('panels.properties.pageBreakStart')}</option>
              <option value="End">{t('panels.properties.pageBreakEnd')}</option>
              <option value="Between">{t('panels.properties.pageBreakBetween')}</option>
            </select>
          </div>
        </>
      ) : null}

      {item.kind === 'textbox' || item.kind === 'rectangle' || item.kind === 'tablix' ? (
        <>
          <Separator />
          <div className="text-xs font-medium text-muted-foreground">
            {t('panels.properties.options')}
          </div>
          {item.kind === 'textbox' ? (
            <OptionField
              id="can-grow"
              label={t('panels.properties.canGrow')}
              checked={item.canGrow ?? false}
              onChange={(canGrow) => onSetItemOptions({ canGrow })}
            />
          ) : null}
          <OptionField
            id="keep-together"
            label={t('panels.properties.keepTogether')}
            checked={item.keepTogether ?? false}
            onChange={(keepTogether) => onSetItemOptions({ keepTogether })}
          />
          {item.kind === 'tablix' ? (
            <>
              <OptionField
                id="repeat-column-headers"
                label={t('panels.properties.repeatColumnHeaders')}
                checked={item.repeatColumnHeaders ?? false}
                onChange={(repeatColumnHeaders) => onSetItemOptions({ repeatColumnHeaders })}
              />
              <OptionField
                id="repeat-row-headers"
                label={t('panels.properties.repeatRowHeaders')}
                checked={item.repeatRowHeaders ?? false}
                onChange={(repeatRowHeaders) => onSetItemOptions({ repeatRowHeaders })}
              />
              <TextOptionField
                key={`${item.id}-no-rows-message`}
                id="no-rows-message"
                label={t('panels.properties.noRowsMessage')}
                value={item.noRowsMessage ?? ''}
                onCommit={(noRowsMessage) => onSetItemOptions({ noRowsMessage })}
              />
            </>
          ) : null}
        </>
      ) : null}

      <Separator />
      <div className="text-xs font-medium text-muted-foreground">
        {t('panels.properties.appearance')}
      </div>
      {/* `key` por item: al cambiar de selección el borrador diferido de color
          se entrega al item anterior (flush del desmontaje) en vez de pintar
          el nuevo (BUG-38). */}
      <BackgroundField key={`${item.id}-background`} item={item} onSetStyle={onSetStyle} />
      <PaddingSection padding={item.style?.padding} onSetStyle={onSetStyle} />
      {BORDER_KINDS.has(item.kind) ? (
        <BorderField
          key={`${item.id}-border`}
          border={item.style?.border}
          onSetStyle={onSetStyle}
        />
      ) : null}
      <VisibilityField
        key={`${item.id}-visibility`}
        hidden={item.hidden ?? undefined}
        onChange={onSetVisibility}
      />
    </div>
  );
}

/** Checkbox de una opción booleana del item (`false` = etiqueta ausente). */
function OptionField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): ReactNode {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox id={id} checked={checked} onCheckedChange={(state) => onChange(state === true)} />
      {label}
    </label>
  );
}

/** Campo de texto de una opción del item: commit al confirmar (Enter o blur). */
function TextOptionField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
}): ReactNode {
  // Borrador mientras se teclea; el resto del tiempo manda la proyección.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;

  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        className="h-7 text-xs"
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    </div>
  );
}

/** Nombre del elemento: editable con commit al confirmar (Enter o blur). */
function NameField({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (name: string) => void;
}): ReactNode {
  const t = useT();
  // Borrador mientras se teclea; el resto del tiempo manda la proyección.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? name;

  const commit = (): void => {
    const next = text.trim();
    if (draft !== null && next !== '' && next !== name) onCommit(next);
    setDraft(null);
  };

  return (
    <Input
      className="h-7 font-mono text-xs"
      value={text}
      aria-label={t('panels.properties.nameLabel')}
      title={t('panels.properties.nameTitle')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
    />
  );
}

/**
 * Campo de geometría con el `NumberInput` estándar (teclear, flechas y
 * arrastre). Mientras se escribe manda el borrador: el resto del tiempo pinta
 * la proyección (arrastrar el item actualiza estos campos sin pisar lo tecleado).
 */
function LengthField({
  label,
  value,
  disabled,
  axis,
  invert,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  axis: 'x' | 'y';
  invert?: boolean;
  onCommit: (valueCm: number) => void;
}): ReactNode {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <NumberInput
        value={value}
        label={label}
        disabled={disabled}
        axis={axis}
        invert={invert}
        min={0}
        className="h-7 flex-1 text-xs"
        onCommit={onCommit}
      />
    </div>
  );
}
