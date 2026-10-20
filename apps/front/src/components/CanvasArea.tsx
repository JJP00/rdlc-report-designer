import type {
  BatchableCommand,
  ItemDto,
  Length,
  NewItemSpec,
  PageMarginsDto,
  ProjectionDto,
  ScopeRef,
  TablixMemberDto,
} from '@rdlc-designer/contracts';
import type { Translator } from '@rdlc-designer/i18n';
import { useT } from '@rdlc-designer/i18n/react';
import { FolderOpen } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';
import { ExpressionDialog } from '@/components/panels/ExpressionDialog';
import { Button } from '@/components/ui/button';
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
import { ensureExpression } from '@/lib/groupProperties';
import type { CanvasHit } from '@/lib/hit';
import { itemKindLabel } from '@/lib/palette';
import { findItem, findSiblings } from '@/lib/projection';
import {
  canMergeSelection,
  formatIndexList,
  hitSelectionCell,
  memberForLeafGroup,
  rangeCols,
  selectionBounds,
  selectionCells,
  selectionCols,
  selectionRows,
  tablixHeaderSlots,
  tablixLayout,
  type SelectedCell,
} from '@/lib/tablix';

const INSERT_KINDS = ['textbox', 'rectangle', 'line', 'image', 'tablix'] as const;

export interface CanvasAreaProps {
  projection: ProjectionDto | null;
  /** Estado vacío: abrir un informe y recientes. */
  onOpenReport: () => void;
  recents: string[];
  onOpenRecent: (path: string) => void;
  zoom: number;
  selectedId: string | null;
  /** Items adicionales de la multiselección (U3). */
  extraSelectedIds: string[];
  /** Celda de Tablix seleccionada (F2 parte 3). */
  selectedCell: SelectedCell | null;
  /** Último hit del click derecho (destino de Insertar/Pegar). */
  menuHit: CanvasHit | null;
  hasClipboard: boolean;
  reveal: { id: string; nonce: number } | null;
  onSelect: (id: string | null, additive?: boolean) => void;
  /** Marco de selección: ids que intersectan la caja. */
  onSelectMany: (ids: string[]) => void;
  onSelectCell: (cell: SelectedCell, extend?: boolean, toggle?: boolean) => void;
  onContextMenuHit: (hit: CanvasHit) => void;
  onZoomChange: (zoom: number) => void;
  /** Publica el zoom de «ajustar al ancho» medido del hueco del lienzo. */
  onFitZoomChange: (zoom: number) => void;
  onMoveTo: (id: string, top: Length, left: Length) => void;
  onMoveMany: (moves: { id: string; top: Length; left: Length }[]) => void;
  /** El drag soltó sobre otro contenedor: reparentar (`moveItem`). */
  onMoveItemToScope: (
    id: string,
    scope: ScopeRef,
    index: number,
    top: Length,
    left: Length,
  ) => void;
  /** Tiradores de la selección: mover + redimensionar en un comando. */
  onResizeItem: (
    id: string,
    box: { top: Length; left: Length; width: Length; height: Length },
  ) => void;
  /** Multiselección: escalar el bloque entero (un `batch`, un solo undo). */
  onResizeMany: (commands: BatchableCommand[]) => void;
  /** Separadores de la rejilla: redimensionar una columna/fila del Tablix. */
  onResizeColumn: (id: string, column: number, width: Length) => void;
  onResizeRow: (id: string, row: number, height: Length) => void;
  /** U10: alto de banda/cuerpo al arrastrar los bordes de la página (cm). */
  onResizeRegion: (region: 'pageHeader' | 'pageFooter' | 'body', cm: number) => void;
  /** U10: ancho de la sección al arrastrar el borde derecho del informe (cm). */
  onResizeSectionWidth: (cm: number) => void;
  /** U10: márgenes al arrastrar los marcadores de la regla. */
  onSetPageMargins: (margins: PageMarginsDto) => void;
  onInsertAt: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  /** Estructura del Tablix desde el menú contextual de una celda. */
  onAddRow: (id: string, row: number) => void;
  /** Fila de relleno fuera del grupo que contiene la fila (`above`/`below`). */
  onAddRowOutside: (id: string, row: number, where: 'above' | 'below') => void;
  /** Fila de relleno dentro del grupo, pegada a la fila (`above`/`below`). */
  onAddRowInside: (id: string, row: number, where: 'above' | 'below') => void;
  /** F2.c: fila de totales pegada al grupo, con los agregados por columna. */
  onAddTotal: (id: string, row: number, where: 'above' | 'below') => void;
  /** Abre «Propiedades del grupo» del grupo que posee la fila. */
  onOpenGroupProperties: (id: string, axis: 'row' | 'column', member: TablixMemberDto) => void;
  /** Envuelve una fila estática en un grupo nuevo (menú contextual). */
  onAddRowGroup: (id: string, row: number, expression: string) => void;
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
  /** Orden de apilado entre los hermanos del contenedor. */
  onBringToFront: () => void;
  onSendToBack: () => void;
}

