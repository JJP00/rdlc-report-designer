import { z } from 'zod';
import { lengthSchema } from './common.js';
import { paragraphSchema } from './projection.js';
import { stylePatchSchema } from './style.js';

/**
 * Catálogo de comandos del MVP (Fase 1).
 *
 * Semántica de commit: los comandos representan ACCIONES COMPLETADAS
 * (mouseup, blur, "Aplicar"), nunca cada frame. Un drag = un comando.
 * Todo comando tiene inverso en el dominio → el journal de undo sale gratis.
 */

/* ----------------------------- Scopes ---------------------------------- */

export const scopeRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('body') }),
  z.object({ kind: z.literal('pageHeader') }),
  z.object({ kind: z.literal('pageFooter') }),
  z.object({ kind: z.literal('rectangle'), id: z.string().min(1) }),
  z.object({
    kind: z.literal('tablixCell'),
    id: z.string().min(1),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
  }),
]);
export type ScopeRef = z.infer<typeof scopeRefSchema>;

/* --------------------------- Nuevos items ------------------------------- */

export const newItemSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('textbox'),
    name: z.string().optional(),
    top: lengthSchema,
    left: lengthSchema,
    width: lengthSchema,
    height: lengthSchema,
    text: z.string().optional(),
    style: stylePatchSchema.optional(),
  }),
  z.object({
    kind: z.literal('rectangle'),
    name: z.string().optional(),
    top: lengthSchema,
    left: lengthSchema,
    width: lengthSchema,
    height: lengthSchema,
    style: stylePatchSchema.optional(),
  }),
  z.object({
    kind: z.literal('line'),
    name: z.string().optional(),
    top: lengthSchema,
    left: lengthSchema,
    width: lengthSchema,
    height: lengthSchema,
    style: stylePatchSchema.optional(),
  }),
  z.object({
    kind: z.literal('image'),
    name: z.string().optional(),
    top: lengthSchema,
    left: lengthSchema,
    width: lengthSchema,
    height: lengthSchema,
    style: stylePatchSchema.optional(),
  }),
]);
export type NewItemSpec = z.infer<typeof newItemSpecSchema>;

/* ------------------------ Familia 1: forma y estructura ------------------ */

const setLocation = z.object({
  cmd: z.literal('setLocation'),
  id: z.string().min(1),
  top: lengthSchema,
  left: lengthSchema,
});

const setSize = z.object({
  cmd: z.literal('setSize'),
  id: z.string().min(1),
  width: lengthSchema,
  height: lengthSchema,
});

/** Mover y redimensionar a la vez (tiradores de la selección) = 1 paso de undo. */
const setBounds = z.object({
  cmd: z.literal('setBounds'),
  id: z.string().min(1),
  top: lengthSchema,
  left: lengthSchema,
  width: lengthSchema,
  height: lengthSchema,
});

const setZIndex = z.object({
  cmd: z.literal('setZIndex'),
  id: z.string().min(1),
  zIndex: z.number().int(),
});

const setName = z.object({
  cmd: z.literal('setName'),
  id: z.string().min(1),
  name: z.string().min(1),
});

const setVisibility = z.object({
  cmd: z.literal('setVisibility'),
  id: z.string().min(1),
  /** `true/false` literal, expresión, o `null` para quitar la visibilidad. */
  hidden: z.union([z.boolean(), z.string()]).nullable(),
});

const setMemberVisibility = z.object({
  cmd: z.literal('setMemberVisibility'),
  /** Tablix propietario de la jerarquía. */
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  /** Índices de `TablixMember` desde la raíz de su jerarquía. */
  path: z.array(z.number().int().nonnegative()).min(1),
  /** `true/false` literal, expresión, o `null` para quitarla. */
  hidden: z.union([z.boolean(), z.string()]).nullable(),
});

const setItemOptions = z.object({
  cmd: z.literal('setItemOptions'),
  id: z.string().min(1),
  canGrow: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
});

const setStyle = z.object({
  cmd: z.literal('setStyle'),
  id: z.string().min(1),
  style: stylePatchSchema,
});

const insertItem = z.object({
  cmd: z.literal('insertItem'),
  scope: scopeRefSchema,
  index: z.number().int().nonnegative(),
  item: newItemSpecSchema,
});

const deleteItem = z.object({
  cmd: z.literal('deleteItem'),
  id: z.string().min(1),
});

const moveItem = z.object({
  cmd: z.literal('moveItem'),
  id: z.string().min(1),
  toScope: scopeRefSchema,
  toIndex: z.number().int().nonnegative(),
});

const duplicateItem = z.object({
  cmd: z.literal('duplicateItem'),
  id: z.string().min(1),
  name: z.string().min(1).optional(),
});

/* ------------------------ Familia 2: texto y expresiones ----------------- */

const setText = z.object({
  cmd: z.literal('setText'),
  id: z.string().min(1),
  /** Índice de párrafo y de run dentro del Textbox. */
  p: z.number().int().nonnegative(),
  r: z.number().int().nonnegative(),
  /** Literal o `=expresión`. */
  value: z.string(),
});

const setParagraphs = z.object({
  cmd: z.literal('setParagraphs'),
  id: z.string().min(1),
  paragraphs: z.array(paragraphSchema),
});

