import type { ItemDto, Length } from '@rdlc-designer/contracts';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toCm, cm } from '@/lib/projection';
import { useEffect, useState, type ReactNode } from 'react';

interface PropertiesPanelProps {
  item: ItemDto;
  /** El item es contenido directo de una celda: la celda fija posición y tamaño. */
  cellContent?: boolean;
  onSetLocation: (top: Length, left: Length) => void;
  onSetSize: (width: Length, height: Length) => void;
}

/** Panel de propiedades: geometría (commits con Enter o al perder foco). */
export function PropertiesPanel({
  item,
  cellContent,
  onSetLocation,
  onSetSize,
}: PropertiesPanelProps): ReactNode {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Propiedades</span>
        <Badge variant="outline">{item.kind}</Badge>
      </div>

      <div className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs">{item.id}</div>

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
    </div>
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
