import type { TablixDto } from '@rdlc-designer/contracts';
import {
  Columns3,
  Layers,
  LayersPlus,
  PencilLine,
  Plus,
  Rows3,
  Sigma,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { toCm } from '@/lib/projection';
import {
  tablixColumnsTree,
  tablixRowsTree,
  type SelectedCell,
  type TablixTreeEntry,
} from '@/lib/tablix';
import { cn } from '@/lib/utils';
import { ExpressionDialog } from './ExpressionDialog';
import { MemberVisibilityControl } from './MemberVisibilityControl';

/**
 * Panel de estructura del Tablix (F2 parte 3): árbol de filas y columnas
 * (grupos + hojas), selección de celda, añadir/quitar filas/columnas y la
 * gestión de grupos (F2.b): agrupar una fila, editar/ver la expresión del grupo
 * y quitar el grupo sin perder filas.
 *
 * Un **grupo hoja** (sin hijos) es la propia fila que se repite: se pinta con
 * el icono de capas (no `↳`) y su fila se puede seleccionar como cualquier hoja.
 */

export interface TablixStructurePanelProps {
  tablix: TablixDto;
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
  onAddRow: (row: number) => void;
  onDeleteRow: (row: number) => void;
  onAddColumn: (column: number) => void;
  onDeleteColumn: (column: number) => void;
  /** Visibilidad de una fila/columna/grupo (`path` de la proyección). */
  onSetMemberVisibility: (
    axis: 'row' | 'column',
    path: number[],
    hidden: boolean | string | null,
  ) => void;
  /** Edita la expresión del grupo apuntado por `path`. */
  onSetGroupExpression: (axis: 'row' | 'column', path: number[], expression: string) => void;
  /** Envuelve la fila en un grupo nuevo con esa expresión. */
  onAddRowGroup: (row: number, expression: string) => void;
  /** Quita el grupo: las filas que cuelgan se quedan como filas estáticas. */
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
}

export function TablixStructurePanel({
  tablix,
  selectedCell,
  onSelectCell,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onSetMemberVisibility,
  onSetGroupExpression,
  onAddRowGroup,
  onDeleteGroup,
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
        axis="row"
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
        onSetHidden={onSetMemberVisibility}
        onSetGroupExpression={onSetGroupExpression}
        onAddRowGroup={onAddRowGroup}
        onDeleteGroup={onDeleteGroup}
        addLabel={(index) => `Añadir fila encima de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar fila ${index + 1}`}
        selectLabel={(index) => `Seleccionar fila ${index + 1}`}
        addAtEndLabel="Añadir fila al final"
        detail={(entry) =>
          entry.index !== undefined
            ? `${toCm(tablix.body.rows[entry.index]?.height ?? { value: 0, unit: 'cm' }).toFixed(2)} cm`
            : undefined
        }
      />

      <StructureSection
        title="Columnas"
        icon={<Columns3 className="size-3.5" />}
        axis="column"
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
        onSetHidden={onSetMemberVisibility}
        onSetGroupExpression={onSetGroupExpression}
        onAddRowGroup={onAddRowGroup}
        onDeleteGroup={onDeleteGroup}
        addLabel={(index) => `Añadir columna a la izquierda de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar columna ${index + 1}`}
        selectLabel={(index) => `Seleccionar columna ${index + 1}`}
        addAtEndLabel="Añadir columna al final"
        detail={(entry) =>
          entry.index !== undefined
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
  axis: 'row' | 'column';
  entries: TablixTreeEntry[];
  rowCount: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onAdd: (index: number) => void;
  onDelete: (index: number) => void;
  onSetHidden: (axis: 'row' | 'column', path: number[], hidden: boolean | string | null) => void;
  onSetGroupExpression: (axis: 'row' | 'column', path: number[], expression: string) => void;
  onAddRowGroup: (row: number, expression: string) => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
  addLabel: (index: number) => string;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
  addAtEndLabel: string;
  detail: (entry: TablixTreeEntry) => string | undefined;
}

function StructureSection({
  title,
  icon,
  axis,
  entries,
  rowCount,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  onSetHidden,
  onSetGroupExpression,
  onAddRowGroup,
  onDeleteGroup,
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
            axis={axis}
            selected={entry.index !== undefined && entry.index === selectedIndex}
            canDelete={rowCount > 1}
            detail={detail(entry)}
            onSelect={onSelect}
            onDelete={onDelete}
            onSetHidden={onSetHidden}
            onSetGroupExpression={onSetGroupExpression}
            onAddRowGroup={onAddRowGroup}
            onDeleteGroup={onDeleteGroup}
            deleteLabel={deleteLabel}
            selectLabel={selectLabel}
          />
        ))}
      </div>
    </div>
  );
}

