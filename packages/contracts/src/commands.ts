import { z } from 'zod';
import { lengthSchema } from './common.js';
import { paragraphSchema, tablixFilterSchema } from './projection.js';
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
  /** Celda de una cabecera de miembro (`TablixMember > TablixHeader`). */
  z.object({
    kind: z.literal('tablixHeader'),
    id: z.string().min(1),
    axis: z.enum(['row', 'column']),
    /** Índices de `TablixMember` desde la raíz de su jerarquía. */
    path: z.array(z.number().int().nonnegative()).min(1),
  }),
  /** Celda de la esquina (`TablixCorner`): fila/celda en orden del XML. */
  z.object({
    kind: z.literal('tablixCorner'),
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
   * Tablix nuevo (F2): nace con una rejilla **2 filas × 3 columnas** (cada
   * celda con un Textbox vacío y ambas jerarquías a juego). El ancho/alto del
   * spec es el **total** y se reparte entre las celdas (7,5 × 1,2 cm por
   * defecto → celdas de 2,5 × 0,6 cm).
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

/**
 * Salto de página del **item** (`PageBreak > BreakLocation`; Rectangle/Tablix…).
 * `null` (o `None`) quita el bloque.
 */
const setItemPageBreak = z.object({
  cmd: z.literal('setItemPageBreak'),
  id: z.string().min(1),
  breakLocation: z.enum(['None', 'Start', 'End', 'Between']).nullable(),
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

/**
 * Etiqueta de diseñador de UN TextRun (`<Label>`: lo que BC/RB muestra en
 * lugar de la expresión; va antes del `<Value>`). `null` — o cadena vacía —
 * la quita.
 */
const setRunLabel = z.object({
  cmd: z.literal('setRunLabel'),
  id: z.string().min(1),
  /** Índice de párrafo y de run dentro del Textbox. */
  p: z.number().int().nonnegative(),
  r: z.number().int().nonnegative(),
  /** La etiqueta; `null` la quita. */
  label: z.string().nullable(),
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
  /** `body` escribe `ReportSection > Body > Height`. */
  region: z.enum(['pageHeader', 'pageFooter', 'body']),
  height: lengthSchema,
});

/**
 * Ancho de la sección del informe (`ReportSection > Width`): manda en el ancho
 * de las tres bandas (encabezado, cuerpo y pie). En Report Builder se
 * redimensiona arrastrando el borde derecho del cuerpo.
 */
const setSectionWidth = z.object({
  cmd: z.literal('setSectionWidth'),
  width: lengthSchema,
});

const setHeaderFooterOptions = z.object({
  cmd: z.literal('setHeaderFooterOptions'),
  region: z.enum(['pageHeader', 'pageFooter']),
  printOnFirstPage: z.boolean().optional(),
  printOnLastPage: z.boolean().optional(),
});

/**
 * Inserta o quita una banda de página (`PageHeader`/`PageFooter`). Al insertar
 * nace con un alto por defecto; al quitarse desaparece del XML (el undo la
 * restaura byte a byte).
 */
const setRegionPresent = z.object({
  cmd: z.literal('setRegionPresent'),
  region: z.enum(['pageHeader', 'pageFooter']),
  present: z.boolean(),
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
  /**
   * Lado desde el que el usuario inserta: la fila nueva hereda el formato de la
   * vecina del lado **opuesto** (`above` → la de abajo, `below` → la de arriba).
   * Por defecto `above` (la fila que baja).
   */
  where: z.enum(['above', 'below']).optional(),
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

/**
 * F2.c · fila de **totales del grupo**: como `addRowOutsideGroup`, nace una
 * fila estática pegada al grupo (encima = antes de su primera hoja; debajo =
 * después de la última) y el dominio **precarga** cada celda con el agregado de
 * su columna, con el ámbito del grupo: `Sum` para los campos que el informe ya
 * suma en algún sitio y `First` para el resto (totales de campos no aditivos).
 */
const addTotalRow = z.object({
  cmd: z.literal('addTotalRow'),
  id: z.string().min(1),
  /** Fila (hoja) del body que marca el grupo. */
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
  /**
   * Lado desde el que el usuario inserta: la columna nueva hereda el formato de
   * la vecina del lado **opuesto** (`left` → la de la derecha, `right` → la de la
   * izquierda). Por defecto `left` (la columna que se corre).
   */
  where: z.enum(['left', 'right']).optional(),
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

/* --------------------- grupos de fila/columna (F2.b/F3) ------------------ */

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
 * F3 (Matrix): espejo de `addRowGroup` sobre `TablixColumnHierarchy`: envuelve
 * una **columna** (hoja, 0-based) en un grupo nuevo con esa expresión. La
 * rejilla no cambia (la columna sigue siendo la misma).
 */
const addColumnGroup = z.object({
  cmd: z.literal('addColumnGroup'),
  id: z.string().min(1),
  /** Índice de la columna del body (hoja, 0-based) que se agrupa. */
  column: z.number().int().nonnegative(),
  expression: z.string(),
});

/**
 * Renombra el grupo (`Group > @Name`). El nombre debe ser único en el ámbito
 * del informe; las expresiones de ámbito (`Sum(…, "Grupo")`) **no** se
 * reescriben (aviso en la UI).
 */
const setGroupName = z.object({
  cmd: z.literal('setGroupName'),
  id: z.string().min(1),
  axis: z.enum(['row', 'column']),
  path: z.array(z.number().int().nonnegative()).min(1),
  name: z.string().min(1),
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

/**
 * F3 (Matrix): espejo de `addRowToGroup` sobre `TablixColumnHierarchy`: mueve
 * al grupo una **columna** contigua a su rango de hojas (primera o última).
 */
const addColumnToGroup = z.object({
  cmd: z.literal('addColumnToGroup'),
  id: z.string().min(1),
  /** Índice de la columna del body (hoja, 0-based) que se mueve al grupo. */
  column: z.number().int().nonnegative(),
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

/**
 * Reemplaza los filtros del **Tablix** (`Filters > Filter`). Lista vacía quita
 * el bloque (el undo lo restaura byte a byte).
 */
const setTablixFilters = z.object({
  cmd: z.literal('setTablixFilters'),
  id: z.string().min(1),
  filters: z.array(tablixFilterSchema),
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

/* --------------------------- lote (U3) ---------------------------------- */

/**
 * Comandos que se pueden agrupar en un `batch` (edición en lote de la
 * multiselección). Sin anidamiento: nunca otro `batch`.
 */
const batchableCommandSchema = z.discriminatedUnion('cmd', [
  setLocation,
  setSize,
  setBounds,
  resizeTable,
  setZIndex,
  setName,
  setVisibility,
  setItemOptions,
  setItemPageBreak,
  setStyle,
  setParagraphs,
  deleteItem,
  duplicateItem,
]);
export type BatchableCommand = z.infer<typeof batchableCommandSchema>;

/** Varios comandos aplicados como **un solo paso de undo**. */
const batch = z.object({
  cmd: z.literal('batch'),
  commands: z.array(batchableCommandSchema).min(1),
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
  addTotalRow,
  deleteRow,
  addColumn,
  deleteColumn,
  deleteRows,
  deleteColumns,
  mergeCells,
  unmergeCells,
  setGroupExpression,
  setGroupName,
  addRowGroup,
  addColumnGroup,
  deleteRowGroup,
  addRowToGroup,
  addColumnToGroup,
  setGroupExpressions,
  setGroupPageBreaks,
  setGroupSorting,
  setTablixFilters,
  setMemberToggleItem,
  setZIndex,
  setName,
  setVisibility,
  setMemberVisibility,
  setItemOptions,
  setItemPageBreak,
  setStyle,
  insertItem,
  deleteItem,
  moveItem,
  duplicateItem,
  setText,
  setParagraphs,
  setRunLabel,
  setPageSize,
  setPageMargins,
  setRegionHeight,
  setSectionWidth,
  setHeaderFooterOptions,
  setRegionPresent,
  setReportCode,
  setImageOptions,
  batch,
]);

export type RdlcCommand = z.infer<typeof commandSchema>;
export type CommandName = RdlcCommand['cmd'];
