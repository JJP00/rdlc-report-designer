import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { formatLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import {
  inverseCommands,
  type CommandContext,
  type CommandOutcome,
  type DomainCommand,
} from './CommandContext.js';
import { nextItemName } from './insertItem.js';
import {
  detach,
  insertAfterTags,
  restore,
  setNodeTextChange,
  type Detached,
  type TextChange,
} from './nodeChanges.js';
import {
  leafAt,
  leafInsertionPoint,
  memberChainAt,
  memberLeafRange,
  positionedCells,
  tablixColumns,
  tablixRows,
  type PositionedCell,
} from './tablixParts.js';

/**
 * Estructura del Tablix (F2 parte 3): añadir/quitar filas y columnas.
 *
 * Reglas:
 * - La rejilla manda: cada fila del `TablixBody` es una hoja de
 *   `TablixRowHierarchy` (y cada columna de `TablixColumnHierarchy`); los
 *   comandos insertan/eliminan **ambos** a la vez.
 * - Las celdas fusionadas se respetan: insertar en medio de un `RowSpan`/
 *   `ColSpan` lo alarga y la fila/columna nueva nace sin celda en las
 *   posiciones cubiertas; al eliminar, los spans que pasan por encima se
 *   acortan. Si la operación dejaría filas huérfanas (una celda con `RowSpan`
 *   que se elimina) o la rejilla sin filas/columnas, se rechaza con un motivo.
 * - Las celdas nuevas nacen con un **Textbox vacío** dentro (como Report
 *   Builder y como al separar celdas): listas para escribir y seleccionables,
 *   sin celdas muertas. Sin `Width/Height`: el tamaño lo pone la celda.
 * - El inverso usa `setNodeText` (texto exacto anterior de cada span) y
 *   `restoreNode`/`removeNode`: el undo vuelve al XML byte a byte.
 * - La **fusión** solo combina celdas contiguas de una misma fila (un tramo
 *   horizontal): los bloques verticales se rechazan para no descartar el
 *   contenido de celdas de otras filas. Las fusiones verticales que ya vengan
 *   en el fichero se respetan y se pueden separar con `unmergeCells`.
 */

export type AddRowCommand = Extract<RdlcCommand, { cmd: 'addRow' }>;
export type DeleteRowCommand = Extract<RdlcCommand, { cmd: 'deleteRow' }>;
export type AddColumnCommand = Extract<RdlcCommand, { cmd: 'addColumn' }>;
export type DeleteColumnCommand = Extract<RdlcCommand, { cmd: 'deleteColumn' }>;
export type DeleteRowsCommand = Extract<RdlcCommand, { cmd: 'deleteRows' }>;
export type DeleteColumnsCommand = Extract<RdlcCommand, { cmd: 'deleteColumns' }>;
export type MergeCellsCommand = Extract<RdlcCommand, { cmd: 'mergeCells' }>;
export type UnmergeCellsCommand = Extract<RdlcCommand, { cmd: 'unmergeCells' }>;

const DEFAULT_ROW_HEIGHT: Length = { value: 0.5, unit: 'cm' };
const DEFAULT_COLUMN_WIDTH: Length = { value: 2, unit: 'cm' };

/* ------------------------------- addRow --------------------------------- */

export type AddRowOutsideGroupCommand = Extract<RdlcCommand, { cmd: 'addRowOutsideGroup' }>;
export type AddRowInsideGroupCommand = Extract<RdlcCommand, { cmd: 'addRowInsideGroup' }>;

/** Plan de inserción de fila: dónde va en el body y dónde su miembro. */
interface RowInsertPlan {
  /** Índice del body donde nace la fila. */
  row: number;
  /** Contenedor e índice del `TablixMember` nuevo. */
  member: { container: RdlcNode; index: number };
}

export type AddTotalRowCommand = Extract<RdlcCommand, { cmd: 'addTotalRow' }>;

export function applyAddRow(
  ctx: CommandContext,
  command: AddRowCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows, members } = parts.value;

  if (command.row > rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  // Miembro estático en la posición de hoja equivalente (dentro del grupo).
  return performAddRow(
    ctx,
    parts.value,
    {
      row: command.row,
      member: leafInsertionPoint(members, command.row),
    },
    command.height,
  );
}

/**
 * Fila **fuera del grupo** que contiene la fila `row`: se apoya en el grupo más
 * interno de su cadena (si el propio miembro es un grupo hoja, ese mismo) y el
 * nuevo miembro se inserta en el contenedor del padre, antes o después del
 * grupo; la fila del body nace pegada a su borde.
 */
export function applyAddRowOutsideGroup(
  ctx: CommandContext,
  command: AddRowOutsideGroupCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows, hierarchy } = parts.value;

  if (command.row >= rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const chain = memberChainAt(hierarchy, command.row);
  if (!chain || chain.length === 0) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la fila ${command.row}`,
      ),
    );
  }

  // El grupo más interno de la cadena (el propio miembro puede ser grupo hoja).
  const group = [...chain].reverse().find((ref) => ref.member.child('Group'));
  if (!group) {
    return left(CommandRejectedError.create('La fila no está dentro de un grupo'));
  }

  const range = memberLeafRange(hierarchy, group.member);
  if (!range) {
    return left(CommandRejectedError.create('No se pudo localizar el rango de hojas del grupo'));
  }

  const above = command.where === 'above';
  return performAddRow(
    ctx,
    parts.value,
    {
      // La fila nace pegada al borde del grupo (encima o debajo de sus hojas).
      row: above ? range.start : range.end + 1,
      member: { container: group.container, index: above ? group.index : group.index + 1 },
    },
    command.height,
  );
}

/**
 * Fila **dentro del grupo** que contiene la fila `row`, pegada a ella. Si el
 * grupo es hoja (su fila ES el grupo), se convierte en contenedor con la fila
 * original como primer miembro; el body no cambia de orden.
 */
export function applyAddRowInsideGroup(
  ctx: CommandContext,
  command: AddRowInsideGroupCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows, hierarchy } = parts.value;

  if (command.row >= rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const chain = memberChainAt(hierarchy, command.row);
  if (!chain || chain.length === 0) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la fila ${command.row}`,
      ),
    );
  }

  const leaf = chain[chain.length - 1]!;
  const group = [...chain].reverse().find((ref) => ref.member.child('Group'));
  if (!group) {
    return left(CommandRejectedError.create('La fila no está dentro de un grupo'));
  }

  const above = command.where === 'above';
  const created: RdlcNode[] = [];
  let member: RowInsertPlan['member'];

  if (group.member.equals(leaf.member)) {
    // Grupo hoja: la fila original pasa a ser su primer miembro (mismo body).
    const members = group.member.createElement('TablixMembers');
    members.appendChild(members.createElement('TablixMember'));
    insertAfterTags(group.member, members, ['Group', 'SortExpressions', 'TablixHeader']);
    created.push(members);
    member = { container: members, index: above ? 0 : 1 };
  } else {
    member = {
      container: leaf.container,
      index: above ? leaf.index : leaf.index + 1,
    };
  }

  const outcome = performAddRow(
    ctx,
    parts.value,
    { row: above ? command.row : command.row + 1, member },
    command.height,
  );
  if (outcome.isLeft()) return outcome;

  // El inverso quita también el contenedor creado al convertir el grupo hoja.
  return right({
    inverse: [
      ...inverseCommands(outcome.value),
      ...created.map((node) => ({ cmd: 'removeNode', node }) as const),
    ],
    snapshotOut: true,
  });
}

