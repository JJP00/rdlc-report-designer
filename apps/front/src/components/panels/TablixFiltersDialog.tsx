import type { TablixFilterDto, TablixFilterOperator } from '@rdlc-designer/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Filtros del Tablix (`Filters > Filter`, G10). Cada filtro es una expresión,
 * un operador y una lista de valores (**uno por línea**, así una expresión con
 * comas no se parte). «Aplicar» reemplaza el bloque entero: un paso de undo.
 */

const OPERATORS: { value: TablixFilterOperator; label: string }[] = [
  { value: 'Equal', label: 'Igual a' },
  { value: 'NotEqual', label: 'Distinto de' },
  { value: 'Like', label: 'Como (Like)' },
  { value: 'GreaterThan', label: 'Mayor que' },
  { value: 'GreaterThanOrEqual', label: 'Mayor o igual' },
  { value: 'LessThan', label: 'Menor que' },
  { value: 'LessThanOrEqual', label: 'Menor o igual' },
  { value: 'In', label: 'En la lista (In)' },
  { value: 'Between', label: 'Entre (Between)' },
  { value: 'TopN', label: 'Top N' },
  { value: 'BottomN', label: 'Bottom N' },
  { value: 'TopPercent', label: 'Top %' },
  { value: 'BottomPercent', label: 'Bottom %' },
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
      <DialogContent
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 overflow-hidden sm:max-w-2xl"
        resizable
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar (teclado completo en el diálogo).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && valid) {
            event.preventDefault();
            apply();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Filtros del Tablix</DialogTitle>
          <DialogDescription>
            Se evalúan por fila del dataset antes de agrupar. Los valores van uno por línea (permite
            expresiones con comas).
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {drafts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin filtros.</p>
          ) : null}

          {drafts.map((draft, index) => (
            <div key={draft.id} className="grid gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">
                  Filtro {index + 1}
                </Label>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Quitar filtro ${index + 1}`}
                  onClick={() =>
                    setDrafts((current) => current.filter((_, position) => position !== index))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <Input
                className="h-7 font-mono text-xs"
                placeholder="=Fields!X.Value"
                aria-label={`Expresión del filtro ${index + 1}`}
                value={draft.expression}
                onChange={(event) => update(index, { expression: event.target.value })}
              />
              <select
                className="h-7 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
                aria-label={`Operador del filtro ${index + 1}`}
                value={draft.operator}
                onChange={(event) =>
                  update(index, { operator: event.target.value as TablixFilterOperator })
                }
              >
                {OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <Textarea
                className="min-h-16 font-mono text-xs"
                placeholder={'0\n=Fields!Otro.Value'}
                aria-label={`Valores del filtro ${index + 1}`}
                value={draft.valuesText}
                onChange={(event) => update(index, { valuesText: event.target.value })}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
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
            <Plus /> Añadir filtro
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button title="Aplicar (Ctrl+Intro)" onClick={apply} disabled={!valid}>
              Aplicar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
