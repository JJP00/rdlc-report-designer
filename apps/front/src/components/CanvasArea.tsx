import type {
  ItemDto,
  Length,
  NewItemSpec,
  ProjectionDto,
  ScopeRef,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { CanvasHit } from '@/lib/hit';
import { itemKindLabel } from '@/lib/palette';
import { findItem } from '@/lib/projection';
import {
  canMergeSelection,
  formatIndexList,
  hitSelectionCell,
  rangeCols,
  selectionBounds,
  selectionCells,
  selectionCols,
  selectionRows,
  tablixLayout,
  type SelectedCell,
} from '@/lib/tablix';

const INSERT_KINDS = ['textbox', 'rectangle', 'line', 'image'] as const;

export interface CanvasAreaProps {
  projection: ProjectionDto | null;
  zoom: number;
  selectedId: string | null;
  /** Celda de Tablix seleccionada (F2 parte 3). */
  selectedCell: SelectedCell | null;
  /** Último hit del click derecho (destino de Insertar/Pegar). */
  menuHit: CanvasHit | null;
  hasClipboard: boolean;
  reveal: { id: string; nonce: number } | null;
  onSelect: (id: string | null) => void;
  onSelectCell: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  onContextMenuHit: (hit: CanvasHit) => void;
  onZoomChange: (zoom: number) => void;
  onMoveItem: (id: string, top: Length, left: Length) => void;
  /** Tiradores de la selección: mover + redimensionar en un comando. */
  onResizeItem: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  /** Separadores de la rejilla: redimensionar una columna/fila del Tablix. */
  onResizeColumn: (id: string, column: number, width: Length) => void;
  onResizeRow: (id: string, row: number, height: Length) => void;
  onInsertAt: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  /** Estructura del Tablix desde el menú contextual de una celda. */
  onAddRow: (id: string, row: number) => void;
  onDeleteRow: (id: string, row: number) => void;
  onAddColumn: (id: string, column: number) => void;
  onDeleteColumn: (id: string, column: number) => void;
  onDeleteRows: (id: string, rows: number[]) => void;
  onDeleteColumns: (id: string, columns: number[]) => void;
  onMergeCells: (id: string, row: number, col: number, rowSpan: number, colSpan: number) => void;
  onUnmergeCells: (id: string, row: number, col: number) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPasteAt: (scope: ScopeRef, index: number) => void;
  onDelete: () => void;
  /** Abre el editor de texto del textbox (párrafos → runs). */
  onEditText: (id: string) => void;
  /** Esc / menú: sube al contenedor del item seleccionado. */
  onSelectParent: () => void;
}

/** Lienzo + menú contextual (estructura del Tablix, acciones del item e insertar). */
export function CanvasArea(props: CanvasAreaProps): ReactNode {
  const {
    projection,
    zoom,
    selectedId,
    selectedCell,
    menuHit,
    hasClipboard,
    reveal,
    onSelect,
    onSelectCell,
    onContextMenuHit,
    onZoomChange,
    onMoveItem,
    onResizeItem,
    onResizeColumn,
    onResizeRow,
    onInsertAt,
    onAddRow,
    onDeleteRow,
    onAddColumn,
    onDeleteColumn,
    onDeleteRows,
    onDeleteColumns,
    onMergeCells,
    onUnmergeCells,
    onDuplicate,
    onCopy,
    onCut,
    onPasteAt,
    onDelete,
    onEditText,
    onSelectParent,
  } = props;

  const cellScope = cellScopeForMenu(menuHit, selectedCell);
  const selection =
    cellScope && selectedCell && selectedCell.id === cellScope.id ? selectedCell : null;
  const menuTablix = cellScope && projection ? findItem(projection, cellScope.id) : undefined;
  const tablix = menuTablix?.kind === 'tablix' ? menuTablix : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex min-h-0 flex-1 flex-col">
          {projection ? (
            <CanvasPreview
              projection={projection}
              zoom={zoom}
              selectedId={selectedId}
              selectedCell={selectedCell}
              onSelect={onSelect}
              onSelectCell={onSelectCell}
              onMoveItem={onMoveItem}
              onZoomChange={onZoomChange}
              onContextMenuHit={onContextMenuHit}
              onDropItem={onInsertAt}
              onResizeItem={onResizeItem}
              onResizeColumn={onResizeColumn}
              onResizeRow={onResizeRow}
              reveal={reveal}
            />
          ) : (
            <EmptyCanvas />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <ContextMenuLabel>{menuLabel(menuHit, cellScope)}</ContextMenuLabel>
        <ContextMenuSeparator />

        {cellScope ? (
          <TablixMenuItems
            cellScope={cellScope}
            selection={selection}
            tablix={tablix}
            onAddRow={onAddRow}
            onDeleteRow={onDeleteRow}
            onAddColumn={onAddColumn}
            onDeleteColumn={onDeleteColumn}
            onDeleteRows={onDeleteRows}
            onDeleteColumns={onDeleteColumns}
            onMergeCells={onMergeCells}
            onUnmergeCells={onUnmergeCells}
          />
        ) : null}

        <ItemActionsMenu
          item={menuHit?.item}
          hasClipboard={hasClipboard}
          onCut={onCut}
          onCopy={onCopy}
          onPaste={() => {
            if (menuHit) onPasteAt(menuHit.scope, menuHit.index);
          }}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onEditText={onEditText}
          onSelectParent={onSelectParent}
        />

        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Insertar</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {INSERT_KINDS.map((kind) => (
              <ContextMenuItem
                key={kind}
                onSelect={() => {
                  if (menuHit) onInsertAt(kind, menuHit);
                }}
              >
                {itemKindLabel(kind)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function menuLabel(
  menuHit: CanvasHit | null,
  cellScope: { id: string; row: number; col: number } | null,
): ReactNode {
  if (menuHit?.item) return menuHit.item.id;
  if (cellScope) {
    return `${cellScope.id} · fila ${cellScope.row + 1} · columna ${cellScope.col + 1}`;
  }
  return 'Lienzo';
}

/**
 * Celda del menú contextual: si el click derecho atraviesa una celda que forma
 * parte de la selección (aunque el elemento más interno sea de un tablix
 * anidado), manda esa; si no, la celda del scope del hit.
 */
function cellScopeForMenu(
  hit: CanvasHit | null,
  selection: SelectedCell | null,
): Extract<ScopeRef, { kind: 'tablixCell' }> | null {
  if (!hit) return null;
  const selected = hitSelectionCell(hit.cells, selection);
  if (selected) return { kind: 'tablixCell', ...selected };
  if (hit.scope.kind === 'tablixCell') return hit.scope;
  return null;
}

function EmptyCanvas(): ReactNode {
  return (
    <div className="m-auto max-w-lg text-center text-sm text-muted-foreground">
      <p>Sin documento abierto.</p>
      <p className="mt-2">
        Abre un .rdlc, arrastra un tipo de elemento desde la barra al lienzo (o haz click derecho
        para insertar), selecciona un elemento y muévelo (imán de 0,1 cm; Shift lo ignora), edita su
        texto o expresión en el panel derecho, deshaz con Ctrl+Z y guarda: solo cambian los valores
        editados.
      </p>
    </div>
  );
}

/** Acciones de estructura del Tablix: insertar, borrar (rango) y fusionar. */
function TablixMenuItems({
  cellScope,
  selection,
  tablix,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onDeleteRows,
  onDeleteColumns,
  onMergeCells,
  onUnmergeCells,
}: {
  cellScope: { kind: 'tablixCell'; id: string; row: number; col: number };
  selection: SelectedCell | null;
  tablix: Extract<ItemDto, { kind: 'tablix' }> | undefined;
  onAddRow: (id: string, row: number) => void;
  onDeleteRow: (id: string, row: number) => void;
  onAddColumn: (id: string, column: number) => void;
  onDeleteColumn: (id: string, column: number) => void;
  onDeleteRows: (id: string, rows: number[]) => void;
  onDeleteColumns: (id: string, columns: number[]) => void;
  onMergeCells: (id: string, row: number, col: number, rowSpan: number, colSpan: number) => void;
  onUnmergeCells: (id: string, row: number, col: number) => void;
}): ReactNode {
  const layout = tablix ? tablixLayout(tablix) : undefined;
  const selectedRefs = selection ? selectionCells(selection) : [];
  const multipleCells = selectedRefs.length > 1;
  const rowsTouched = selection ? selectionRows(selection) : [];
  const colsTouched = selection ? selectionCols(selection) : [];
  // Tramo a fusionar (una fila, celdas contiguas), contando las sueltas de Ctrl.
  const mergeRange =
    selection && canMergeSelection(selection) ? selectionBounds(selection) : undefined;

  /** Celda ancla de una fusión (`ColSpan`/`RowSpan` > 1) en el layout. */
  const mergedCellAt = (ref: { row: number; col: number }) =>
    layout?.cells.find(
      (cell) =>
        cell.row === ref.row && cell.col === ref.col && (cell.colSpan > 1 || cell.rowSpan > 1),
    );

  // "Separar celdas" también con el click derecho directo sobre la celda
  // combinada (aunque no haya selección de celdas): manda la celda del hit.
  const mergedAnchor =
    (cellScope ? mergedCellAt(cellScope) : undefined) ??
    selectedRefs.map(mergedCellAt).find((cell) => cell !== undefined);

  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>Insertar fila o columna</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          <ContextMenuItem onSelect={() => onAddRow(cellScope.id, cellScope.row)}>
            Fila encima
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onAddRow(cellScope.id, cellScope.row + 1)}>
            Fila debajo
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onAddColumn(cellScope.id, cellScope.col)}>
            Columna a la izquierda
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onAddColumn(cellScope.id, cellScope.col + 1)}>
            Columna a la derecha
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      {/* Borrado: con varias celdas se borran sus filas/columnas en lote. */}
      {multipleCells ? (
        <>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDeleteRows(cellScope.id, rowsTouched)}
          >
            {rowsTouched.length > 1
              ? `Eliminar filas ${formatIndexList(rowsTouched)}`
              : `Eliminar fila ${rowsTouched[0]! + 1}`}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDeleteColumns(cellScope.id, colsTouched)}
          >
            {colsTouched.length > 1
              ? `Eliminar columnas ${formatIndexList(colsTouched)}`
              : `Eliminar columna ${colsTouched[0]! + 1}`}
          </ContextMenuItem>
        </>
      ) : (
        <>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDeleteRow(cellScope.id, cellScope.row)}
          >
            Eliminar fila {cellScope.row + 1}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDeleteColumn(cellScope.id, cellScope.col)}
          >
            Eliminar columna {cellScope.col + 1}
          </ContextMenuItem>
        </>
      )}

      {/* Fusión: solo un tramo contiguo de celdas de una misma fila. */}
      {mergeRange ? (
        <ContextMenuItem
          onSelect={() =>
            onMergeCells(cellScope.id, mergeRange.row0, mergeRange.col0, 1, rangeCols(mergeRange))
          }
        >
          Combinar celdas
        </ContextMenuItem>
      ) : null}
      {mergedAnchor ? (
        <ContextMenuItem
          onSelect={() => onUnmergeCells(cellScope.id, mergedAnchor.row, mergedAnchor.col)}
        >
          Separar celdas
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
    </>
  );
}

/** Acciones del item bajo el cursor (portapapeles, duplicar, eliminar…). */
function ItemActionsMenu({
  item,
  hasClipboard,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onEditText,
  onSelectParent,
}: {
  item: ItemDto | undefined;
  hasClipboard: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditText: (id: string) => void;
  onSelectParent: () => void;
}): ReactNode {
  if (!item) {
    return (
      <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
        Pegar
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
    );
  }

  return (
    <>
      <ContextMenuItem onSelect={onCut}>
        Cortar
        <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onCopy}>
        Copiar
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
        Pegar
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onDuplicate}>
        Duplicar
        <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
      </ContextMenuItem>
      {item.kind === 'textbox' ? (
        <ContextMenuItem onSelect={() => onEditText(item.id)}>Editar texto…</ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        Eliminar
        <ContextMenuShortcut>Supr</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onSelectParent}>
        Seleccionar contenedor
        <ContextMenuShortcut>Esc</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}