/* ------------------------------ addTotalRow ------------------------------ */

/**
 * F2.c · fila de **totales del grupo**: inserta una fila estática pegada al
 * grupo que contiene `row` (como `addRowOutsideGroup`) y precarga cada celda con
 * el agregado de su columna, con el ámbito del grupo. La heurística es
 * documental (el corpus de BC no declara tipos de campo): si el campo del
 * detalle aparece en algún `Sum(` del informe, el total es `=Sum(...)`; si no,
 * `=First(...)` (total de un campo no aditivo). Las columnas cuya expresión de
 * detalle referencia varios campos quedan vacías.
 */
export function applyAddTotalRow(
  ctx: CommandContext,
  command: AddTotalRowCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows, hierarchy, columns } = parts.value;

  if (command.row >= rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const chain = memberChainAt(hierarchy, command.row);
  if (!chain || chain.length === 0) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la fila ${command.row}`,
      ),
    );
  }

  const group = [...chain].reverse().find((ref) => ref.member.child('Group'));
  if (!group) {
    return left(CommandRejectedError.create('La fila no está dentro de un grupo'));
  }

  const range = memberLeafRange(hierarchy, group.member);
  if (!range) {
    return left(CommandRejectedError.create('No se pudo localizar el rango de hojas del grupo'));
  }

  const textFor = totalExpressions(ctx.root, rows, columns.length, range, group.member);

  const above = command.where === 'above';
  return performAddRow(
    ctx,
    parts.value,
    {
      row: above ? range.start : range.end + 1,
      member: { container: group.container, index: above ? group.index : group.index + 1 },
    },
    command.height,
    textFor,
  );
}

/** Agregado de cada columna para la fila de totales (o vacío). */
function totalExpressions(
  root: RdlcNode,
  rows: RdlcNode[],
  columnCount: number,
  range: { start: number; end: number },
  groupMember: RdlcNode,
): (column: number) => string | undefined {
  const name = groupMember.child('Group')?.attribute('Name');
  const scope = name ? `, "${name}"` : '';
  const summed = collectSummedFields(root);
  const byColumn: (string | undefined)[] = [];

  for (let column = 0; column < columnCount; column += 1) {
    const field = detailFieldAt(rows, range, column);
    if (field === undefined) {
      byColumn.push(undefined);
      continue;
    }
    const aggregate = summed.has(field) ? 'Sum' : 'First';
    byColumn.push(`=${aggregate}(Fields!${field}.Value${scope})`);
  }

  return (column) => byColumn[column];
}

/**
 * Campo del detalle de una columna: la **última** fila del grupo cuya celda
 * declara una expresión con **un único campo** referenciado — vale
 * `=Fields!X.Value`, `=Sum(Fields!X.Value)` o `=Format(Fields!X.Value)`. Las
 * filas de resumen con `ColSpan` suelen estar encima del detalle y no mandan, y
 * las expresiones con varios campos (totales compuestos) se ignoran.
 */
function detailFieldAt(
  rows: RdlcNode[],
  range: { start: number; end: number },
  column: number,
): string | undefined {
  for (let index = range.end; index >= range.start; index -= 1) {
    const row = rows[index];
    if (!row) continue;
    const entry = positionedCells(row).find(
      (cell) => column >= cell.col && column < cell.col + cell.colSpan,
    );
    if (!entry) continue;
    const content = entry.cell
      .child('CellContents')
      ?.children()
      .find((child) => child.tagName !== 'ColSpan' && child.tagName !== 'RowSpan');
    const value = content
      ?.child('Paragraphs')
      ?.child('Paragraph')
      ?.child('TextRuns')
      ?.child('TextRun')
      ?.child('Value')
      ?.text();
    const field = value ? uniqueFieldReference(value) : undefined;
    if (field) return field;
  }
  return undefined;
}

/** Campo único referenciado por una expresión (`undefined` si hay 0 o varios). */
function uniqueFieldReference(expression: string): string | undefined {
  if (!expression.startsWith('=')) return undefined;
  const refs = [...expression.matchAll(/Fields!([A-Za-z_]\w*)\.Value/g)].map((match) => match[1]!);
  if (refs.length === 0) return undefined;
  return new Set(refs).size === 1 ? refs[0] : undefined;
}

/** Campos que el informe ya agrega con `Sum(` en algún `<Value>`. */
function collectSummedFields(root: RdlcNode): Set<string> {
  const fields = new Set<string>();
  const walk = (node: RdlcNode): void => {
    if (node.tagName === 'Value') {
      const text = node.text() ?? '';
      if (/\bSum\s*\(/.test(text)) {
        for (const match of text.matchAll(/Fields!([A-Za-z_]\w*)\.Value/g)) {
          fields.add(match[1]!);
        }
      }
    }
    for (const child of node.children()) walk(child);
  };
  walk(root);
  return fields;
}

/** Crea la fila (con sus celdas) y el miembro, y devuelve el inverso común. */
function performAddRow(
  ctx: CommandContext,
  parts: TablixParts,
  plan: RowInsertPlan,
  height: Length | undefined,
  /** Expresión de la celda de cada columna (filas de totales): vacío si `undefined`. */
  textFor?: (column: number) => string | undefined,
): Either<DomainError, CommandOutcome> {
  const { body, rowsContainer, columns, rows } = parts;

  const changes: TextChange[] = [];
  const covered = coverByRowSpan(rows, plan.row, columns.length, changes);
  if (covered.every(Boolean)) {
    return left(
      CommandRejectedError.create(
        'Todas las columnas de esa posición están cubiertas por celdas fusionadas',
      ),
    );
  }

  // Fila nueva (vacía) con una celda por columna descubierta.
  const created: RdlcNode[] = [];
  const row = body.createElement('TablixRow');
  row.appendChild(
    row.createElement(
      'Height',
      height ? formatLength(height) : neighborText(rows, plan.row, 'Height', DEFAULT_ROW_HEIGHT),
    ),
  );
  const cells = row.createElement('TablixCells');
  const takenNames = new Set<string>();
  for (let column = 0; column < columns.length; column += 1) {
    if (!covered[column])
      cells.appendChild(createCellWithTextbox(ctx, row, takenNames, textFor?.(column)));
  }
  row.appendChild(cells);
  rowsContainer.insertChildAt(row, plan.row);
  created.push(row);

  const member = plan.member.container.createElement('TablixMember');
  plan.member.container.insertChildAt(member, plan.member.index);
  created.push(member);

  return right({
    inverse: [
      ...changes.map(setNodeTextChange),
      ...created.map((node) => ({ cmd: 'removeNode', node }) as const),
    ],
    snapshotOut: true,
  });
}

/* ------------------------------ deleteRow -------------------------------- */

export function applyDeleteRow(
  ctx: CommandContext,
  command: DeleteRowCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { hierarchy, rows } = parts.value;

  if (rows.length <= 1) {
    return left(CommandRejectedError.create('No se puede dejar el Tablix sin filas'));
  }
  if (command.row >= rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const row = rows[command.row]!;
  for (const entry of positionedCells(row)) {
    if (entry.rowSpan > 1) {
      return left(
        CommandRejectedError.create(
          'La fila contiene celdas fusionadas verticalmente: quita la fusión antes de borrarla',
        ),
      );
    }
  }

  const leaf = leafAt(hierarchy, command.row);
  if (!leaf) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la fila ${command.row}`,
      ),
    );
  }

  const changes: TextChange[] = [];
  for (let index = 0; index < command.row; index += 1) {
    for (const entry of positionedCells(rows[index]!)) {
      if (entry.rowSpan <= 1 || index + entry.rowSpan <= command.row) continue;
      writeSpan(entry.cell, 'RowSpan', entry.rowSpan - 1, changes);
    }
  }

  const rowRestore = detach(row);
  const memberRestore = detach(leaf.member);
  const containerRestore = removeEmptyContainer(leaf.container);

  return right({
    inverse: [
      ...changes.map(setNodeTextChange),
      restore(rowRestore, row),
      restore(memberRestore, leaf.member),
      ...(containerRestore ? [restore(containerRestore, leaf.container)] : []),
    ],
    snapshotOut: true,
  });
}

