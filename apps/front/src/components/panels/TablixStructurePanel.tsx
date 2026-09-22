import type { TablixDto } from '@rdlc-designer/contracts';
import { Columns3, EyeOff, Layers, Plus, Rows3, Sigma, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { toCm } from '@/lib/projection';
import {
  tablixColumnsTree,
  tablixRowsTree,
  type SelectedCell,
  type TablixTreeEntry,
} from '@/lib/tablix';
import { cn } from '@/lib/utils';

/**
 * Panel de estructura del Tablix (F2 parte 3): árbol de filas y columnas
 * (grupos + hojas), selección de celda y añadir/quitar filas/columnas.
 */

export interface TablixStructurePanelProps {
  tablix: TablixDto;
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
  onAddRow: (row: number) => void;
  onDeleteRow: (row: number) => void;
  onAddColumn: (column: number) => void;
  onDeleteColumn: (column: number) => void;
}

export function TablixStructurePanel({
  tablix,
  selectedCell,
  onSelectCell,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
}: TablixStructurePanelProps): ReactNode {
  const rows = tablixRowsTree(tablix);
  const columns = tablixColumnsTree(tablix);
  const selectedRow = selectedCell?.id === tablix.id ? selectedCell.row : null;
  const selectedColumn = selectedCell?.id === tablix.id ? selectedCell.col : null;

  // La columna/fila activa se mantiene al cambiar de eje (con clamp).
  const activeRow = selectedRow ?? 0;
  const activeColumn = selectedColumn ?? 0;

  return (
    <section aria-label="Estructura del Tablix" className="border-b">
      <header className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Estructura
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {tablix.body.rows.length} filas × {tablix.body.columns.length} columnas
        </span>
      </header>

      <StructureSection
        title="Filas"
        icon={<Rows3 className="size-3.5" />}
        entries={rows}
        rowCount={tablix.body.rows.length}
        selectedIndex={selectedRow}
        onSelect={(index) =>
          onSelectCell({
            id: tablix.id,
            row: index,
            col: Math.min(activeColumn, tablix.body.columns.length - 1),
          })
        }
        onAdd={onAddRow}
        onDelete={onDeleteRow}
        addLabel={(index) => `Añadir fila encima de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar fila ${index + 1}`}
        selectLabel={(index) => `Seleccionar fila ${index + 1}`}
        addAtEndLabel="Añadir fila al final"
        detail={(entry) =>
          entry.kind === 'row' && entry.index !== undefined
            ? `${toCm(tablix.body.rows[entry.index]?.height ?? { value: 0, unit: 'cm' }).toFixed(2)} cm`
            : undefined
        }
      />

      <StructureSection
        title="Columnas"
        icon={<Columns3 className="size-3.5" />}
        entries={columns}
        rowCount={tablix.body.columns.length}
        selectedIndex={selectedColumn}
        onSelect={(index) =>
          onSelectCell({
            id: tablix.id,
            row: Math.min(activeRow, tablix.body.rows.length - 1),
            col: index,
          })
        }
        onAdd={onAddColumn}
        onDelete={onDeleteColumn}
        addLabel={(index) => `Añadir columna a la izquierda de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar columna ${index + 1}`}
        selectLabel={(index) => `Seleccionar columna ${index + 1}`}
        addAtEndLabel="Añadir columna al final"
        detail={(entry) =>
          entry.kind === 'row' && entry.index !== undefined
            ? `${toCm(tablix.body.columns[entry.index] ?? { value: 0, unit: 'cm' }).toFixed(2)} cm`
            : undefined
        }
      />
    </section>
  );
}

interface StructureSectionProps {
  title: string;
  icon: ReactNode;
  entries: TablixTreeEntry[];
  rowCount: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
  addLabel: (index: number) => string;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
  addAtEndLabel: string;
  detail: (entry: TablixTreeEntry) => string | undefined;
}

function StructureSection({
  title,
  icon,
  entries,
  rowCount,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  addLabel,
  deleteLabel,
  selectLabel,
  addAtEndLabel,
  detail,
}: StructureSectionProps): ReactNode {
  return (
    <div className="px-2 pb-2 pt-1">
      <div className="flex items-center justify-between px-1 py-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={addAtEndLabel}
          title={addAtEndLabel}
          onClick={() => onAdd(rowCount)}
        >
          <Plus />
        </Button>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {entries.map((entry) => (
          <StructureRow
            key={entry.path.join('-')}
            entry={entry}
            icon={icon}
            selected={entry.kind === 'row' && entry.index === selectedIndex}
            canDelete={rowCount > 1}
            detail={detail(entry)}
            onSelect={onSelect}
            onAdd={onAdd}
            onDelete={onDelete}
            addLabel={addLabel}
            deleteLabel={deleteLabel}
            selectLabel={selectLabel}
          />
        ))}
      </div>
    </div>
  );
}

function StructureRow({
  entry,
  icon,
  selected,
  canDelete,
  detail,
  onSelect,
  onAdd,
  onDelete,
  addLabel,
  deleteLabel,
  selectLabel,
}: {
  entry: TablixTreeEntry;
  icon: ReactNode;
  selected: boolean;
  canDelete: boolean;
  detail?: string;
  onSelect: (index: number) => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
  addLabel: (index: number) => string;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
}): ReactNode {
  const indent = 6 + entry.depth * 12;

  if (entry.kind === 'group') {
    return (
      <div
        className="flex items-center gap-1 px-1 py-0.5 text-[11px] text-muted-foreground"
        style={{ paddingLeft: indent }}
        title={entry.expression}
      >
        <Layers className="size-3 shrink-0 text-violet-500" />
        <span className="truncate font-medium">{entry.expression ?? 'Grupo'}</span>
        {entry.total !== 'none' ? <Sigma className="size-3 shrink-0 text-amber-600" /> : null}
      </div>
    );
  }

  const index = entry.index ?? 0;
  return (
    <div
      className={cn('group flex items-center rounded', selected && 'bg-primary/10')}
      style={{ paddingLeft: indent }}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-label={selectLabel(index)}
        title={selectLabel(index)}
        className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="truncate">
          {entry.expression ? <span className="text-violet-600">↳ </span> : null}
          {index + 1}
        </span>
        {entry.total !== 'none' ? (
          <span
            className="flex items-center gap-0.5 text-amber-700"
            title={`Total (${entry.total})`}
          >
            <Sigma className="size-3" />
          </span>
        ) : null}
        {entry.hidden ? (
          <span className="flex items-center" title="Oculta por expresión">
            <EyeOff className="size-3 shrink-0 text-muted-foreground" />
          </span>
        ) : null}
        {detail ? (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </button>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={addLabel(index)}
        title={addLabel(index)}
        onClick={() => onAdd(index)}
        className="text-muted-foreground/70 hover:text-foreground"
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={deleteLabel(index)}
        title={deleteLabel(index)}
        disabled={!canDelete}
        onClick={() => onDelete(index)}
        className="text-muted-foreground/70 hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
