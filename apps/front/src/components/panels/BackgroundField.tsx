import type { ItemDto, StylePatch } from '@rdlc-designer/contracts';
import { Sigma, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { ExpressionDialog } from './ExpressionDialog';
import { ExpressionEditor } from './ExpressionEditor';

export interface BackgroundFieldProps {
  item: ItemDto;
  onSetStyle: (patch: StylePatch) => void;
}

/**
 * Color de fondo del item (`BackgroundColor`): selector de color literal o
 * **expresión** (`=IIF(...)`), editable inline con Monaco y en un diálogo con
 * números de línea (botón `Σ`). Como en RB, las expresiones no se evalúan en
 * diseño: se pinta el color por defecto y el XML se conserva.
 *
 * El selector confirma **al parar** (commit diferido): arrastrar la paleta no
 * lanza un comando por paso ni ralentiza el lienzo.
 */
export function BackgroundField({ item, onSetStyle }: BackgroundFieldProps): ReactNode {
  const current = item.style?.backgroundColor;
  const isExpression = typeof current === 'string' && current.startsWith('=');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { color, change } = useDeferredColor(current, '#ffffff', (backgroundColor) =>
    onSetStyle({ backgroundColor }),
  );

  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">Color de fondo</Label>
      <div className="flex items-center gap-2">
        <label
          title="Color de fondo"
          className="flex h-7 w-14 cursor-pointer items-center justify-center rounded-md border bg-background"
        >
          <span className="h-4 w-9 rounded-sm border" style={{ backgroundColor: color }} />
          <input
            type="color"
            className="sr-only"
            value={color}
            aria-label="Color de fondo"
            onChange={(event) => change(event.target.value)}
          />
        </label>
        <Button
          variant="outline"
          size="icon-xs"
          title="Editor de expresiones (con números de línea)"
          aria-label="Abrir editor de la expresión de color de fondo"
          onClick={() => setDialogOpen(true)}
        >
          <Sigma />
        </Button>
        {current !== undefined ? (
          <Button
            variant="ghost"
            size="xs"
            aria-label="Quitar color de fondo"
            onClick={() => onSetStyle({ backgroundColor: null })}
          >
            <X /> Quitar
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Sin color</span>
        )}
      </div>

      {isExpression ? (
        <>
          <ExpressionEditor
            value={current}
            mode="expression"
            ariaLabel="Expresión del color de fondo"
            onCommit={(value) => {
              if (value.trim() !== '' && value !== current) onSetStyle({ backgroundColor: value });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Expresión de fondo: en diseño no se evalúa y se pinta por defecto.
          </p>
        </>
      ) : null}

      {dialogOpen ? (
        <ExpressionDialog
          title="Expresión del color de fondo"
          value={isExpression ? current : ''}
          onClose={() => setDialogOpen(false)}
          onApply={(value) => {
            setDialogOpen(false);
            if (value.trim() !== '') onSetStyle({ backgroundColor: value });
          }}
        />
      ) : null}
    </div>
  );
}