/* ------------------------------ addColumn -------------------------------- */

export function applyAddColumn(
  ctx: CommandContext,
  command: AddColumnCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { body, columns, columnsContainer, rows, columnMembers } = parts.value;

  if (command.column > columns.length) {
    return left(
      CommandRejectedError.create(
        `La columna ${command.column} está fuera del Tablix '${command.id}'`,
      ),
    );
  }

  const changes: TextChange[] = [];
  // Los `ColSpan` que contienen la columna nueva crecen.
  for (const row of rows) {
    for (const entry of positionedCells(row)) {
      if (entry.colSpan <= 1) continue;
      if (entry.col < command.column && command.column < entry.col + entry.colSpan) {
        writeSpan(entry.cell, 'ColSpan', entry.colSpan + 1, changes);
      }
    }
  }

  const created: RdlcNode[] = [];

  // Una celda (con su textbox) por fila donde la columna nueva no quede
  // cubierta por un `ColSpan` de la propia fila (que crece) ni por un `RowSpan`
  // de una fila anterior (que la incluye).
  const takenNames = new Set<string>();
  rows.forEach((row, rowIndex) => {
    const inSpan = positionedCells(row).some(
      (entry) =>
        entry.colSpan > 1 &&
        entry.col < command.column &&
        command.column < entry.col + entry.colSpan,
    );
    if (inSpan || coveredAtColumn(rows, rowIndex, command.column)) return;
    const cells = row.child('TablixCells');
    if (!cells) return;
    const position = insertCellPosition(row, command.column);
    const cell = createCellWithTextbox(ctx, cells, takenNames);
    cells.insertChildAt(cell, position);
    created.push(cell);
  });

  // Columna nueva en la rejilla y su hoja en la jerarquía de columnas.
  const column = body.createElement('TablixColumn');
  column.appendChild(
    column.createElement(
      'Width',
      command.width
        ? formatLength(command.width)
        : neighborText(columns, command.column, 'Width', DEFAULT_COLUMN_WIDTH),
    ),
  );
  columnsContainer.insertChildAt(column, command.column);
  created.push(column);

  const point = leafInsertionPoint(columnMembers, command.column);
  const member = point.container.createElement('TablixMember');
  point.container.insertChildAt(member, point.index);
  created.push(member);

  return right({
    inverse: [
      ...changes.map(setNodeTextChange),
      ...created.map((node) => ({ cmd: 'removeNode', node }) as const),
    ],
    snapshotOut: true,
  });
}

