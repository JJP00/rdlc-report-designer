import type { Padding, StylePatch } from '@rdlc-designer/contracts';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toPt } from '@/lib/style';

/**
 * Padding del item (`Style/PaddingTop…`), en puntos como la barra de RB. Se
 * edita por lado y se confirma al salir del campo (blur/Enter); el lienzo y BC
 * ya aplican la precedencia run > párrafo > item.
 */

const PADDING_SIDES = [
  { key: 'top', label: 'Superior' },
  { key: 'left', label: 'Izquierdo' },
  { key: 'bottom', label: 'Inferior' },
  { key: 'right', label: 'Derecho' },
] as const;

export function PaddingSection({
  padding,
  onSetStyle,
}: {
  padding?: Padding;
  onSetStyle: (patch: StylePatch) => void;
}): ReactNode {
  return (
    <div className="grid gap-2">
      <Label className="text-[11px] text-muted-foreground">Padding (pt)</Label>
      <div className="grid grid-cols-2 gap-2">
        {PADDING_SIDES.map((side) => (
          <PaddingField
            key={side.key}
            label={side.label}
            value={padding?.[side.key] ? formatPt(toPt(padding[side.key]!)) : '0'}
            onCommit={(valuePt) =>
              onSetStyle({ padding: { [side.key]: { value: valuePt, unit: 'pt' } } })
            }
          />
        ))}
      </div>
    </div>
  );
}

function PaddingField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: number) => void;
}): ReactNode {
  // Borrador mientras se teclea; el resto del tiempo manda la proyección.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;

  const commit = (): void => {
    const parsed = Number.parseFloat(text.replace(',', '.'));
    if (draft !== null && Number.isFinite(parsed) && parsed !== Number.parseFloat(value)) {
      onCommit(parsed);
    }
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs tabular-nums"
        value={text}
        aria-label={`Padding ${label.toLowerCase()}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

function formatPt(value: number): string {
  return Number(value.toFixed(2)).toString();
}