/** Lienzo + menú contextual (estructura del Tablix, acciones del item e insertar). */
export function CanvasArea(props: CanvasAreaProps): ReactNode {
  const {
    projection,
    onOpenReport,
    recents,
    onOpenRecent,
    zoom,
    selectedId,
    extraSelectedIds,
    selectedCell,
    menuHit,
    hasClipboard,
    reveal,
    onSelect,
    onSelectMany,
    onSelectCell,
    onContextMenuHit,
    onZoomChange,
    onFitZoomChange,
    onMoveTo,
    onMoveMany,
    onMoveItemToScope,
    onResizeItem,
    onResizeMany,
    onResizeColumn,
    onResizeRow,
    onResizeRegion,
    onResizeSectionWidth,
    onSetPageMargins,
    onInsertAt,
    onAddRow,
    onAddRowOutside,
    onAddRowInside,
    onAddTotal,
    onOpenGroupProperties,
    onAddRowGroup,
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
    onBringToFront,
    onSendToBack,
  } = props;
  const t = useT();

  /** Fila a agrupar desde el menú contextual (abre el diálogo de expresión). */
  const [groupRow, setGroupRow] = useState<{ id: string; row: number } | null>(null);

  const cellScope = cellScopeForMenu(menuHit, selectedCell);
  // El item del menú: lo que hay bajo el cursor o, si el click cayó en vacío,
  // lo que está **seleccionado** (así «Eliminar» funciona con un Tablix
  // seleccionado por su borde aunque el click derecho caiga dentro de una celda).
  const menuItem =
    menuHit?.item ?? (selectedId && projection ? findItem(projection, selectedId) : undefined);
  // El orden de apilado solo existe entre hermanos del mismo contenedor.
  const canReorder =
    projection && menuItem ? (findSiblings(projection, menuItem.id)?.length ?? 0) > 1 : false;
  // Una cabecera/esquina ocupada no admite más items (como en RB): sin insertar.
  // Ojo: el hit de un hueco vacío puede devolver el rectángulo contenedor como
  // `item`; lo que manda es el **contenido del hueco** en la proyección.
  const headerOccupied = isHeaderSlotOccupied(projection, menuHit);
  const selection =
    cellScope && selectedCell && selectedCell.id === cellScope.id ? selectedCell : null;
  const menuTablix = cellScope && projection ? findItem(projection, cellScope.id) : undefined;
  const tablix = menuTablix?.kind === 'tablix' ? menuTablix : undefined;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex min-h-0 flex-1 flex-col">
            {projection ? (
              <CanvasPreview
                projection={projection}
                zoom={zoom}
                selectedId={selectedId}
                extraSelectedIds={extraSelectedIds}
                selectedCell={selectedCell}
                onSelect={onSelect}
                onSelectMany={onSelectMany}
                onSelectCell={onSelectCell}
                onMoveTo={onMoveTo}
                onMoveMany={onMoveMany}
                onMoveItemToScope={onMoveItemToScope}
                onZoomChange={onZoomChange}
                onFitZoomChange={onFitZoomChange}
                onContextMenuHit={onContextMenuHit}
                onDropItem={onInsertAt}
                onResizeItem={onResizeItem}
                onResizeMany={onResizeMany}
                onResizeColumn={onResizeColumn}
                onResizeRow={onResizeRow}
                onResizeRegion={onResizeRegion}
                onResizeSectionWidth={onResizeSectionWidth}
                onSetPageMargins={onSetPageMargins}
                onEditText={onEditText}
                reveal={reveal}
              />
            ) : (
              <EmptyCanvas onOpen={onOpenReport} recents={recents} onOpenRecent={onOpenRecent} />
            )}
          </div>
        </ContextMenuTrigger>

        <CanvasMenuContent
          menuHit={menuHit}
          menuItem={menuItem}
          cellScope={cellScope}
          selection={selection}
          tablix={tablix}
          headerOccupied={headerOccupied}
          hasClipboard={hasClipboard}
          canReorder={canReorder}
          onAddRow={onAddRow}
          onAddRowOutside={onAddRowOutside}
          onAddRowInside={onAddRowInside}
          onAddTotal={onAddTotal}
          onOpenGroupProperties={onOpenGroupProperties}
          onGroupRow={(id, row) => setGroupRow({ id, row })}
          onDeleteRow={onDeleteRow}
          onAddColumn={onAddColumn}
          onDeleteColumn={onDeleteColumn}
          onDeleteRows={onDeleteRows}
          onDeleteColumns={onDeleteColumns}
          onMergeCells={onMergeCells}
          onUnmergeCells={onUnmergeCells}
          onCut={onCut}
          onCopy={onCopy}
          onPasteAt={onPasteAt}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onEditText={onEditText}
          onSelectParent={onSelectParent}
          onBringToFront={onBringToFront}
          onSendToBack={onSendToBack}
          onInsertAt={onInsertAt}
        />
      </ContextMenu>

      {/* «Agrupar la fila…»: el mismo diálogo de expresión que el árbol de Estructura. */}
      {groupRow ? (
        <ExpressionDialog
          title={t('toolbar.canvas.groupRowTitle', { row: groupRow.row + 1 })}
          value=""
          onClose={() => setGroupRow(null)}
          onApply={(value) => {
            const expression = ensureExpression(value);
            const request = groupRow;
            setGroupRow(null);
            if (expression !== null) onAddRowGroup(request.id, request.row, expression);
          }}
        />
      ) : null}
    </>
  );
}