/* ----------------------------- deleteColumn ------------------------------ */

export function applyDeleteColumn(
  ctx: CommandContext,
  command: DeleteColumnCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { columns, rows, columnHierarchy } = parts.value;

  if (columns.length <= 1) {
    return left(CommandRejectedError.create('No se puede dejar el Tablix sin columnas'));
  }
  if (command.column >= columns.length) {
    return left(
      CommandRejectedError.create(
        `La columna ${command.column} está fuera del Tablix '${command.id}'`,
      ),
    );
  }

  const leaf = leafAt(columnHierarchy, command.column);
  if (!leaf) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la columna ${command.column}`,
      ),
    );
  }

  const changes: TextChange[] = [];
  const removedCells: { node: RdlcNode; restore: Detached }[] = [];
  for (const row of rows) {
    const entry = cellCovering(row, command.column);
    if (!entry) {
      return left(
        CommandRejectedError.create(
          `La rejilla del Tablix '${command.id}' no cubre la columna ${command.column}`,
        ),
      );
    }

    if (entry.colSpan === 1) {
      if (entry.rowSpan > 1) {
        return left(
          CommandRejectedError.create(
            'La columna contiene celdas fusionadas verticalmente: quita la fusión antes de borrarla',
          ),
        );
      }
      removedCells.push({ node: entry.cell, restore: detach(entry.cell) });
    } else {
      writeSpan(entry.cell, 'ColSpan', entry.colSpan - 1, changes);
    }
  }

  const column = columns[command.column]!;
  const columnRestore = detach(column);
  const memberRestore = detach(leaf.member);
  const containerRestore = removeEmptyContainer(leaf.container);

  return right({
    inverse: [
      ...changes.map(setNodeTextChange),
      ...removedCells.map(({ node, restore: position }) => restore(position, node)),
      restore(columnRestore, column),
      restore(memberRestore, leaf.member),
      ...(containerRestore ? [restore(containerRestore, leaf.container)] : []),
    ],
    snapshotOut: true,
  });
}

/* ------------------------- borrado en lote ------------------------------- */

/** Varias filas en un solo comando (un paso de undo), de abajo hacia arriba. */
export function applyDeleteRows(
  ctx: CommandContext,
  command: DeleteRowsCommand,
): Either<DomainError, CommandOutcome> {
  return deleteMany(
    ctx,
    [...command.rows].sort((a, b) => b - a),
    (context, row) => applyDeleteRow(context, { cmd: 'deleteRow', id: command.id, row }),
  );
}

/** Varias columnas en un solo comando (un paso de undo), de derecha a izquierda. */
export function applyDeleteColumns(
  ctx: CommandContext,
  command: DeleteColumnsCommand,
): Either<DomainError, CommandOutcome> {
  return deleteMany(
    ctx,
    [...command.columns].sort((a, b) => b - a),
    (context, column) =>
      applyDeleteColumn(context, { cmd: 'deleteColumn', id: command.id, column }),
  );
}

function deleteMany(
  ctx: CommandContext,
  indexes: number[],
  apply: (ctx: CommandContext, index: number) => Either<DomainError, CommandOutcome>,
): Either<DomainError, CommandOutcome> {
  const inverse: DomainCommand[] = [];
  for (const index of indexes) {
    const result = apply(ctx, index);
    if (result.isLeft()) return left(result.value);
    inverse.push(...inverseCommands(result.value));
  }
  return right({ inverse, snapshotOut: true });
}

/* --------------------------- combinar celdas ----------------------------- */

export function applyMergeCells(
  ctx: CommandContext,
  command: MergeCellsCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows, columns } = parts.value;

  const { rowSpan, colSpan } = command;
  // Solo tramos horizontales: una fusión que se come celdas de otras filas
  // descarta su contenido (las celdas cubiertas se eliminan) y no se admite.
  if (rowSpan > 1) {
    return left(
      CommandRejectedError.create('Solo se pueden combinar celdas contiguas de la misma fila'),
    );
  }
  if (colSpan <= 1) {
    return left(CommandRejectedError.create('No hay nada que combinar en una sola celda'));
  }

  const row1 = command.row + rowSpan;
  const col1 = command.col + colSpan;
  if (row1 > rows.length || col1 > columns.length) {
    return left(
      CommandRejectedError.create(`El bloque a combinar sale del Tablix '${command.id}'`),
    );
  }

  const anchor = positionedCells(rows[command.row]!).find((entry) => entry.col === command.col);
  if (!anchor) {
    return left(
      CommandRejectedError.create(
        `No hay celda en (${command.row}, ${command.col}) del Tablix '${command.id}'`,
      ),
    );
  }

  // La selección debe ser un rectángulo de celdas simples (sin fusiones previas
  // dentro ni celdas que la crucen) para que el resultado sea predecible.
  for (let row = command.row; row < row1; row += 1) {
    for (const entry of positionedCells(rows[row]!)) {
      const inside = entry.col >= command.col && entry.col < col1;
      if (!inside) {
        if (
          entry.col < command.col &&
          row >= command.row &&
          entry.col + entry.colSpan > command.col
        ) {
          return left(CommandRejectedError.create('La selección corta una celda fusionada'));
        }
        continue;
      }
      if (entry.col + entry.colSpan > col1 || row + entry.rowSpan > row1) {
        return left(CommandRejectedError.create('La selección corta una celda fusionada'));
      }
      if (entry !== anchor && (entry.colSpan > 1 || entry.rowSpan > 1)) {
        return left(CommandRejectedError.create('La selección contiene celdas ya fusionadas'));
      }
    }
  }
  for (let row = 0; row < command.row; row += 1) {
    for (const entry of positionedCells(rows[row]!)) {
      const reachesRow = row + entry.rowSpan > command.row;
      const overlapsCols = entry.col + entry.colSpan > command.col && entry.col < col1;
      if (reachesRow && overlapsCols) {
        return left(
          CommandRejectedError.create('La selección cruza una celda fusionada verticalmente'),
        );
      }
    }
  }

  const changes: TextChange[] = [];
  const removed: { node: RdlcNode; restore: Detached }[] = [];
  const created: RdlcNode[] = [];

  // Primero se desconectan las celdas cubiertas (posiciones originales): si se
  // escribiera antes el span del ancla, el `ColSpan` desplazaría sus columnas.
  const covered: RdlcNode[] = [];
  for (let row = command.row; row < row1; row += 1) {
    for (const entry of positionedCells(rows[row]!)) {
      if (row === command.row && entry.cell.equals(anchor.cell)) continue;
      if (entry.col >= command.col && entry.col < col1) covered.push(entry.cell);
    }
  }
  for (const cell of covered) {
    removed.push({ node: cell, restore: detach(cell) });
  }

  writeMergeSpan(anchor.cell, 'ColSpan', colSpan, changes, removed, created);
  writeMergeSpan(anchor.cell, 'RowSpan', rowSpan, changes, removed, created);

  return right({
    inverse: [
      ...changes.map(setNodeTextChange),
      ...removed.map(({ node, restore: position }) => restore(position, node)),
      ...created.map((node) => ({ cmd: 'removeNode', node }) as const),
    ],
    snapshotOut: true,
  });
}

export function applyUnmergeCells(
  ctx: CommandContext,
  command: UnmergeCellsCommand,
): Either<DomainError, CommandOutcome> {
  const parts = tablixParts(ctx, command.id);
  if (parts.isLeft()) return left(parts.value);
  const { rows } = parts.value;

  const row = rows[command.row];
  if (!row) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const entry = positionedCells(row).find((candidate) => candidate.col === command.col);
  if (!entry) {
    return left(
      CommandRejectedError.create(
        `No hay celda en (${command.row}, ${command.col}) del Tablix '${command.id}'`,
      ),
    );
  }
  if (entry.colSpan === 1 && entry.rowSpan === 1) {
    return left(CommandRejectedError.create('La celda no está combinada'));
  }

  const removed: { node: RdlcNode; restore: Detached }[] = [];
  removeSpanNode(entry.cell, 'ColSpan', removed);
  removeSpanNode(entry.cell, 'RowSpan', removed);

  const created: RdlcNode[] = [];
  const takenNames = new Set<string>();
  for (let index = command.row; index < command.row + entry.rowSpan; index += 1) {
    const target = rows[index];
    if (!target) continue;
    const cells = target.child('TablixCells');
    if (!cells) continue;
    for (let column = command.col; column < command.col + entry.colSpan; column += 1) {
      if (index === command.row && column === command.col) continue;
      const position = insertCellPosition(target, column);
      const cell = createCellWithTextbox(ctx, cells, takenNames);
      cells.insertChildAt(cell, position);
      created.push(cell);
    }
  }

  return right({
    inverse: [
      ...removed.map(({ node, restore: position }) => restore(position, node)),
      ...created.map((node) => ({ cmd: 'removeNode', node }) as const),
    ],
    snapshotOut: true,
  });
}

/* ------------------------------- helpers --------------------------------- */

interface TablixParts {
  body: RdlcNode;
  rowsContainer: RdlcNode;
  columnsContainer: RdlcNode;
  columns: RdlcNode[];
  rows: RdlcNode[];
  hierarchy: RdlcNode;
  members: RdlcNode;
  columnHierarchy: RdlcNode;
  columnMembers: RdlcNode;
}

/** Piezas obligatorias del Tablix; si falta alguna, el comando se rechaza. */
function tablixParts(ctx: CommandContext, id: string): Either<DomainError, TablixParts> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${id}'`));

  const body = tablix.child('TablixBody');
  const rowsContainer = body?.child('TablixRows');
  const columnsContainer = body?.child('TablixColumns');
  const hierarchy = tablix.child('TablixRowHierarchy');
  const members = hierarchy?.child('TablixMembers');
  const columnHierarchy = tablix.child('TablixColumnHierarchy');
  const columnMembers = columnHierarchy?.child('TablixMembers');

  if (
    !body ||
    !rowsContainer ||
    !columnsContainer ||
    !columnsContainer.children('TablixColumn').length ||
    !hierarchy ||
    !members ||
    !columnHierarchy ||
    !columnMembers
  ) {
    return left(
      CommandRejectedError.create(
        `El elemento '${id}' no es un Tablix completo (rejilla + jerarquías)`,
      ),
    );
  }

  return right({
    body,
    rowsContainer,
    columnsContainer,
    columns: tablixColumns(tablix),
    rows: tablixRows(tablix),
    hierarchy,
    members,
    columnHierarchy,
    columnMembers,
  });
}

