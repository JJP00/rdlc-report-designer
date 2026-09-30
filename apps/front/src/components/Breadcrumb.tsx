import type { ProjectionDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { breadcrumbEntries, type HierarchyTarget } from '@/lib/hierarchy';
import type { SelectedCell } from '@/lib/tablix';

export interface BreadcrumbProps {
  projection: ProjectionDto;
  selectedId: string | null;
  selectedCell: SelectedCell | null;
  onSelectItem: (id: string) => void;
  onSelectCell: (cell: SelectedCell) => void;
}

/**
 * Ruta de contenedores del elemento seleccionado (`Informe › Cuerpo › Tablix2 ›
 * Celda 2,1 › Textbox4`). Cada tramo con destino es un botón: sube de nivel sin
 * tener que acertar con Esc o con el borde del contenedor.
 */
export function Breadcrumb({
  projection,
  selectedId,
  selectedCell,
  onSelectItem,
  onSelectCell,
}: BreadcrumbProps): ReactNode {
  const entries = breadcrumbEntries(projection, {
    itemId: selectedId,
    cell: selectedCell,
  });
  if (entries.length <= 1) return null;

  const pick = (target: HierarchyTarget): void => {
    if (target.kind === 'item') onSelectItem(target.id);
    else onSelectCell({ id: target.id, row: target.row, col: target.col });
  };

  return (
    <nav
      aria-label="Ruta del elemento seleccionado"
      className="flex min-h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-muted/40 px-3 py-0.5 text-xs"
    >
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return (
          <span key={entry.label} className="flex shrink-0 items-center gap-0.5">
            {index > 0 ? (
              <ChevronRight aria-hidden className="size-3 text-muted-foreground/60" />
            ) : null}
            {entry.target && !last ? (
              <button
                type="button"
                onClick={() => pick(entry.target as HierarchyTarget)}
                className="rounded px-1 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {entry.label}
              </button>
            ) : (
              <span
                className="px-1 py-0.5 font-mono text-[11px] font-medium text-foreground"
                aria-current={last ? 'page' : undefined}
              >
                {entry.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