type CanvasMenuProps = Pick<
  CanvasAreaProps,
  | 'menuHit'
  | 'hasClipboard'
  | 'onAddRow'
  | 'onAddRowOutside'
  | 'onAddRowInside'
  | 'onAddTotal'
  | 'onOpenGroupProperties'
  | 'onDeleteRow'
  | 'onAddColumn'
  | 'onDeleteColumn'
  | 'onDeleteRows'
  | 'onDeleteColumns'
  | 'onMergeCells'
  | 'onUnmergeCells'
  | 'onPasteAt'
  | 'onCut'
  | 'onCopy'
  | 'onDuplicate'
  | 'onDelete'
  | 'onEditText'
  | 'onSelectParent'
  | 'onBringToFront'
  | 'onSendToBack'
  | 'onInsertAt'
> & {
  menuItem: ItemDto | undefined;
  cellScope: Extract<ScopeRef, { kind: 'tablixCell' }> | null;
  selection: SelectedCell | null;
  tablix: Extract<ItemDto, { kind: 'tablix' }> | undefined;
  headerOccupied: boolean;
  canReorder: boolean;
  onGroupRow: (id: string, row: number) => void;
};

/** Contenido del menú contextual del lienzo (extraído para legibilidad). */
function CanvasMenuContent({
  menuHit,
  menuItem,
  cellScope,
  selection,
  tablix,
  headerOccupied,
  hasClipboard,
  canReorder,
  onAddRow,
  onAddRowOutside,
  onAddRowInside,
  onAddTotal,
  onOpenGroupProperties,
  onGroupRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onDeleteRows,
  onDeleteColumns,
  onMergeCells,
  onUnmergeCells,
  onCut,
  onCopy,
  onPasteAt,
  onDuplicate,
  onDelete,
  onEditText,
  onSelectParent,
  onBringToFront,
  onSendToBack,
  onInsertAt,
}: CanvasMenuProps): ReactNode {
  const t = useT();

  return (
    <ContextMenuContent className="w-60">
      <ContextMenuLabel>{menuLabel(t, menuHit, menuItem, cellScope)}</ContextMenuLabel>
      <ContextMenuSeparator />

      {cellScope ? (
        <TablixMenuItems
          cellScope={cellScope}
          selection={selection}
          tablix={tablix}
          onAddRow={onAddRow}
          onAddRowOutside={onAddRowOutside}
          onAddRowInside={onAddRowInside}
          onAddTotal={onAddTotal}
          onOpenGroupProperties={onOpenGroupProperties}
          onGroupRow={onGroupRow}
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
        item={menuItem}
        hasClipboard={hasClipboard && !headerOccupied}
        onCut={onCut}
        onCopy={onCopy}
        onPaste={() => {
          if (menuHit) onPasteAt(menuHit.scope, menuHit.index);
        }}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onEditText={onEditText}
        onSelectParent={onSelectParent}
        canReorder={canReorder}
        onBringToFront={onBringToFront}
        onSendToBack={onSendToBack}
      />

      {!headerOccupied ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('toolbar.canvas.insert')}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48" collisionPadding={8}>
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
        </>
      ) : null}
    </ContextMenuContent>
  );
}