/* ------------------------- Familia 3: página y informe ------------------- */

const setPageSize = z.object({
  cmd: z.literal('setPageSize'),
  width: lengthSchema,
  height: lengthSchema,
});

const setPageMargins = z.object({
  cmd: z.literal('setPageMargins'),
  top: lengthSchema,
  bottom: lengthSchema,
  left: lengthSchema,
  right: lengthSchema,
});

const setRegionHeight = z.object({
  cmd: z.literal('setRegionHeight'),
  region: z.enum(['pageHeader', 'pageFooter']),
  height: lengthSchema,
});

const setHeaderFooterOptions = z.object({
  cmd: z.literal('setHeaderFooterOptions'),
  region: z.enum(['pageHeader', 'pageFooter']),
  printOnFirstPage: z.boolean().optional(),
  printOnLastPage: z.boolean().optional(),
});

const setReportCode = z.object({
  cmd: z.literal('setReportCode'),
  /** Bloque `<Code>` VB completo (atómico; inverso = texto anterior). */
  code: z.string(),
});

/* ------------------- Familia 4: opciones de Image ------------------------ */

const setImageOptions = z.object({
  cmd: z.literal('setImageOptions'),
  id: z.string().min(1),
  source: z.enum(['External', 'Embedded', 'Database']).nullable().optional(),
  /** Expresión (`=Fields!...`) o URL según el origen. */
  value: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  sizing: z.string().nullable().optional(),
});

const resizeTable = z.object({
  cmd: z.literal('resizeTable'),
  id: z.string().min(1),
  top: lengthSchema,
  left: lengthSchema,
  /** Ancho total de la rejilla (se reparte entre las columnas). */
  width: lengthSchema,
  /** Alto total de la rejilla (se reparte entre las filas). */
  height: lengthSchema,
});

const resizeColumn = z.object({
  cmd: z.literal('resizeColumn'),
  id: z.string().min(1),
  /** Índice de columna (0-based) dentro del `TablixBody`. */
  column: z.number().int().nonnegative(),
  width: lengthSchema,
});

const resizeRow = z.object({
  cmd: z.literal('resizeRow'),
  id: z.string().min(1),
  /** Índice de fila (0-based) dentro del `TablixBody`. */
  row: z.number().int().nonnegative(),
  height: lengthSchema,
});

/**
 * Estructura del Tablix (F2 parte 3): añadir/quitar filas y columnas
 * sincronizando `TablixBody` **y** `TablixRowHierarchy`/`TablixColumnHierarchy`
 * (las celdas fusionadas se ajustan solas).
 */
const addRow = z.object({
  cmd: z.literal('addRow'),
  id: z.string().min(1),
  /** Índice donde nace la fila (0..n); la fila actual de esa posición baja. */
  row: z.number().int().nonnegative(),
  /** Alto de la fila nueva; por defecto, el de la fila vecina. */
  height: lengthSchema.optional(),
});

const deleteRow = z.object({
  cmd: z.literal('deleteRow'),
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
});

const addColumn = z.object({
  cmd: z.literal('addColumn'),
  id: z.string().min(1),
  /** Índice donde nace la columna (0..n); la columna actual de esa posición se corre. */
  column: z.number().int().nonnegative(),
  width: lengthSchema.optional(),
});

const deleteColumn = z.object({
  cmd: z.literal('deleteColumn'),
  id: z.string().min(1),
  column: z.number().int().nonnegative(),
});

/** Varias filas/columnas a la vez: un solo paso de undo (delete en lote). */
const deleteRows = z.object({
  cmd: z.literal('deleteRows'),
  id: z.string().min(1),
  rows: z.array(z.number().int().nonnegative()).min(1),
});

const deleteColumns = z.object({
  cmd: z.literal('deleteColumns'),
  id: z.string().min(1),
  columns: z.array(z.number().int().nonnegative()).min(1),
});

/**
 * Combinar celdas: la celda ancla (row, col) absorbe el bloque y las celdas
 * cubiertas desaparecen (su contenido se descarta, como en RB).
 */
const mergeCells = z.object({
  cmd: z.literal('mergeCells'),
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  rowSpan: z.number().int().positive(),
  colSpan: z.number().int().positive(),
});

/** Separar la celda combinada que empieza en (row, col). */
const unmergeCells = z.object({
  cmd: z.literal('unmergeCells'),
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});

/* ------------------------------ Unión ----------------------------------- */

export const commandSchema = z.discriminatedUnion('cmd', [
  setLocation,
  setSize,
  setBounds,
  resizeTable,
  resizeColumn,
  resizeRow,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  deleteRows,
  deleteColumns,
  mergeCells,
  unmergeCells,
  setZIndex,
  setName,
  setVisibility,
  setMemberVisibility,
  setItemOptions,
  setStyle,
  insertItem,
  deleteItem,
  moveItem,
  duplicateItem,
  setText,
  setParagraphs,
  setPageSize,
  setPageMargins,
  setRegionHeight,
  setHeaderFooterOptions,
  setReportCode,
  setImageOptions,
]);

export type RdlcCommand = z.infer<typeof commandSchema>;
export type CommandName = RdlcCommand['cmd'];
