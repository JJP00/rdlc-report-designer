import type { Length, TablixDto, TablixMemberDto } from '@rdlc-designer/contracts';
import {
  Columns3,
  Layers,
  LayersArrowDown,
  LayersArrowUp,
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
import { NumberInput } from '@/components/ui/number-input';
import { ensureExpression } from '@/lib/groupProperties';
import { toCm } from '@/lib/projection';
import { MIN_SIZE_CM, resizeBoundaryTo } from '@/lib/resize';
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
  /** Abre «Propiedades del grupo» (expresiones, saltos, ordenación, visibilidad). */
  onOpenGroupProperties: (axis: 'row' | 'column', member: TablixMemberDto) => void;
  /** Añade una fila contigua al grupo (extiende su rango de hojas). */
  onAddRowToGroup: (row: number, groupPath: number[]) => void;
  /** F3 · Matrix: añade una columna contigua al grupo (espejo de la fila). */
  onAddColumnToGroup: (column: number, groupPath: number[]) => void;
  /** Envuelve la fila en un grupo nuevo con esa expresión. */
  onAddRowGroup: (row: number, expression: string) => void;
  /** F3 · Matrix: envuelve la columna en un grupo nuevo con esa expresión. */
  onAddColumnGroup: (column: number, expression: string) => void;
  /** Quita el grupo: las filas que cuelgan se quedan como filas estáticas. */
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
  /** Abre el diálogo de filtros del Tablix (`Filters > Filter`). */
  onOpenFilters: () => void;
  /** Fija el alto de una fila de la rejilla (el contenido sigue a la celda). */
  onResizeRow: (row: number, height: Length) => void;
  /** Fija el ancho de una columna de la rejilla (el contenido sigue a la celda). */
  onResizeColumn: (column: number, width: Length) => void;
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
  onOpenGroupProperties,
  onAddRowToGroup,
  onAddColumnToGroup,
  onAddRowGroup,
  onAddColumnGroup,
  onDeleteGroup,
  onOpenFilters,
  onResizeRow,
  onResizeColumn,
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
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">
            {tablix.body.rows.length} filas × {tablix.body.columns.length} columnas
          </span>
          <Button
            variant={tablix.filters && tablix.filters.length > 0 ? 'secondary' : 'ghost'}
            size="xs"
            title="Filtros del Tablix (Filters > Filter)"
            onClick={onOpenFilters}
          >
            {tablix.filters && tablix.filters.length > 0
              ? `Filtros (${tablix.filters.length})`
              : 'Filtros…'}
          </Button>
        </div>
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
        onOpenGroupProperties={onOpenGroupProperties}
        onAddRowToGroup={onAddRowToGroup}
        onAddColumnToGroup={onAddColumnToGroup}
        onAddRowGroup={onAddRowGroup}
        onAddColumnGroup={onAddColumnGroup}
        onDeleteGroup={onDeleteGroup}
        addLabel={(index) => `Añadir fila encima de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar fila ${index + 1}`}
        selectLabel={(index) => `Seleccionar fila ${index + 1}`}
        addAtEndLabel="Añadir fila al final"
        sizeOf={(entry) =>
          entry.index !== undefined ? tablix.body.rows[entry.index]?.height : undefined
        }
        onResizeSize={onResizeRow}
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
        onOpenGroupProperties={onOpenGroupProperties}
        onAddRowToGroup={onAddRowToGroup}
        onAddColumnToGroup={onAddColumnToGroup}
        onAddRowGroup={onAddRowGroup}
        onAddColumnGroup={onAddColumnGroup}
        onDeleteGroup={onDeleteGroup}
        addLabel={(index) => `Añadir columna a la izquierda de la ${index + 1}`}
        deleteLabel={(index) => `Eliminar columna ${index + 1}`}
        selectLabel={(index) => `Seleccionar columna ${index + 1}`}
        addAtEndLabel="Añadir columna al final"
        sizeOf={(entry) =>
          entry.index !== undefined ? tablix.body.columns[entry.index] : undefined
        }
        onResizeSize={onResizeColumn}
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
  onOpenGroupProperties: (axis: 'row' | 'column', member: TablixMemberDto) => void;
  onAddRowToGroup: (row: number, groupPath: number[]) => void;
  onAddColumnToGroup: (column: number, groupPath: number[]) => void;
  onAddRowGroup: (row: number, expression: string) => void;
  onAddColumnGroup: (column: number, expression: string) => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
  addLabel: (index: number) => string;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
  addAtEndLabel: string;
  /** Longitud declarada de la hoja (alto de fila / ancho de columna). */
  sizeOf?: (entry: TablixTreeEntry) => Length | undefined;
  onResizeSize: (index: number, next: Length) => void;
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
  onOpenGroupProperties,
  onAddRowToGroup,
  onAddColumnToGroup,
  onAddRowGroup,
  onAddColumnGroup,
  onDeleteGroup,
  addLabel,
  deleteLabel,
  selectLabel,
  addAtEndLabel,
  sizeOf,
  onResizeSize,
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
            total={rowCount}
            size={sizeOf?.(entry)}
            onSelect={onSelect}
            onDelete={onDelete}
            onSetHidden={onSetHidden}
            onOpenGroupProperties={onOpenGroupProperties}
            onAddRowToGroup={onAddRowToGroup}
            onAddColumnToGroup={onAddColumnToGroup}
            onAddRowGroup={onAddRowGroup}
            onAddColumnGroup={onAddColumnGroup}
            onDeleteGroup={onDeleteGroup}
            onResizeSize={onResizeSize}
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

interface StructureRowProps {
  entry: TablixTreeEntry;
  icon: ReactNode;
  axis: 'row' | 'column';
  selected: boolean;
  canDelete: boolean;
  /** Total de hojas del eje (filas o columnas), para saber los bordes. */
  total: number;
  /** Longitud declarada de la hoja (alto de fila / ancho de columna). */
  size?: Length;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onSetHidden: (axis: 'row' | 'column', path: number[], hidden: boolean | string | null) => void;
  /** Abre «Propiedades del grupo» del miembro indicado. */
  onOpenGroupProperties: (axis: 'row' | 'column', member: TablixMemberDto) => void;
  onAddRowToGroup: (row: number, groupPath: number[]) => void;
  onAddColumnToGroup: (column: number, groupPath: number[]) => void;
  onAddRowGroup: (row: number, expression: string) => void;
  onAddColumnGroup: (column: number, expression: string) => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
  onResizeSize: (index: number, next: Length) => void;
  deleteLabel: (index: number) => string;
  selectLabel: (index: number) => string;
}

/** Fila del árbol: cabecera de grupo (no es una fila del body) u hoja. */
function StructureRow(props: StructureRowProps): ReactNode {
  const { entry, axis, onOpenGroupProperties, onAddRowGroup, onAddColumnGroup } = props;
  const [groupDialog, setGroupDialog] = useState(false);
  const index = entry.index;
  const label = memberLabel(entry, axis);
  const isGroupHeader = entry.kind === 'group' && index === undefined;
  const openProperties = (): void => onOpenGroupProperties(axis, entry.member);
  const addGroup = axis === 'row' ? onAddRowGroup : onAddColumnGroup;

  return (
    <>
      {isGroupHeader ? (
        <GroupHeaderRow {...props} label={label} onOpenProperties={openProperties} />
      ) : (
        <LeafRow
          {...props}
          index={index ?? 0}
          label={label}
          onOpenProperties={openProperties}
          onGroupRow={() => setGroupDialog(true)}
        />
      )}

      {groupDialog ? (
        <AddGroupDialog
          label={label}
          onClose={() => setGroupDialog(false)}
          onApply={(expression) => {
            setGroupDialog(false);
            if (expression !== null) addGroup(index ?? 0, expression);
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
  total,
  label,
  onSetHidden,
  onDeleteGroup,
  onAddRowToGroup,
  onAddColumnToGroup,
  onOpenProperties,
}: StructureRowProps & { label: string; onOpenProperties: () => void }): ReactNode {
  const isContainerGroup = entry.member.children.length > 0;

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
        {isContainerGroup ? (
          <AddAdjacentLeaves
            entry={entry}
            axis={axis}
            total={total}
            onAddToGroup={axis === 'row' ? onAddRowToGroup : onAddColumnToGroup}
          />
        ) : null}
        <IconButton
          label="Propiedades del grupo"
          title="Propiedades del grupo (expresiones, saltos, ordenación, visibilidad)…"
          onClick={onOpenProperties}
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

/**
 * Extiende el grupo con la hoja (fila/columna) contigua por arriba/izquierda o
 * abajo/derecha: la vecina pasa a ser su primera/última hoja, sin cambiar el
 * body (F2.b para filas, F3 para columnas).
 */
function AddAdjacentLeaves({
  entry,
  axis,
  total,
  onAddToGroup,
}: {
  entry: TablixTreeEntry;
  axis: 'row' | 'column';
  total: number;
  onAddToGroup: (index: number, groupPath: number[]) => void;
}): ReactNode {
  const what = axis === 'row' ? 'fila' : 'columna';
  return (
    <>
      {entry.leafStart > 0 ? (
        <IconButton
          label={`Añadir la ${what} ${entry.leafStart} al grupo`}
          title={`Añadir la ${what} anterior a este grupo`}
          onClick={() => onAddToGroup(entry.leafStart - 1, entry.path)}
        >
          <LayersArrowUp />
        </IconButton>
      ) : null}
      {entry.leafEnd < total - 1 ? (
        <IconButton
          label={`Añadir la ${what} ${entry.leafEnd + 2} al grupo`}
          title={`Añadir la ${what} siguiente a este grupo`}
          onClick={() => onAddToGroup(entry.leafEnd + 1, entry.path)}
        >
          <LayersArrowDown />
        </IconButton>
      ) : null}
    </>
  );
}

/** Hoja del árbol: fila estática o grupo hoja (la fila que se repite). */
function LeafRow({
  entry,
  icon,
  axis,
  selected,
  canDelete,
  size,
  index,
  label,
  onSelect,
  onDelete,
  onSetHidden,
  onOpenProperties,
  onGroupRow,
  onDeleteGroup,
  onResizeSize,
  deleteLabel,
  selectLabel,
}: StructureRowProps & {
  index: number;
  label: string;
  onOpenProperties: () => void;
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
      </button>

      {/* Tamaño de la hoja (cm): al aplicarlo el contenido de la celda la sigue. */}
      {size ? (
        <SizeEditor
          value={size}
          axis={axis}
          label={`${axis === 'row' ? 'Alto' : 'Ancho'} de la ${label}`}
          title={`${axis === 'row' ? 'Alto' : 'Ancho'} de la ${label} (cm). El contenido de la celda se ajusta a la celda.`}
          onCommit={(cmValue) => onResizeSize(index, resizeBoundaryTo(size, cmValue))}
        />
      ) : null}

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
          onOpenProperties={onOpenProperties}
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

/** Botón de un grupo hoja: abrir sus propiedades o quitar el grupo. */
function LeafGroupActions({
  entry,
  axis,
  label,
  onOpenProperties,
  onDeleteGroup,
}: {
  entry: TablixTreeEntry;
  axis: 'row' | 'column';
  label: string;
  onOpenProperties: () => void;
  onDeleteGroup: (axis: 'row' | 'column', path: number[]) => void;
}): ReactNode {
  return (
    <>
      <IconButton
        label={`Propiedades del grupo de la ${label}`}
        title="Propiedades del grupo (expresiones, saltos, ordenación, visibilidad)…"
        onClick={onOpenProperties}
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
      <IconButton
        label={`Agrupar la ${label}…`}
        title={`Agrupar la ${axis === 'row' ? 'fila' : 'columna'} en un grupo nuevo…`}
        onClick={onGroupRow}
      >
        <LayersPlus />
      </IconButton>
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

/**
 * Editor del tamaño de una fila/columna (en cm): el `NumberInput` estándar
 * (teclear, flechas ↑/↓ y arrastre con el cursor de redimensionado) aplicado
 * con la misma matemática que el redimensionado en el lienzo (mínimo y unidad
 * declarada). El contenido de la celda acompaña al tamaño.
 */
function SizeEditor({
  value,
  axis,
  label,
  title,
  onCommit,
}: {
  value: Length;
  axis: 'row' | 'column';
  label: string;
  title: string;
  onCommit: (cmValue: number) => void;
}): ReactNode {
  return (
    <div className="ml-auto flex shrink-0 items-center">
      <NumberInput
        value={toCm(value)}
        label={label}
        title={`${title} Arrastra, usa las flechas o teclea el valor.`}
        axis={axis === 'row' ? 'y' : 'x'}
        min={MIN_SIZE_CM}
        suffix="cm"
        className="h-6 w-14"
        onCommit={onCommit}
      />
    </div>
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