function menuLabel(
  t: Translator['t'],
  menuHit: CanvasHit | null,
  menuItem: ItemDto | undefined,
  cellScope: { id: string; row: number; col: number } | null,
): ReactNode {
  if (menuItem) return menuItem.id;
  if (cellScope) {
    return t('toolbar.canvas.cellLabel', {
      id: cellScope.id,
      row: cellScope.row + 1,
      col: cellScope.col + 1,
    });
  }
  return t('toolbar.canvas.label');
}

/**
 * Celda del menú contextual: si el click derecho atraviesa una celda que forma
 * parte de la selección (aunque el elemento más interno sea de un tablix
 * anidado), manda esa; si no, la celda del scope del hit.
 */
/** Submenú «Insertar fila o columna» (con dentro/fuera del grupo si aplica). */
function InsertRowColumnMenu({
  cellScope,
  inGroup,
  onAddRow,
  onAddRowOutside,
  onAddRowInside,
  onAddColumn,
}: {
  cellScope: { id: string; row: number; col: number };
  inGroup: boolean;
  onAddRow: (id: string, row: number) => void;
  onAddRowOutside: (id: string, row: number, where: 'above' | 'below') => void;
  onAddRowInside: (id: string, row: number, where: 'above' | 'below') => void;
  onAddColumn: (id: string, column: number) => void;
}): ReactNode {
  const t = useT();

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>{t('toolbar.canvas.insertRowColumn')}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-60" collisionPadding={8}>
        {inGroup ? (
          <>
            <ContextMenuItem onSelect={() => onAddRowInside(cellScope.id, cellScope.row, 'above')}>
              {t('toolbar.canvas.rowInsideAbove')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onAddRowInside(cellScope.id, cellScope.row, 'below')}>
              {t('toolbar.canvas.rowInsideBelow')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAddRowOutside(cellScope.id, cellScope.row, 'above')}>
              {t('toolbar.canvas.rowOutsideAbove')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onAddRowOutside(cellScope.id, cellScope.row, 'below')}>
              {t('toolbar.canvas.rowOutsideBelow')}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => onAddRow(cellScope.id, cellScope.row)}>
              {t('toolbar.canvas.rowAbove')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onAddRow(cellScope.id, cellScope.row + 1)}>
              {t('toolbar.canvas.rowBelow')}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => onAddColumn(cellScope.id, cellScope.col)}>
          {t('toolbar.canvas.columnLeft')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAddColumn(cellScope.id, cellScope.col + 1)}>
          {t('toolbar.canvas.columnRight')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** true si el hit cae en una celda de cabecera/esquina **con contenido**. */
function isHeaderSlotOccupied(projection: ProjectionDto | null, hit: CanvasHit | null): boolean {
  if (!projection || !hit) return false;
  const { scope } = hit;
  if (scope.kind !== 'tablixHeader' && scope.kind !== 'tablixCorner') return false;

  const tablix = findItem(projection, scope.id);
  if (tablix?.kind !== 'tablix') return false;
  const slots = tablixHeaderSlots(tablix);

  const slot =
    scope.kind === 'tablixHeader'
      ? slots.headers.find(
          (entry) =>
            entry.axis === scope.axis &&
            entry.path.length === scope.path.length &&
            entry.path.every((value, index) => value === scope.path[index]),
        )
      : slots.corners.find((entry) => entry.row === scope.row && entry.col === scope.col);
  return slot?.content !== null && slot?.content !== undefined;
}

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

/** Último tramo de una ruta (Windows o POSIX). */
function fileName(path: string): string {
  return path.split('/').pop() || path;
}

function EmptyCanvas({
  onOpen,
  recents,
  onOpenRecent,
}: {
  onOpen: () => void;
  recents: string[];
  onOpenRecent: (path: string) => void;
}): ReactNode {
  const t = useT();

  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground">
      <p className="text-base font-medium text-foreground">{t('toolbar.empty.title')}</p>
      <p>{t('toolbar.empty.description')}</p>
      <Button onClick={onOpen}>
        <FolderOpen data-icon="inline-start" />
        {t('toolbar.empty.open')}
      </Button>
      <p className="text-xs">{t('toolbar.empty.shortcuts')}</p>
      {recents.length > 0 ? (
        <div className="mt-2 flex w-full flex-col items-stretch gap-1 text-left">
          <span className="text-xs font-medium">{t('toolbar.file.recent')}</span>
          {recents.slice(0, 5).map((path) => (
            <Button
              key={path}
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              title={path}
              onClick={() => onOpenRecent(path)}
            >
              <span className="truncate">{fileName(path)}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Acciones de estructura del Tablix: insertar, borrar (rango) y fusionar. */
function TablixMenuItems({
  cellScope,
  selection,
  tablix,
  onAddRow,
  onAddRowOutside,
  onAddRowInside,
  onAddTotal,
  onOpenGroupProperties,
  onGroupRow,
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
  onAddRowOutside: (id: string, row: number, where: 'above' | 'below') => void;
  onAddRowInside: (id: string, row: number, where: 'above' | 'below') => void;
  /** F2.c: fila de totales pegada al grupo, con los agregados por columna. */
  onAddTotal: (id: string, row: number, where: 'above' | 'below') => void;
  onOpenGroupProperties: (id: string, axis: 'row' | 'column', member: TablixMemberDto) => void;
  /** Fila estática: abrir «Agrupar la fila…» (grupo nuevo). */
  onGroupRow: (id: string, row: number) => void;
  onDeleteRow: (id: string, row: number) => void;
  onAddColumn: (id: string, column: number) => void;
  onDeleteColumn: (id: string, column: number) => void;
  onDeleteRows: (id: string, rows: number[]) => void;
  onDeleteColumns: (id: string, columns: number[]) => void;
  onMergeCells: (id: string, row: number, col: number, rowSpan: number, colSpan: number) => void;
  onUnmergeCells: (id: string, row: number, col: number) => void;
}): ReactNode {
  const t = useT();
  const layout = tablix ? tablixLayout(tablix) : undefined;
  const selectedRefs = selection ? selectionCells(selection) : [];
  const rowsTouched = selection ? selectionRows(selection) : [];
  const colsTouched = selection ? selectionCols(selection) : [];
  // Tramo a fusionar (una fila, celdas contiguas), contando las sueltas de Ctrl.
  const mergeRange =
    selection && canMergeSelection(selection) ? selectionBounds(selection) : undefined;
  // Grupo que posee la fila (incluye grupos hoja) para «dentro/fuera del
  // grupo» y «Propiedades del grupo».
  const group = tablix ? memberForLeafGroup(tablix, 'row', cellScope.row) : undefined;

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
      <InsertRowColumnMenu
        cellScope={cellScope}
        inGroup={group !== undefined}
        onAddRow={onAddRow}
        onAddRowOutside={onAddRowOutside}
        onAddRowInside={onAddRowInside}
        onAddColumn={onAddColumn}
      />

      {group ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('toolbar.canvas.groupTotal')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52" collisionPadding={8}>
            <ContextMenuItem onSelect={() => onAddTotal(cellScope.id, cellScope.row, 'above')}>
              {t('toolbar.canvas.totalAbove')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onAddTotal(cellScope.id, cellScope.row, 'below')}>
              {t('toolbar.canvas.totalBelow')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}

      {group ? (
        <ContextMenuItem onSelect={() => onOpenGroupProperties(cellScope.id, 'row', group)}>
          {t('toolbar.canvas.groupProperties')}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onSelect={() => onGroupRow(cellScope.id, cellScope.row)}>
          {t('toolbar.canvas.groupRow', { row: cellScope.row + 1 })}
        </ContextMenuItem>
      )}

      {/* Borrado: con varias celdas se borran sus filas/columnas en lote. */}
      <DeleteRowsColumnsMenu
        cellScope={cellScope}
        rowsTouched={rowsTouched}
        colsTouched={colsTouched}
        onDeleteRow={onDeleteRow}
        onDeleteColumn={onDeleteColumn}
        onDeleteRows={onDeleteRows}
        onDeleteColumns={onDeleteColumns}
      />

      <MergeCellsMenu
        cellScope={cellScope}
        mergeRange={mergeRange}
        mergeColumns={mergeRange ? rangeCols(mergeRange) : 0}
        mergedAnchor={mergedAnchor}
        onMergeCells={onMergeCells}
        onUnmergeCells={onUnmergeCells}
      />
      <ContextMenuSeparator />
    </>
  );
}

/** Borrado de la fila/columna de la celda, o en lote de las celdas elegidas. */
function DeleteRowsColumnsMenu({
  cellScope,
  rowsTouched,
  colsTouched,
  onDeleteRow,
  onDeleteColumn,
  onDeleteRows,
  onDeleteColumns,
}: {
  cellScope: { id: string; row: number; col: number };
  rowsTouched: number[];
  colsTouched: number[];
  onDeleteRow: (id: string, row: number) => void;
  onDeleteColumn: (id: string, column: number) => void;
  onDeleteRows: (id: string, rows: number[]) => void;
  onDeleteColumns: (id: string, columns: number[]) => void;
}): ReactNode {
  const t = useT();
  const multiple = rowsTouched.length > 1 || colsTouched.length > 1;
  if (multiple) {
    return (
      <>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDeleteRows(cellScope.id, rowsTouched)}
        >
          {rowsTouched.length > 1
            ? t('toolbar.canvas.deleteRows', { rows: formatIndexList(rowsTouched) })
            : t('toolbar.canvas.deleteRow', { row: rowsTouched[0]! + 1 })}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDeleteColumns(cellScope.id, colsTouched)}
        >
          {colsTouched.length > 1
            ? t('toolbar.canvas.deleteColumns', { columns: formatIndexList(colsTouched) })
            : t('toolbar.canvas.deleteColumn', { column: colsTouched[0]! + 1 })}
        </ContextMenuItem>
      </>
    );
  }
  return (
    <>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onDeleteRow(cellScope.id, cellScope.row)}
      >
        {t('toolbar.canvas.deleteRow', { row: cellScope.row + 1 })}
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onDeleteColumn(cellScope.id, cellScope.col)}
      >
        {t('toolbar.canvas.deleteColumn', { column: cellScope.col + 1 })}
      </ContextMenuItem>
    </>
  );
}

/** Fusión: combinar un tramo contiguo de una fila o separar la celda del hit. */
function MergeCellsMenu({
  cellScope,
  mergeRange,
  mergeColumns,
  mergedAnchor,
  onMergeCells,
  onUnmergeCells,
}: {
  cellScope: { id: string; row: number; col: number };
  mergeRange: { row0: number; col0: number } | undefined;
  mergeColumns: number;
  mergedAnchor: { row: number; col: number } | undefined;
  onMergeCells: (id: string, row: number, col: number, rowSpan: number, colSpan: number) => void;
  onUnmergeCells: (id: string, row: number, col: number) => void;
}): ReactNode {
  const t = useT();

  return (
    <>
      {mergeRange ? (
        <ContextMenuItem
          onSelect={() =>
            onMergeCells(cellScope.id, mergeRange.row0, mergeRange.col0, 1, mergeColumns)
          }
        >
          {t('toolbar.canvas.mergeCells')}
        </ContextMenuItem>
      ) : null}
      {mergedAnchor ? (
        <ContextMenuItem
          onSelect={() => onUnmergeCells(cellScope.id, mergedAnchor.row, mergedAnchor.col)}
        >
          {t('toolbar.canvas.splitCells')}
        </ContextMenuItem>
      ) : null}
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
  canReorder,
  onBringToFront,
  onSendToBack,
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
  canReorder: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
}): ReactNode {
  const t = useT();

  if (!item) {
    return (
      <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
        {t('toolbar.canvas.paste')}
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
    );
  }

  return (
    <>
      <ContextMenuItem onSelect={onCut}>
        {t('toolbar.canvas.cut')}
        <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onCopy}>
        {t('toolbar.canvas.copy')}
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
        {t('toolbar.canvas.paste')}
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={onDuplicate}>
        {t('toolbar.edit.duplicate')}
        <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
      </ContextMenuItem>
      {item.kind === 'textbox' ? (
        <ContextMenuItem onSelect={() => onEditText(item.id)}>
          {t('toolbar.canvas.editText')}
        </ContextMenuItem>
      ) : null}
      {canReorder ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('toolbar.canvas.order')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56" collisionPadding={8}>
            <ContextMenuItem onSelect={onBringToFront}>
              <span className="truncate">{t('toolbar.canvas.bringToFront')}</span>
              <ContextMenuShortcut>Ctrl+Shift+]</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onSendToBack}>
              <span className="truncate">{t('toolbar.canvas.sendToBack')}</span>
              <ContextMenuShortcut>Ctrl+Shift+[</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        {t('toolbar.edit.delete')}
        <ContextMenuShortcut>{t('common.shortcuts.delete')}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onSelectParent}>
        {t('toolbar.canvas.selectContainer')}
        <ContextMenuShortcut>Esc</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}
