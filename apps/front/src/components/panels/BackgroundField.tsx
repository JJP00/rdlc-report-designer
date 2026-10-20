import type { ItemDto, StylePatch } from '@rdlc-designer/contracts';
import { Sigma, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
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
  const t = useT();
  const current = item.style?.backgroundColor;
  const isExpression = typeof current === 'string' && current.startsWith('=');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { color, change } = useDeferredColor(current, '#ffffff', (backgroundColor) =>
    onSetStyle({ backgroundColor }),
  );

  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{t('panels.background.label')}</Label>
      <div className="flex items-center gap-2">
        <label
          title={t('panels.background.label')}
          className="relative flex h-7 w-14 cursor-pointer items-center justify-center rounded-md border bg-background"
        >
          <span className="h-4 w-9 rounded-sm border" style={{ backgroundColor: color }} />
          <input
            type="color"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            value={color}
            aria-label={t('panels.background.label')}
            onChange={(event) => change(event.target.value)}
          />
        </label>
        <Button
          variant="outline"
          size="icon-xs"
          title={t('panels.expression.openEditor')}
          aria-label={t('panels.background.openExpressionEditor')}
          onClick={() => setDialogOpen(true)}
        >
          <Sigma />
        </Button>
        {current !== undefined ? (
          <Button
            variant="ghost"
            size="xs"
            aria-label={t('panels.background.removeAria')}
            onClick={() => onSetStyle({ backgroundColor: null })}
          >
            <X /> {t('panels.background.remove')}
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">{t('panels.background.none')}</span>
        )}
      </div>

      {isExpression ? (
        <>
          <ExpressionEditor
            value={current}
            mode="expression"
            ariaLabel={t('panels.background.expressionTitle')}
            onCommit={(value) => {
              if (value.trim() !== '' && value !== current) onSetStyle({ backgroundColor: value });
            }}
          />
          {/* Barrido de microcopy (guía 0006): trim ligero — el hecho, sin relleno. */}
          <p className="text-[11px] text-muted-foreground">{t('panels.background.note')}</p>
        </>
      ) : null}

      {dialogOpen ? (
        <ExpressionDialog
          title={t('panels.background.expressionTitle')}
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
