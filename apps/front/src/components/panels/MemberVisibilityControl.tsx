import { Eye, EyeOff, Sigma } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
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
  const t = useT();
  const [dialogOpen, setDialogOpen] = useState(false);
  const isExpression = typeof hidden === 'string';
  const isHidden = hidden === true || isExpression;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={
          isHidden
            ? t('panels.memberVisibility.show', { label })
            : t('panels.memberVisibility.hide', { label })
        }
        title={
          isHidden
            ? isExpression
              ? t('panels.memberVisibility.titleHiddenExpression', { label })
              : t('panels.memberVisibility.titleHiddenLiteral', { label })
            : t('panels.memberVisibility.titleVisible', { label })
        }
        onClick={() => onChange(isHidden ? null : true)}
        className="text-muted-foreground/70 hover:text-foreground"
      >
        {isHidden ? <EyeOff className="text-violet-500" /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t('panels.memberVisibility.expressionAria', { label })}
        title={t('panels.memberVisibility.expressionTitle')}
        onClick={() => setDialogOpen(true)}
        className="text-muted-foreground/70 hover:text-foreground"
      >
        <Sigma className={isExpression ? 'text-violet-500' : undefined} />
      </Button>

      {dialogOpen ? (
        <ExpressionDialog
          title={t('panels.memberVisibility.dialogTitle', { label })}
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
