import type { Padding, StylePatch } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { toPt } from '@/lib/style';

/**
 * Padding del item (`Style/PaddingTop…`), en puntos como la barra de RB. Se
 * edita por lado con el `NumberInput` estándar (teclear, flechas ↑/↓ y
 * arrastre); el lienzo y BC ya aplican la precedencia run > párrafo > item.
 */

const PADDING_SIDES = [
  { key: 'top', label: 'Superior', axis: 'y' },
  { key: 'left', label: 'Izquierdo', axis: 'x' },
  { key: 'bottom', label: 'Inferior', axis: 'y' },
  { key: 'right', label: 'Derecho', axis: 'x' },
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
      <Label className="text-[11px] text-muted-foreground">Relleno (pt)</Label>
      <div className="grid grid-cols-2 gap-2">
        {PADDING_SIDES.map((side) => (
          <PaddingField
            key={side.key}
            label={side.label}
            axis={side.axis}
            value={padding?.[side.key] ? Math.round(toPt(padding[side.key]!) * 100) / 100 : 0}
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
  axis,
  value,
  onCommit,
}: {
  label: string;
  axis: 'x' | 'y';
  value: number;
  onCommit: (value: number) => void;
}): ReactNode {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <NumberInput
        className="h-7 flex-1 text-xs"
        value={value}
        label={`Padding ${label.toLowerCase()}`}
        axis={axis}
        min={0}
        suffix="pt"
        onCommit={onCommit}
      />
    </div>
  );
}
