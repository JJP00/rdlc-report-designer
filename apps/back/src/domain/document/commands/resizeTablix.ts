import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { readLength, writeLengthTracking } from '../geometry/geometry.js';
import { formatLength, fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { tablixColumns, tablixRows } from './tablixParts.js';

/**
 * Geometría del Tablix: la rejilla (columnas y filas del `TablixBody`) es la que
 * manda — los ficheros de BC ni siquiera declaran `Width/Height` en el Tablix.
 *
 * - `resizeColumn` / `resizeRow`: primitivas (una columna/fila exacta); son las
 *   que usarán los separadores de la rejilla.
 * - `resizeTable`: redimensionar la tabla entera con los tiradores → reparte el
 *   cambio **proporcionalmente** entre sus columnas/filas y mueve el Tablix
 *   (`Top`/`Left`), todo en un comando (un paso de undo).
 */

export type ResizeColumnCommand = Extract<RdlcCommand, { cmd: 'resizeColumn' }>;
export type ResizeRowCommand = Extract<RdlcCommand, { cmd: 'resizeRow' }>;
export type ResizeTableCommand = Extract<RdlcCommand, { cmd: 'resizeTable' }>;

/** Tamaño mínimo de una columna/fila (cm). */
const MIN_CM = 0.05;

/* --------------------- primitivas: columna y fila ------------------------ */

export function applyResizeColumn(
  ctx: CommandContext,
  command: ResizeColumnCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const column = tablixColumns(tablix)[command.column];
  if (!column) {
    return left(
      CommandRejectedError.create(
        `El Tablix '${command.id}' no tiene la columna ${command.column}`,
      ),
    );
  }

  const previous = readLength(column, 'Width') ?? { value: 0, unit: 'cm' };
  const created: RdlcNode[] = [];
  writeLengthTracking(column, 'Width', clampWidth(command.width), created);

  return right({
    inverse: [
      ...created.map((child) => ({ cmd: 'removeNode', node: child }) as const),
      { cmd: 'resizeColumn', id: command.id, column: command.column, width: previous },
    ],
    applied: [{ id: command.id, values: {} }],
    snapshotOut: true,
  });
}

export function applyResizeRow(
  ctx: CommandContext,
  command: ResizeRowCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const row = tablixRows(tablix)[command.row];
  if (!row) {
    return left(
      CommandRejectedError.create(`El Tablix '${command.id}' no tiene la fila ${command.row}`),
    );
  }

  const previous = readLength(row, 'Height') ?? { value: 0, unit: 'cm' };
  const created: RdlcNode[] = [];
  writeLengthTracking(row, 'Height', clampWidth(command.height), created);

  return right({
    inverse: [
      ...created.map((child) => ({ cmd: 'removeNode', node: child }) as const),
      { cmd: 'resizeRow', id: command.id, row: command.row, height: previous },
    ],
    applied: [{ id: command.id, values: {} }],
    snapshotOut: true,
  });
}

/* ------------------ tabla completa (tiradores de la selección) ----------- */

export function applyResizeTable(
  ctx: CommandContext,
  command: ResizeTableCommand,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const columns = tablixColumns(tablix);
  const rows = tablixRows(tablix);
  if (columns.length === 0 && rows.length === 0) {
    return left(CommandRejectedError.create(`El elemento '${command.id}' no es un Tablix`));
  }

  const created: RdlcNode[] = [];
  /** Textos anteriores de los tags que se toquen (para el inverso). */
  const previousTexts: { node: RdlcNode; value: string }[] = [];

  // 1) Posición: `Top`/`Left` solo se tocan si **cambian** (BC omite `Left`
  // cuando es 0; redimensionar por la esquina inferior derecha no debe crear
  // etiquetas nuevas).
  const applyPosition = (tag: 'Top' | 'Left', next: Length): void => {
    const current = tablix.child(tag);
    if (!needsWrite(current ? readLength(tablix, tag) : undefined, next)) return;
    const previousText = current?.text() ?? '';
    writeLengthTracking(tablix, tag, next, created);
    const written = tablix.child(tag);
    if (written) previousTexts.push({ node: written, value: previousText });
  };
  applyPosition('Top', command.top);
  applyPosition('Left', command.left);

  // 2) Reparto proporcional de columnas y filas (la rejilla manda).
  const previousColumns = columns.map((column) => readLength(column, 'Width') ?? ZERO);
  const previousRows = rows.map((row) => readLength(row, 'Height') ?? ZERO);
  const nextColumns = scaleToSum(previousColumns, command.width);
  const nextRows = scaleToSum(previousRows, command.height);

  columns.forEach((column, index) =>
    writeLengthTracking(column, 'Width', nextColumns[index]!, created),
  );
  rows.forEach((row, index) => writeLengthTracking(row, 'Height', nextRows[index]!, created));

  // 3) Si el Tablix declara caja propia, se mantiene en sync (nunca se crea).
  const declaredWidth = tablix.child('Width');
  const declaredHeight = tablix.child('Height');
  const previousWidthText = declaredWidth?.text();
  const previousHeightText = declaredHeight?.text();
  if (declaredWidth) declaredWidth.setText(formatLength(sum(nextColumns)));
  if (declaredHeight) declaredHeight.setText(formatLength(sum(nextRows)));

  return right({
    inverse: [
      // Lo creado se quita al final del todo (va primero: el undo invierte).
      ...created.map((child) => ({ cmd: 'removeNode', node: child }) as const),
      // La caja declarada y la posición vuelven a su **texto exacto**.
      ...(declaredWidth && previousWidthText !== undefined
        ? [{ cmd: 'setNodeText' as const, node: declaredWidth, value: previousWidthText }]
        : []),
      ...(declaredHeight && previousHeightText !== undefined
        ? [{ cmd: 'setNodeText' as const, node: declaredHeight, value: previousHeightText }]
        : []),
      ...previousTexts.map(({ node, value }) => ({
        cmd: 'setNodeText' as const,
        node,
        value,
      })),
      ...previousColumns.map((width, column) => ({
        cmd: 'resizeColumn' as const,
        id: command.id,
        column,
        width,
      })),
      ...previousRows.map((height, row) => ({
        cmd: 'resizeRow' as const,
        id: command.id,
        row,
        height,
      })),
    ],
    applied: [{ id: command.id, values: {} }],
    // La rejilla no viaja en `applied`: el front refresca con la proyección.
    snapshotOut: true,
  });
}

/* ------------------------------- helpers -------------------------------- */

const ZERO: Length = { value: 0, unit: 'cm' };

/** true si hay que escribir el tag (cambia el valor, o no existe y no es 0). */
function needsWrite(current: Length | undefined, next: Length): boolean {
  const nextCm = toCm(next);
  if (!current) return Math.abs(nextCm) > 1e-9;
  return Math.abs(toCm(current) - nextCm) > 1e-9;
}

/**
 * Reparte `target` entre las longitudes actuales en proporción a su tamaño (si
 * todas son 0, a partes iguales). La última absorbe el redondeo para que la suma
 * sea exactamente `target`.
 */
export function scaleToSum(lengths: Length[], target: Length): Length[] {
  if (lengths.length === 0) return [];

  const targetCm = toCm(target);
  const currentCm = lengths.map(toCm);
  const total = currentCm.reduce((acc, value) => acc + value, 0);

  const scaled = lengths.map((_, index) => {
    if (index === lengths.length - 1) return fromCm(0); // se ajusta abajo
    const share = total > 0 ? (currentCm[index]! / total) * targetCm : targetCm / lengths.length;
    return fromCm(Math.max(share, MIN_CM));
  });

  const used = scaled.reduce((acc, length) => acc + toCm(length), 0);
  scaled[scaled.length - 1] = fromCm(Math.max(targetCm - used, MIN_CM));
  return scaled;
}

function clampWidth(length: Length): Length {
  const cm = toCm(length);
  return cm < MIN_CM ? fromCm(MIN_CM) : length;
}

function sum(lengths: Length[]): Length {
  return fromCm(lengths.reduce((acc, length) => acc + toCm(length), 0));
}
