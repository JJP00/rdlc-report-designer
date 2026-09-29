import type { ItemDto, Length, StylePatch } from '@rdlc-designer/contracts';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toCm, cm } from '@/lib/projection';
import { useState, type ReactNode } from 'react';
import { BackgroundField } from './BackgroundField';
import { BorderField } from './BorderField';
import { VisibilityField } from './VisibilityField';

/** Kinds cuyo borde se pinta en el lienzo (donde la UI no engaña). */
const BORDER_KINDS = new Set(['textbox', 'rectangle', 'image']);

/** Kinds que admiten `PageBreak` en el XSD (y que el editor soporta). */
const PAGE_BREAK_KINDS = new Set(['rectangle', 'tablix']);

/** Opciones del item que no son estilo (`CanGrow`/`KeepTogether`). */
export interface ItemOptionsPatch {
  canGrow?: boolean;
  keepTogether?: boolean;
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
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Propiedades</span>
        <Badge variant="outline">{item.kind}</Badge>
      </div>

      <NameField key={`${item.id}-name`} name={item.id} onCommit={onSetName} />

      <Separator />

      <div className="text-xs font-medium text-muted-foreground">Posición y tamaño (cm)</div>
      {cellContent ? (
        <p className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
          La celda fija la posición y el tamaño del contenido (igual que en Report Builder).
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          key={`${item.id}-left`}
          label="X (Left)"
          value={toCm(item.left)}
          disabled={cellContent}
          onCommit={(value) => onSetLocation(item.top, cm(value))}
        />
        <LengthField
          key={`${item.id}-top`}
          label="Y (Top)"
          value={toCm(item.top)}
          disabled={cellContent}
          onCommit={(value) => onSetLocation(cm(value), item.left)}
        />
        <LengthField
          key={`${item.id}-width`}
          label="Ancho"
          value={toCm(item.width)}
          disabled={cellContent}
          onCommit={(value) => onSetSize(cm(value), item.height)}
        />
        <LengthField
          key={`${item.id}-height`}
          label="Alto"
          value={toCm(item.height)}
          disabled={cellContent}
          onCommit={(value) => onSetSize(item.width, cm(value))}
        />
      </div>

      {item.zIndex !== undefined ? (
        <div className="text-xs text-muted-foreground">ZIndex: {item.zIndex}</div>
      ) : null}

      {PAGE_BREAK_KINDS.has(item.kind) ? (
        <>
          <Separator />
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Salto de página</Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Salto de página"
              value={item.pageBreak ?? 'None'}
              onChange={(event) =>
                onSetPageBreak(event.target.value as 'Start' | 'End' | 'Between' | 'None')
              }
            >
              <option value="None">Sin salto</option>
              <option value="Start">Al inicio</option>
              <option value="End">Al final</option>
              <option value="Between">Entre instancias</option>
            </select>
          </div>
        </>
      ) : null}

      {item.kind === 'textbox' ? (
        <>
          <Separator />
          <div className="text-xs font-medium text-muted-foreground">Opciones</div>
          <OptionField
            id="can-grow"
            label="Crecer con el texto (CanGrow)"
            checked={item.canGrow ?? false}
            onChange={(canGrow) => onSetItemOptions({ canGrow })}
          />
          <OptionField
            id="keep-together"
            label="Mantener junto (KeepTogether)"
            checked={item.keepTogether ?? false}
            onChange={(keepTogether) => onSetItemOptions({ keepTogether })}
          />
        </>
      ) : null}

      <Separator />
      <div className="text-xs font-medium text-muted-foreground">Apariencia</div>
      <BackgroundField item={item} onSetStyle={onSetStyle} />
      {BORDER_KINDS.has(item.kind) ? (
        <BorderField border={item.style?.border} onSetStyle={onSetStyle} />
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

/** Nombre del elemento: editable con commit al confirmar (Enter o blur). */
function NameField({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (name: string) => void;
}): ReactNode {
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
      aria-label="Nombre del elemento"
      title="Nombre del elemento (único). Las referencias existentes (ReportItems!…) no se reescriben."
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(null);
      }}
    />
  );
}

function LengthField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (valueCm: number) => void;
}): ReactNode {
  // Borrador mientras se teclea; el resto del tiempo manda la proyección
  // (arrastrar el item actualiza estos campos sin pisar lo que se escribe).
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? format(value);

  const commit = (): void => {
    const parsed = Number.parseFloat(text.replace(',', '.'));
    if (!disabled && draft !== null && Number.isFinite(parsed) && Math.abs(parsed - value) > 1e-9) {
      onCommit(parsed);
    }
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs tabular-nums"
        value={text}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

function format(value: number): string {
  return Number(value.toFixed(4)).toString();
}
