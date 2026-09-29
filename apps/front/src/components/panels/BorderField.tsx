import type { BorderSide, BorderSides, BorderStyle, StylePatch } from '@rdlc-designer/contracts';
import { useState, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { toPt } from '@/lib/style';

/**
 * Bordes por lado (`Style/Border` + overrides `TopBorder`…) que la proyección
 * ya resuelve: aquí se edita el valor **efectivo** de cada lado. El color usa
 * commit diferido (arrastrar la paleta no lanza un comando por paso) y el
 * grosor confirma al salir del campo.
 */

const SIDES = [
  { key: 'top', label: 'Superior' },
  { key: 'left', label: 'Izquierdo' },
  { key: 'bottom', label: 'Inferior' },
  { key: 'right', label: 'Derecho' },
] as const;

const BORDER_STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'None', label: 'Sin borde' },
  { value: 'Solid', label: 'Sólido' },
  { value: 'Dashed', label: 'Discontinuo' },
  { value: 'Dotted', label: 'Punteado' },
  { value: 'Double', label: 'Doble' },
];

interface BorderFieldProps {
  border: BorderSides | undefined;
  onSetStyle: (patch: StylePatch) => void;
}

export function BorderField({ border, onSetStyle }: BorderFieldProps): ReactNode {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] text-muted-foreground">Bordes</Label>
      {SIDES.map((side) => (
        <BorderSideRow
          key={side.key}
          side={side.key}
          label={side.label}
          value={border?.[side.key]}
          onSetStyle={onSetStyle}
        />
      ))}
    </div>
  );
}

function BorderSideRow({
  side,
  label,
  value,
  onSetStyle,
}: {
  side: keyof BorderSides;
  label: string;
  value: BorderSide | undefined;
  onSetStyle: (patch: StylePatch) => void;
}): ReactNode {
  const current: BorderSide = value ?? { style: 'None' };
  const isNone = current.style === 'None';
  const { color, change } = useDeferredColor(current.color, '#000000', (next) =>
    onSetStyle({ border: { [side]: { ...current, color: next } } }),
  );
  const [widthDraft, setWidthDraft] = useState<string | null>(null);

  const widthPt = current.width ? formatPt(toPt(current.width)) : '1';
  const commitWidth = (): void => {
    if (widthDraft === null) return;
    const parsed = Number.parseFloat(widthDraft.replace(',', '.'));
    setWidthDraft(null);
    if (Number.isFinite(parsed) && parsed > 0) {
      onSetStyle({ border: { [side]: { ...current, width: { value: parsed, unit: 'pt' } } } });
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <select
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Borde ${label.toLowerCase()}: estilo`}
        value={current.style}
        onChange={(event) => {
          const style = event.target.value as BorderStyle;
          onSetStyle({ border: { [side]: { ...current, style } } });
        }}
      >
        {BORDER_STYLES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label
        title={`Color del borde ${label.toLowerCase()}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background ${isNone ? 'opacity-40' : 'cursor-pointer'}`}
      >
        <span className="h-4 w-4 rounded-sm border" style={{ backgroundColor: color }} />
        <input
          type="color"
          className="sr-only"
          aria-label={`Borde ${label.toLowerCase()}: color`}
          value={color}
          disabled={isNone}
          onChange={(event) => change(event.target.value)}
        />
      </label>
      <input
        type="number"
        className="h-7 w-12 shrink-0 rounded-md border border-input bg-background px-1 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
        aria-label={`Borde ${label.toLowerCase()}: grosor (pt)`}
        title="Grosor en puntos"
        min={0.25}
        step={0.25}
        disabled={isNone}
        value={widthDraft ?? widthPt}
        onChange={(event) => setWidthDraft(event.target.value)}
        onBlur={commitWidth}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitWidth();
          if (event.key === 'Escape') setWidthDraft(null);
        }}
      />
    </div>
  );
}

function formatPt(value: number): string {
  return Number(value.toFixed(2)).toString();
}
