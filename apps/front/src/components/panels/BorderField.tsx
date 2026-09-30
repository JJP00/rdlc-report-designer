import type { BorderSide, BorderSides, BorderStyle, StylePatch } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
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
  /**
   * Lados con valores distintos entre los items seleccionados (multiselección):
   * se muestran como «—» y **se pueden editar igualmente** (la edición fija el
   * valor para todos).
   */
  mixedSides?: ReadonlySet<keyof BorderSides>;
}

export function BorderField({ border, onSetStyle, mixedSides }: BorderFieldProps): ReactNode {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] text-muted-foreground">Bordes</Label>
      {SIDES.map((side) => (
        <BorderSideRow
          key={side.key}
          side={side.key}
          label={side.label}
          value={border?.[side.key]}
          mixed={mixedSides?.has(side.key) ?? false}
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
  mixed,
  onSetStyle,
}: {
  side: keyof BorderSides;
  label: string;
  value: BorderSide | undefined;
  mixed: boolean;
  onSetStyle: (patch: StylePatch) => void;
}): ReactNode {
  const current: BorderSide = value ?? { style: 'None' };
  // Con un lado mezclado no se bloquea nada: color y grosor también se editan
  // (si el estilo representado es «Sin borde», editar color/grosor lo pone Sólido).
  const isNone = current.style === 'None' && !mixed;
  const { color, change } = useDeferredColor(current.color, '#000000', (next) =>
    onSetStyle({
      border: {
        [side]: {
          ...current,
          style: current.style === 'None' ? 'Solid' : current.style,
          color: next,
        },
      },
    }),
  );

  const widthPt = current.width ? Math.round(toPt(current.width) * 100) / 100 : 1;
  const commitWidth = (pt: number): void => {
    onSetStyle({
      border: {
        [side]: {
          ...current,
          style: current.style === 'None' ? 'Solid' : current.style,
          width: { value: pt, unit: 'pt' },
        },
      },
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
        {label}
        {mixed ? ' —' : ''}
      </span>
      <select
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Borde ${label.toLowerCase()}: estilo`}
        value={mixed ? '' : current.style}
        onChange={(event) => {
          const style = event.target.value as BorderStyle;
          onSetStyle({ border: { [side]: { ...current, style } } });
        }}
      >
        {mixed ? (
          <option value="" disabled>
            —
          </option>
        ) : null}
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
      <NumberInput
        className="h-7 w-16 shrink-0"
        value={widthPt}
        label={`Borde ${label.toLowerCase()}: grosor (pt)`}
        title="Grosor en puntos (flechas o arrastre)"
        axis="x"
        min={0.25}
        step={0.25}
        perPx={0.05}
        suffix="pt"
        disabled={isNone}
        onCommit={commitWidth}
      />
    </div>
  );
}