/** Columnas cubiertas por un `RowSpan` que llega a la fila `row` (y los alarga). */
function coverByRowSpan(
  rows: RdlcNode[],
  row: number,
  columnCount: number,
  changes: TextChange[],
): boolean[] {
  const covered = new Array<boolean>(columnCount).fill(false);
  for (let index = 0; index < row; index += 1) {
    for (const entry of positionedCells(rows[index]!)) {
      if (entry.rowSpan <= 1 || index + entry.rowSpan <= row) continue;
      for (let column = entry.col; column < entry.col + entry.colSpan; column += 1) {
        covered[column] = true;
      }
      writeSpan(entry.cell, 'RowSpan', entry.rowSpan + 1, changes);
    }
  }
  return covered;
}

/** true si un `RowSpan` de una fila anterior cubre esa columna en la fila dada. */
function coveredAtColumn(rows: RdlcNode[], row: number, column: number): boolean {
  for (let index = 0; index < row; index += 1) {
    for (const entry of positionedCells(rows[index]!)) {
      if (entry.rowSpan <= 1 || index + entry.rowSpan <= row) continue;
      // La columna nueva queda dentro del `ColSpan` solo si está estrictamente
      // dentro: en los bordes, la celda se corre y no la cubre.
      if (entry.col < column && column < entry.col + entry.colSpan) return true;
    }
  }
  return false;
}

