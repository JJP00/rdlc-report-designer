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
  /**
   * Tablix nuevo (F2): nace con una rejilla 1×1 (una celda con un Textbox
   * vacío) y las dos jerarquías con un miembro hoja cada una, como el mínimo
   * válido del XSD. El usuario añade filas/columnas desde la estructura.
   */
  z.object({
    kind: z.literal('tablix'),
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
  /** Posición relativa al contenedor destino (si el drag la conoce). */
  top: lengthSchema.optional(),
  left: lengthSchema.optional(),
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

/**
 * Fila **fuera del grupo** que contiene la fila indicada: nace pegada a su
 * borde (`above` = antes de la primera hoja del grupo, `below` = después de la
 * última) y el miembro va al contenedor del padre, no dentro del grupo.
 */
const addRowOutsideGroup = z.object({
  cmd: z.literal('addRowOutsideGroup'),
  id: z.string().min(1),
  /** Fila (hoja) del body que marca el grupo; `above`/`below` su borde. */
  row: z.number().int().nonnegative(),
  where: z.enum(['above', 'below']),
  height: lengthSchema.optional(),
});

/**
 * Fila **dentro del grupo** que contiene la fila indicada, pegada a ella
 * (`above` = justo antes, `below` = justo después). Si el grupo es **hoja**
 * (su fila ES el grupo) se convierte en contenedor conservando la fila
 * original como primer miembro.
 */
const addRowInsideGroup = z.object({
  cmd: z.literal('addRowInsideGroup'),
  id: z.string().min(1),
  /** Fila (hoja) del body dentro del grupo. */
  row: z.number().int().nonnegative(),
  where: z.enum(['above', 'below']),
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

/* ------------------------ grupos de fila (F2.b) -------------------------- */

/**
 * Edita la expresión de un grupo (`Group > GroupExpressions`). El miembro se
 * busca por `path` en la jerarquía del eje. Si la ordenación del grupo espejaba
 * la expresión anterior, se sincroniza (como hace Report Builder).
 */
const setGroupExpression = z.object({
  cmd: z.literal('setGroupExpression'),
  /** Tablix propietario de la jerarquía. */
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  /** Índices de `TablixMember` desde la raíz de su jerarquía. */
  path: z.array(z.number().int().nonnegative()).min(1),
  /** Expresión RDL (`=Fields!...`); no puede quedar vacía. */
  expression: z.string(),
});

/**
 * Envuelve una fila (hoja del `TablixRowHierarchy`) en un **grupo nuevo** con
 * esa expresión: la fila pasa a ser el detalle del grupo. No crea cabecera
 * (la del grupo es opcional en RDL; BC las pone en `TablixHeader` si las hay).
 */
const addRowGroup = z.object({
  cmd: z.literal('addRowGroup'),
  id: z.string().min(1),
  /** Índice de la fila del body (hoja, 0-based) que se agrupa. */
  row: z.number().int().nonnegative(),
  expression: z.string(),
});

/**
 * Quita el grupo de un miembro:
 * - Grupo **hoja** (sin hijos): la fila se queda como fila estática.
 * - Grupo **con hijos**: las filas se **elevan** al padre y el miembro
 *   desaparece (si trae `TablixHeader` con contenido, se rechaza para no
 *   perderlo en silencio).
 */
const deleteRowGroup = z.object({
  cmd: z.literal('deleteRowGroup'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
});

/**
 * Añade a un grupo una fila **contigua** a su rango de hojas: la fila pasa a
 * ser la primera o la última hoja del grupo. Solo se admite si toca el rango
 * (antes o después) para no reordenar las hojas del body.
 */
const addRowToGroup = z.object({
  cmd: z.literal('addRowToGroup'),
  id: z.string().min(1),
  /** Índice de la fila del body (hoja, 0-based) que se mueve al grupo. */
  row: z.number().int().nonnegative(),
  /** Grupo destino (`path` de la proyección: índices de `TablixMember`). */
  groupPath: z.array(z.number().int().nonnegative()).min(1),
});

/* ------------------------ grupos: opciones (F2.b.2) --------------------- */

/**
 * Reemplaza la lista de expresiones del grupo (`GroupExpressions`), en orden:
 * la primera es el «Group on» de RB y las siguientes los «And on».
 */
const setGroupExpressions = z.object({
  cmd: z.literal('setGroupExpressions'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
  expressions: z.array(z.string()).min(1),
});

/**
 * Saltos de página del grupo: escribe un `PageBreak > BreakLocation` por cada
 * opción marcada (`Between`, `Start`, `End`). Los `PageBreak` con otros valores
 * (`None`, `StartAndEnd`) no se tocan.
 */
const setGroupPageBreaks = z.object({
  cmd: z.literal('setGroupPageBreaks'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
  between: z.boolean(),
  start: z.boolean(),
  end: z.boolean(),
});

/** Ordenación del miembro (`SortExpressions`); sin dirección = ascendente. */
const setGroupSorting = z.object({
  cmd: z.literal('setGroupSorting'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
  sorts: z.array(
    z.object({
      expression: z.string(),
      direction: z.enum(['Ascending', 'Descending']).optional(),
    }),
  ),
});

/**
 * Item que alterna la visibilidad del miembro (`Visibility > ToggleItem`);
 * `null` quita el `ToggleItem` (y la `Visibility` si se queda vacía).
 */
const setMemberToggleItem = z.object({
  cmd: z.literal('setMemberToggleItem'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
  item: z.string().nullable(),
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
  addRowOutsideGroup,
  addRowInsideGroup,
  deleteRow,
  addColumn,
  deleteColumn,
  deleteRows,
  deleteColumns,
  mergeCells,
  unmergeCells,
  setGroupExpression,
  addRowGroup,
  deleteRowGroup,
  addRowToGroup,
  setGroupExpressions,
  setGroupPageBreaks,
  setGroupSorting,
  setMemberToggleItem,
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