/** Etiqueta del miembro para títulos y `aria-label`: «fila 2», «grupo …». */
function memberLabel(entry: TablixTreeEntry, axis: 'row' | 'column'): string {
  if (entry.index !== undefined) return `${axis === 'row' ? 'fila' : 'columna'} ${entry.index + 1}`;
  return `grupo ${entry.expression ?? ''}`.trim();
}

/** Expresión lista para RDL (`=…`); `null` si está vacía. */
function ensureExpression(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '=') return null;
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

interface StructureRowProps {
  entry: TablixTreeEntry;
  icon: ReactNode;
  axis: 'row' | 'column';
  selected: boolean;
  canDelete: boolean;
  detail?: string;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onSetHidden: (axis: 'row' | 'column', path: number[], hidden: boolean | string | null) => void;
  onSetGroupExpression: (axis: 'row' | 'column', path: number[], expression: string) => void;
  onAddRowGroup: (row: number, expression: string) => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
}

/** Diálogo abierto en una fila: editar la expresión del grupo o agrupar la fila. */
type GroupDialogKind = 'edit' | 'group' | null;

/** Fila del árbol: cabecera de grupo (no es una fila del body) u hoja. */
function StructureRow(props: StructureRowProps): ReactNode {
  const { entry, axis, onSetGroupExpression, onAddRowGroup } = props;
  const [dialog, setDialog] = useState<GroupDialogKind>(null);
  const index = entry.index;
  const label = memberLabel(entry, axis);
  const closeDialog = (): void => setDialog(null);
  const isGroupHeader = entry.kind === 'group' && index === undefined;

  return (
    <>
      {isGroupHeader ? (
        <GroupHeaderRow {...props} label={label} onEditExpression={() => setDialog('edit')} />
      ) : (
        <LeafRow
          {...props}
          index={index ?? 0}
          label={label}
          onEditExpression={() => setDialog('edit')}
          onGroupRow={() => setDialog('group')}
        />
      )}

      {dialog === 'edit' ? (
        <GroupExpressionDialog
          label={label}
          leaf={index !== undefined}
          expression={entry.expression ?? ''}
          onClose={closeDialog}
          onApply={(expression) => {
            closeDialog();
            if (expression !== null && expression !== entry.expression) {
              onSetGroupExpression(axis, entry.path, expression);
            }
          }}
        />
      ) : null}
      {dialog === 'group' ? (
        <AddGroupDialog
          label={label}
          onClose={closeDialog}
          onApply={(expression) => {
            closeDialog();
            if (expression !== null) onAddRowGroup(index ?? 0, expression);
          }}
        />
      ) : null}
    </>
  );
}

/** Cabecera de grupo con hijos: expresión, total, visibilidad y acciones. */
function GroupHeaderRow({
  entry,
  axis,
  label,
  onSetHidden,
  onDeleteGroup,
  onEditExpression,
}: StructureRowProps & { label: string; onEditExpression: () => void }): ReactNode {
  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5 text-[11px] text-muted-foreground"
      style={{ paddingLeft: 6 + entry.depth * 12 }}
      title={entry.expression}
    >
      <Layers className="size-3 shrink-0 text-violet-500" />
      <span className="truncate font-medium">{entry.expression ?? 'Grupo'}</span>
      {entry.total !== 'none' ? <Sigma className="size-3 shrink-0 text-amber-600" /> : null}
      <span className="ml-auto flex items-center">
        <MemberVisibilityControl
          hidden={entry.hidden}
          label={label}
          onChange={(hidden) => onSetHidden(axis, entry.path, hidden)}
        />
        <IconButton
          label="Editar expresión del grupo"
          title="Editar la expresión del grupo…"
          onClick={onEditExpression}
        >
          <PencilLine />
        </IconButton>
        <IconButton
          label="Quitar grupo"
          title="Quitar el grupo (las filas se quedan como filas estáticas)"
          danger
          onClick={() => onDeleteGroup(axis, entry.path)}
        >
          <Ungroup />
        </IconButton>
      </span>
    </div>
  );
}