/** Celda que cubre la columna (la que empieza en ella o un `ColSpan` que la pisa). */
function cellCovering(row: RdlcNode, column: number): PositionedCell | undefined {
  return positionedCells(row).find(
    (entry) => entry.col <= column && column < entry.col + entry.colSpan,
  );
}

/** Índice donde insertar la celda de la columna nueva dentro de una fila. */
function insertCellPosition(row: RdlcNode, column: number): number {
  const cells = positionedCells(row);
  const index = cells.findIndex((entry) => entry.col >= column);
  return index === -1 ? cells.length : index;
}

/** Número de columnas de la rejilla (a partir de la primera fila). */
function tablixColumnsOf(rows: RdlcNode[]): number {
  const first = rows[0];
  if (!first) return 0;
  let total = 0;
  for (const entry of positionedCells(first)) total += entry.colSpan;
  return total;
}

function writeSpan(
  cell: RdlcNode,
  tag: 'ColSpan' | 'RowSpan',
  value: number,
  changes: TextChange[],
): void {
  const node = cell.child('CellContents')?.child(tag);
  if (!node) return;
  changes.push({ node, value: node.text() ?? '' });
  node.setText(String(value));
}

/**
 * Span del ancla de una fusión: escribe el tag si hace falta (`>1`), o lo quita
 * cuando la fusión no aplica en ese eje. Todo queda registrado para el undo.
 */
