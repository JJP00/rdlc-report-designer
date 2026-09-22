import type { ImageDto, StylePatch } from '@rdlc-designer/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ExpressionEditor } from './ExpressionEditor';

export interface ImageOptionsPatch {
  source?: 'External' | 'Embedded' | 'Database' | null;
  value?: string | null;
  mimeType?: string | null;
  sizing?: string | null;
}

interface ImagePanelProps {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
  /** Padding (y otros estilos) del item. */
  onSetStyle: (patch: StylePatch) => void;
}

const SOURCES = [
  { value: 'Database', label: 'Database (campo del dataset)' },
  { value: 'External', label: 'External (URL)' },
  { value: 'Embedded', label: 'Embedded (incrustada)' },
] as const;

/** MIME del diálogo de Report Builder (+ valor actual si es otro). */
const MIME_TYPES = ['image/bmp', 'image/jpeg', 'image/gif', 'image/png', 'image/x-png'];

const SIZINGS = [
  { value: 'AutoSize', label: 'Tamaño original', help: 'El item se ajusta al tamaño de la imagen' },
  { value: 'Fit', label: 'Ajustar al tamaño', help: 'La imagen se escala para llenar el item' },
  {
    value: 'FitProportional',
    label: 'Ajustar proporcional',
    help: 'Escala manteniendo la relación de aspecto',
  },
  { value: 'Clip', label: 'Recortar', help: 'La imagen se recorta al tamaño del item' },
] as const;

const PADDING_SIDES = [
  { key: 'left', label: 'Izquierdo' },
  { key: 'right', label: 'Derecho' },
  { key: 'top', label: 'Superior' },
  { key: 'bottom', label: 'Inferior' },
] as const;

/**
 * Propiedades de una imagen, como los diálogos de Report Builder: origen y
 * campo/expresión, MIME (desplegable estándar), tamaño de visualización
 * (radios) y padding. El ToolTip no se ofrece (no se usa en BC).
 */
export function ImagePanel({ item, onSetImageOptions, onSetStyle }: ImagePanelProps): ReactNode {
  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Imagen</span>
        <Badge variant="outline">{item.source ?? 'sin origen'}</Badge>
      </div>

      {/* ------------------------------ origen ------------------------------ */}
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Origen de la imagen</Label>
        <select
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={item.source ?? 'Database'}
          aria-label="Origen de la imagen"
          onChange={(event) =>
            onSetImageOptions({ source: event.target.value as ImageOptionsPatch['source'] })
          }
        >
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <ValueSection item={item} onSetImageOptions={onSetImageOptions} />

      <MimeSection item={item} onSetImageOptions={onSetImageOptions} />

      {/* ----------------------- tamaño de visualización -------------------- */}
      <div className="grid gap-1.5">
        <Label className="text-[11px] text-muted-foreground">Tamaño de visualización</Label>
        {SIZINGS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="radio"
              className="mt-0.5"
              name={`sizing-${item.id}`}
              checked={(item.sizing ?? 'FitProportional') === option.value}
              onChange={() => onSetImageOptions({ sizing: option.value })}
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-[11px] text-muted-foreground">{option.help}</span>
            </span>
          </label>
        ))}
      </div>

      {/* ------------------------------ padding ----------------------------- */}
      <div className="flex flex-col gap-2">
        <Label className="text-[11px] text-muted-foreground">Padding (pt)</Label>
        <div className="grid grid-cols-2 gap-2">
          {PADDING_SIDES.map((side) => (
            <PaddingField
              key={side.key}
              label={side.label}
              value={paddingValue(item, side.key)}
              onCommit={(valuePt) =>
                onSetStyle({ padding: { [side.key]: { value: valuePt, unit: 'pt' } } })
              }
            />
          ))}
        </div>
      </div>

      <Separator />
      <p className="text-[11px] text-muted-foreground">
        En el lienzo se dibuja un placeholder: el contenido real (campo de BC o URL) solo se
        resuelve al renderizar el informe.
      </p>
    </div>
  );
}

function FxToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (active: boolean) => void;
}): ReactNode {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-xs"
      title={active ? 'Es una expresión (=)' : 'Convertir en expresión (=)'}
      onClick={() => onToggle(!active)}
    >
      <span className="text-[11px] italic leading-none">fx</span>
    </Button>
  );
}

function ensureExpression(text: string): string {
  const trimmed = text.trimStart();
  return trimmed.startsWith('=') ? text : text.length === 0 ? '=' : `=${text}`;
}

function ValueSection({
  item,
  onSetImageOptions,
}: {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}): ReactNode {
  // Borrador mientras se escribe: un cambio externo no pisa el texto.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? item.value ?? '';
  const isExpression = value.trimStart().startsWith('=');

  const commit = (): void => {
    if (draft !== null && draft !== (item.value ?? '')) onSetImageOptions({ value: draft });
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">
          {item.source === 'External' ? 'URL' : 'Campo / expresión'}
        </Label>
        <FxToggle
          active={isExpression}
          onToggle={(next) => {
            const updated = next ? ensureExpression(value) : stripExpression(value);
            setDraft(null);
            onSetImageOptions({ value: updated });
          }}
        />
      </div>
      {isExpression ? (
        <ExpressionEditor
          value={value}
          mode="expression"
          ariaLabel="Expresión del valor de la imagen"
          onCommit={(next) => {
            if (next !== (item.value ?? '')) onSetImageOptions({ value: next });
          }}
        />
      ) : (
        <Input
          className="h-7 font-mono text-xs"
          placeholder={item.source === 'External' ? 'https://…' : '=Fields!Picture.Value'}
          value={value}
          aria-label="Valor de la imagen"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      )}
    </div>
  );
}

function MimeSection({
  item,
  onSetImageOptions,
}: {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const mimeType = draft ?? item.mimeType ?? 'image/png';
  const isExpression = mimeType.trimStart().startsWith('=');
  const options = MIME_TYPES.includes(mimeType) ? MIME_TYPES : [...MIME_TYPES, mimeType];

  const commit = (): void => {
    if (draft !== null && draft !== (item.mimeType ?? '')) onSetImageOptions({ mimeType: draft });
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Tipo MIME</Label>
        <FxToggle
          active={isExpression}
          onToggle={(next) => {
            const updated = next ? ensureExpression(mimeType) : stripExpression(mimeType);
            setDraft(null);
            onSetImageOptions({ mimeType: updated });
          }}
        />
      </div>
      {isExpression ? (
        <Input
          className="h-7 font-mono text-xs"
          value={mimeType}
          aria-label="Tipo MIME (expresión)"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      ) : (
        <select
          className="h-7 rounded-md border bg-background px-1 font-mono text-xs"
          value={mimeType}
          aria-label="Tipo MIME"
          onChange={(event) => onSetImageOptions({ mimeType: event.target.value })}
        >
          {options.map((mime) => (
            <option key={mime} value={mime}>
              {mime}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function stripExpression(text: string): string {
  return text.trimStart().startsWith('=') ? text.trimStart().slice(1).trim() : text;
}

function paddingValue(item: ImageDto, side: string): number {
  const length = (
    item.style?.padding as Record<string, { value: number; unit: string }> | undefined
  )?.[side];
  if (!length) return 0;
  return length.unit === 'pt' ? length.value : Math.round(length.value * 28.35 * 100) / 100;
}

function PaddingField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}): ReactNode {
  // Borrador mientras se teclea; el resto del tiempo manda la proyección.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);

  const commit = (): void => {
    const parsed = Number.parseFloat(text.replace(',', '.'));
    if (draft !== null && Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs tabular-nums"
        value={text}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}
