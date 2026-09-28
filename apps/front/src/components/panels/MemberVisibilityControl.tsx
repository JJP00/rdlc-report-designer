import { Eye, EyeOff, Sigma } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ExpressionDialog } from './ExpressionDialog';

export interface MemberVisibilityControlProps {
  /** Visibilidad declarada del miembro (`true`/`false`/expresión). */
  hidden?: boolean | string;
  /** «fila 3», «columna 2» o «grupo …»: para títulos y etiquetas accesibles. */
  label: string;
  /** `null` = quitar la visibilidad declarada. */
  onChange: (hidden: boolean | string | null) => void;
}

/**
 * Visibilidad de una fila/columna/grupo del Tablix desde el árbol de
 * estructura: el ojo alterna oculta/visible y `Σ` abre el diálogo de expresión
 * (Monaco con números de línea). El árbol ya pinta el estado (`EyeOff`).
 */
export function MemberVisibilityControl({
  hidden,
  label,
  onChange,
}: MemberVisibilityControlProps): ReactNode {
  const [dialogOpen, setDialogOpen] = useState(false);
  const isExpression = typeof hidden === 'string';
  const isHidden = hidden === true || isExpression;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={isHidden ? `Mostrar ${label}` : `Ocultar ${label}`}
        title={
          isHidden
            ? `${label} oculta (${isExpression ? 'por expresión' : 'oculta'}): click = visible`
            : `${label} visible: click = oculta`
        }
        onClick={() => onChange(isHidden ? null : true)}
        className="text-muted-foreground/70 hover:text-foreground"
      >
        {isHidden ? <EyeOff className="text-violet-500" /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Expresión de visibilidad de la ${label}`}
        title="Visibilidad por expresión…"
        onClick={() => setDialogOpen(true)}
        className="text-muted-foreground/70 hover:text-foreground"
      >
        <Sigma className={isExpression ? 'text-violet-500' : undefined} />
      </Button>

      {dialogOpen ? (
        <ExpressionDialog
          title={`Visibilidad de la ${label}`}
          value={isExpression ? hidden : ''}
          onClose={() => setDialogOpen(false)}
          onApply={(value) => {
            setDialogOpen(false);
            if (value.trim() !== '' && value !== hidden) onChange(value);
          }}
        />
      ) : null}
    </>
  );
}
