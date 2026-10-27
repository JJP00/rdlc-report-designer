import type { TablixFilterDto, TablixFilterOperator } from '@rdlc-designer/contracts';
import type { CatalogKey } from '@rdlc-designer/i18n';
import { useT } from '@rdlc-designer/i18n/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResizableDialogContent,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ExpressionEditor } from './ExpressionEditor';

/**
 * Filtros del Tablix (`Filters > Filter`, G10). Cada filtro es una expresión,
 * un operador y una lista de valores (**uno por línea**, así una expresión con
 * comas no se parte). «Aplicar» reemplaza el bloque entero: un paso de undo.
 * Marco redimensionable estándar (BUG-63): cabecera y pie fijos, scroll en el
 * cuerpo.
 */

const OPERATORS: { value: TablixFilterOperator; key: CatalogKey }[] = [
  { value: 'Equal', key: 'tablix.filters.operators.equal' },
  { value: 'NotEqual', key: 'tablix.filters.operators.notEqual' },
  { value: 'Like', key: 'tablix.filters.operators.like' },
  { value: 'GreaterThan', key: 'tablix.filters.operators.greaterThan' },
  { value: 'GreaterThanOrEqual', key: 'tablix.filters.operators.greaterThanOrEqual' },
  { value: 'LessThan', key: 'tablix.filters.operators.lessThan' },
  { value: 'LessThanOrEqual', key: 'tablix.filters.operators.lessThanOrEqual' },
  { value: 'In', key: 'tablix.filters.operators.in' },
  { value: 'Between', key: 'tablix.filters.operators.between' },
  { value: 'TopN', key: 'tablix.filters.operators.topN' },
  { value: 'BottomN', key: 'tablix.filters.operators.bottomN' },
  { value: 'TopPercent', key: 'tablix.filters.operators.topPercent' },
  { value: 'BottomPercent', key: 'tablix.filters.operators.bottomPercent' },
];

interface FilterDraft {
  id: string;
  expression: string;
  operator: TablixFilterOperator;
  /** Valores, uno por línea. */
  valuesText: string;
}

export interface TablixFiltersDialogProps {
  filters: TablixFilterDto[];
  onApply: (filters: TablixFilterDto[]) => void;
  onClose: () => void;
}

export function TablixFiltersDialog({
  filters,
  onApply,
  onClose,
}: TablixFiltersDialogProps): ReactNode {
  const t = useT();
  const [drafts, setDrafts] = useState<FilterDraft[]>(() =>
    filters.map((filter) => ({
      id: crypto.randomUUID(),
      expression: filter.expression,
      operator: filter.operator,
      valuesText: filter.values.join('\n'),
    })),
  );

  const valid = drafts.every((draft) => {
    const expression = draft.expression.trim();
    return expression !== '' && expression !== '=';
  });

  const apply = (): void => {
    onApply(
      drafts.map((draft) => ({
        expression: draft.expression.trim(),
        operator: draft.operator,
        values: draft.valuesText
          .split('\n')
          .map((value) => value.trim())
          .filter((value) => value !== ''),
      })),
    );
    onClose();
  };

  const update = (index: number, patch: Partial<FilterDraft>): void => {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResizableDialogContent
        className="max-h-[90vh] max-w-2xl sm:max-w-2xl"
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar (teclado completo en el diálogo).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && valid) {
            event.preventDefault();
            apply();
          }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('tablix.filters.title')}</DialogTitle>
          <DialogDescription>{t('tablix.filters.subtitle')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3 pr-1">
          {drafts.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('tablix.filters.empty')}</p>
          ) : null}

          {drafts.map((draft, index) => (
            <div key={draft.id} className="grid gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">
                  {t('tablix.filters.row', { index: index + 1 })}
                </Label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('tablix.filters.remove', { index: index + 1 })}
                  onClick={() =>
                    setDrafts((current) => current.filter((_, position) => position !== index))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {/* Cada tecla llega al borrador: «Aplicar» se habilita al escribir. */}
              <ExpressionEditor
                value={draft.expression}
                mode="expression"
                placeholder="=Fields!X.Value"
                ariaLabel={t('tablix.filters.expression', { index: index + 1 })}
                onChange={(expression) => update(index, { expression })}
                onCommit={(expression) => update(index, { expression })}
              />
              <select
                className="h-7 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
                aria-label={t('tablix.filters.operator', { index: index + 1 })}
                value={draft.operator}
                onChange={(event) =>
                  update(index, { operator: event.target.value as TablixFilterOperator })
                }
              >
                {OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {t(operator.key)}
                  </option>
                ))}
              </select>
              <Textarea
                className="min-h-16 font-mono text-xs"
                placeholder={'0\n=Fields!Otro.Value'}
                aria-label={t('tablix.filters.values', { index: index + 1 })}
                value={draft.valuesText}
                onChange={(event) => update(index, { valuesText: event.target.value })}
              />
            </div>
          ))}
        </DialogBody>

        <DialogFooter className="shrink-0 sm:justify-between">
          <Button
            variant="outline"
            onClick={() =>
              setDrafts((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  expression: '',
                  operator: 'Equal',
                  valuesText: '',
                },
              ])
            }
          >
            <Plus /> {t('tablix.filters.add')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button title={t('tablix.applyHint')} onClick={apply} disabled={!valid}>
              {t('tablix.apply')}
            </Button>
          </div>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