function writeMergeSpan(
  cell: RdlcNode,
  tag: 'ColSpan' | 'RowSpan',
  value: number,
  changes: TextChange[],
  removed: { node: RdlcNode; restore: Detached }[],
  created: RdlcNode[],
): void {
  const contents = cellContents(cell, created);
  const node = contents.child(tag);

  if (value > 1) {
    if (node) {
      changes.push({ node, value: node.text() ?? '' });
      node.setText(String(value));
    } else {
      const span = contents.createElement(tag, String(value));
      contents.appendChild(span);
      created.push(span);
    }
  } else if (node) {
    removed.push({ node, restore: detach(node) });
  }
}

/** `CellContents` de la celda, creándolo si falta (queda en `created` para el undo). */
function cellContents(cell: RdlcNode, created: RdlcNode[]): RdlcNode {
  const existing = cell.child('CellContents');
  if (existing) return existing;
  const contents = cell.createElement('CellContents');
  cell.insertChildAt(contents, 0);
  created.push(contents);
  return contents;
}

function removeSpanNode(
  cell: RdlcNode,
  tag: 'ColSpan' | 'RowSpan',
  removed: { node: RdlcNode; restore: Detached }[],
): void {
  const node = cell.child('CellContents')?.child(tag);
  if (node) removed.push({ node, restore: detach(node) });
}