/** Hoja del árbol: fila estática o grupo hoja (la fila que se repite). */
function LeafRow({
  entry,
  icon,
  axis,
  selected,
  canDelete,
  detail,
  index,
  label,
  onSelect,
  onDelete,
  onSetHidden,
  onEditExpression,
  onGroupRow,
  onDeleteGroup,
  deleteLabel,
  selectLabel,
}: StructureRowProps & {
  index: number;
  label: string;
  onEditExpression: () => void;
  onGroupRow: () => void;
}): ReactNode {
  const isLeafGroup = entry.kind === 'group';
  return (
    <div
      className={cn('group flex items-center rounded', selected && 'bg-primary/10')}
      style={{ paddingLeft: 6 + entry.depth * 12 }}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-label={selectLabel(index)}
        title={
          isLeafGroup
            ? `${selectLabel(index)} (grupo ${entry.expression ?? ''})`
            : selectLabel(index)
        }
        className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
      >
        <LeafIdentity entry={entry} index={index} icon={icon} />
        {entry.total !== 'none' ? <TotalBadge total={entry.total} /> : null}
        {detail ? (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </button>

      <MemberVisibilityControl
        hidden={entry.hidden}
        label={label}
        onChange={(hidden) => onSetHidden(axis, entry.path, hidden)}
      />

      {isLeafGroup ? (
        <LeafGroupActions
          entry={entry}
          axis={axis}
          label={label}
          onEditExpression={onEditExpression}
          onDeleteGroup={onDeleteGroup}
        />
      ) : (
        <StaticRowActions
          axis={axis}
          index={index}
          label={label}
          canDelete={canDelete}
          deleteLabel={deleteLabel}
          onGroupRow={onGroupRow}
          onDelete={() => onDelete(index)}
        />
      )}
    </div>
  );
}

/** Icono + texto de una hoja (el grupo hoja se pinta con capas, no con `↳`). */
function LeafIdentity({
  entry,
  index,
  icon,
}: {
  entry: TablixTreeEntry;
  index: number;
  icon: ReactNode;
}): ReactNode {
  if (entry.kind === 'group') {
    return (
      <>
        <Layers className="size-3 shrink-0 text-violet-500" />
        <span className="truncate font-medium">{entry.expression ?? 'Grupo'}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{index + 1}</span>
    </>
  );
}

function TotalBadge({ total }: { total: 'before' | 'after' }): ReactNode {
  return (
    <span className="flex items-center gap-0.5 text-amber-700" title={`Total (${total})`}>
      <Sigma className="size-3" />
    </span>
  );
}

/** Botón de un grupo hoja: editar su expresión o quitar el grupo. */
function LeafGroupActions({
  entry,
  axis,
  label,
  onEditExpression,
  onDeleteGroup,
}: {
  entry: TablixTreeEntry;
  axis: 'row' | 'column';
  label: string;
  onEditExpression: () => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
}): ReactNode {
  return (
    <>
      <IconButton
        label={`Editar expresión del grupo de la ${label}`}
        title="Editar la expresión del grupo…"
        onClick={onEditExpression}
      >
        <PencilLine />
      </IconButton>
      <IconButton
        label={`Quitar grupo de la ${label}`}
        title="Quitar el grupo (la fila se queda como fila estática)"
        danger
        onClick={() => onDeleteGroup(axis, entry.path)}
      >
        <Ungroup />
      </IconButton>
    </>
  );
}

/** Botones de una hoja estática: agruparla (solo filas) y eliminarla. */
function StaticRowActions({
  axis,
  index,
  label,
  canDelete,
  deleteLabel,
  onGroupRow,
  onDelete,
}: {
  axis: 'row' | 'column';
  index: number;
  label: string;
  canDelete: boolean;
  deleteLabel: (index: number) => string;
  onGroupRow: () => void;
  onDelete: () => void;
}): ReactNode {
  return (
    <>
      {axis === 'row' ? (
        <IconButton
          label={`Agrupar la ${label}…`}
          title="Agrupar la fila en un grupo nuevo…"
          onClick={onGroupRow}
        >
          <LayersPlus />
        </IconButton>
      ) : null}
      <IconButton
        label={deleteLabel(index)}
        title={deleteLabel(index)}
        danger
        disabled={!canDelete}
        onClick={onDelete}
      >
        <Trash2 />
      </IconButton>
    </>
  );
}

function GroupExpressionDialog({
  label,
  leaf,
  expression,
  onClose,
  onApply,
}: {
  label: string;
  leaf: boolean;
  expression: string;
  onClose: () => void;
  onApply: (expression: string | null) => void;
}): ReactNode {
  return (
    <ExpressionDialog
      title={leaf ? `Expresión del grupo de la ${label}` : 'Expresión del grupo'}
      value={expression}
      onClose={onClose}
      onApply={(value) => onApply(ensureExpression(value))}
    />
  );
}

function AddGroupDialog({
  label,
  onClose,
  onApply,
}: {
  label: string;
  onClose: () => void;
  onApply: (expression: string | null) => void;
}): ReactNode {
  return (
    <ExpressionDialog
      title={`Agrupar la ${label}`}
      value=""
      onClose={onClose}
      onApply={(value) => onApply(ensureExpression(value))}
    />
  );
}

function IconButton({
  label,
  title,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'text-muted-foreground/70',
        danger ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      {children}
    </Button>
  );
}
