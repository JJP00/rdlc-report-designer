import { Sigma } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { visibilityMode, type VisibilityMode } from '@/lib/visibility';
import { ExpressionDialog } from './ExpressionDialog';
import { ExpressionEditor } from './ExpressionEditor';

export interface VisibilityFieldProps {
  hidden?: boolean | string;
  /** `null` = quitar la visibilidad declarada (queda visible). */
  onChange: (hidden: boolean | string | null) => void;
}

/**
 * Visibilidad del item (RDL `<Visibility><Hidden>`): visible, oculta o
 * expresión. La **predeterminada es visible** (no hay opción «predeterminada»):
 * elegir Visible quita la declaración (`Hidden` y el bloque si queda vacío).
 *
 * La expresión se edita inline con Monaco (autocompletado) y el botón `Σ` la
 * abre en un diálogo con Monaco **con números de línea**. Como en RB, no se
 * evalúa en diseño: el item se sigue viendo en el lienzo.
 */
export function VisibilityField({ hidden, onChange }: VisibilityFieldProps): ReactNode {
  const t = useT();
  const [dialogOpen, setDialogOpen] = useState(false);
  const isExpression = typeof hidden === 'string';
  const mode: VisibilityMode = isExpression || dialogOpen ? 'expression' : visibilityMode(hidden);

  const select = (next: VisibilityMode): void => {
    if (next === 'expression') {
      setDialogOpen(true);
      return;
    }
    if (next === 'hidden') onChange(true);
    else if (hidden !== undefined) onChange(null); // Visible: quita la declaración
  };

  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{t('panels.visibility.label')}</Label>
      <div className="flex items-center gap-2">
        <select
          className="h-7 flex-1 rounded-md border bg-background px-1 text-xs"
          value={mode}
          aria-label={t('panels.visibility.aria')}
          onChange={(event) => select(event.target.value as VisibilityMode)}
        >
          <option value="visible">{t('panels.visibility.visible')}</option>
          <option value="hidden">{t('panels.visibility.hidden')}</option>
          <option value="expression">{t('panels.visibility.expression')}</option>
        </select>
        <Button
          variant="outline"
          size="icon-xs"
          title={t('panels.expression.openEditor')}
          aria-label={t('panels.visibility.openExpressionEditor')}
          onClick={() => setDialogOpen(true)}
        >
          <Sigma />
        </Button>
      </div>

      {isExpression ? (
        <ExpressionEditor
          value={hidden}
          mode="expression"
          ariaLabel={t('panels.visibility.expressionTitle')}
          onCommit={(value) => {
            // Sin cambios no se escribe nada (el commit del blur es incondicional).
            if (value.trim() !== '' && value !== hidden) onChange(value);
          }}
        />
      ) : null}
      {hidden === true ? (
        <p className="text-[11px] text-muted-foreground">{t('panels.visibility.hiddenNote')}</p>
      ) : null}

      {dialogOpen ? (
        <ExpressionDialog
          title={t('panels.visibility.expressionTitle')}
          value={isExpression ? hidden : ''}
          onClose={() => setDialogOpen(false)}
          onApply={(value) => {
            setDialogOpen(false);
            if (value.trim() !== '' && value !== hidden) onChange(value);
          }}
        />
      ) : null}
    </div>
  );
}