/**
 * Celda nueva con un Textbox vacío dentro (sin `Top/Left/Width/Height`: el
 * tamaño lo pone la celda, como en BC). Al añadir una fila/columna o al separar
 * una fusión, la celda no queda muerta: nace lista para escribir, como un
 * control insertado en Report Builder.
 */
function createCellWithTextbox(
  ctx: CommandContext,
  parent: RdlcNode,
  taken: Set<string>,
  /** Texto/expresión inicial del textbox (filas de totales). */
  value?: string,
): RdlcNode {
  const cell = parent.createElement('TablixCell');
  const contents = cell.createElement('CellContents');
  const name = nextItemName(ctx, 'textbox', taken);
  taken.add(name);
  contents.appendChild(emptyTextbox(contents, name, value));
  cell.appendChild(contents);
  return cell;
}

/** Textbox vacío con el orden canónico del XSD y sin longitudes. */
function emptyTextbox(parent: RdlcNode, name: string, value?: string): RdlcNode {
  const textbox = parent.createElement('Textbox');
  textbox.setAttribute('Name', name);
  textbox.appendChild(textbox.createElement('CanGrow', 'true'));

  const paragraphs = textbox.createElement('Paragraphs');
  const paragraph = paragraphs.createElement('Paragraph');
  const runs = paragraph.createElement('TextRuns');
  const run = runs.createElement('TextRun');
  run.appendChild(run.createElement('Value', value ?? ''));
  runs.appendChild(run);
  paragraph.appendChild(runs);
  paragraphs.appendChild(paragraph);
  textbox.appendChild(paragraphs);
  return textbox;
}

/** Texto del tag en la fila/columna vecina (mantiene la unidad original). */
function neighborText(nodes: RdlcNode[], index: number, tag: string, fallback: Length): string {
  const neighbor = nodes[index] ?? nodes[index - 1] ?? nodes[0];
  return neighbor?.child(tag)?.text() ?? formatLength(fallback);
}

/**
 * Un `TablixMembers` que se queda sin miembros es inválido: se quita también su
 * contenedor (el grupo se queda sin miembros, permitido por el esquema).
 * Devuelve la posición para restaurarlo, o `undefined` si no se quitó.
 */
function removeEmptyContainer(container: RdlcNode): Detached | undefined {
  if (container.children('TablixMember').length > 0) return undefined;
  // El contenedor raíz de la jerarquía debe existir siempre.
  if (
    container.parent?.tagName === 'TablixRowHierarchy' ||
    container.parent?.tagName === 'TablixColumnHierarchy'
  ) {
    return undefined;
  }
  return detach(container);
}
