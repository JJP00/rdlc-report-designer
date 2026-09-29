import { z } from 'zod';
import type { Length } from './common.js';
import { lengthSchema } from './common.js';
import type { StyleDto } from './style.js';
import { styleSchema } from './style.js';

/**
 * JSON de renderizado (lossy a propósito). Lo que el lienzo necesita dibujar.
 * No contiene comentarios XML, orden de atributos ni texto fuente: eso vive
 * únicamente en el DOM lossless del backend.
 */

/* ----------------------------- Texto ---------------------------------- */

export const textRunSchema = z.object({
  /** Literal o expresión (`=Fields!X.Value`). */
  value: z.string(),
  /** Etiqueta de diseñador (BC/RB la muestra en lugar de la expresión). */
  label: z.string().optional(),
  style: styleSchema.optional(),
});
export type TextRunDto = z.infer<typeof textRunSchema>;

export const paragraphSchema = z.object({
  runs: z.array(textRunSchema),
  style: styleSchema.optional(),
});
export type ParagraphDto = z.infer<typeof paragraphSchema>;

/* ------------------------------ Items ---------------------------------- */

/** Salto de página declarado en un item (`PageBreak > BreakLocation`). */
export const itemPageBreakSchema = z.enum(['None', 'Start', 'End', 'StartAndEnd', 'Between']);
export type ItemPageBreak = z.infer<typeof itemPageBreakSchema>;

export interface ItemBaseDto {
  /** = `Name` del elemento (clave del índice del dominio). */
  id: string;
  top: Length;
  left: Length;
  width: Length;
  height: Length;
  zIndex?: number;
  /** Booleano literal o expresión. */
  hidden?: boolean | string;
  /** Salto de página del propio item (Rectangle/Tablix…). */
  pageBreak?: ItemPageBreak;
  style?: StyleDto;
}

export const itemBaseShape = {
  id: z.string().min(1),
  top: lengthSchema,
  left: lengthSchema,
  width: lengthSchema,
  height: lengthSchema,
  zIndex: z.number().int().optional(),
  hidden: z.union([z.boolean(), z.string()]).optional(),
  pageBreak: itemPageBreakSchema.optional(),
  style: styleSchema.optional(),
} as const;

export interface TextboxDto extends ItemBaseDto {
  kind: 'textbox';
  paragraphs: ParagraphDto[];
  canGrow?: boolean;
  keepTogether?: boolean;
}

export interface RectangleDto extends ItemBaseDto {
  kind: 'rectangle';
  children: ItemDto[];
}

export interface LineDto extends ItemBaseDto {
  kind: 'line';
}

export interface ImageDto extends ItemBaseDto {
  kind: 'image';
  source?: string;
  /** Expresión o URL del contenido (`<Value>`). */
  value?: string;
  /** Ej. `image/png`. */
  mimeType?: string;
  sizing?: string;
}

export interface UnknownItemDto extends ItemBaseDto {
  kind: 'unknown';
  /** Elemento XML original (para el placeholder fantasma del lienzo). */
  tagName: string;
  path: string;
}

export type ItemDto = TextboxDto | RectangleDto | LineDto | ImageDto | TablixDto | UnknownItemDto;

export const textboxSchema: z.ZodType<TextboxDto> = z.object({
  kind: z.literal('textbox'),
  ...itemBaseShape,
  paragraphs: z.array(paragraphSchema),
  canGrow: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
});

export const rectangleSchema: z.ZodType<RectangleDto> = z.object({
  kind: z.literal('rectangle'),
  ...itemBaseShape,
  children: z.array(z.lazy(() => itemSchema)),
});

export const lineSchema: z.ZodType<LineDto> = z.object({
  kind: z.literal('line'),
  ...itemBaseShape,
});

export const imageSchema: z.ZodType<ImageDto> = z.object({
  kind: z.literal('image'),
  ...itemBaseShape,
  source: z.enum(['External', 'Embedded', 'Database']).optional(),
  value: z.string().optional(),
  mimeType: z.string().optional(),
  sizing: z.string().optional(),
});

export const unknownItemSchema: z.ZodType<UnknownItemDto> = z.object({
  kind: z.literal('unknown'),
  ...itemBaseShape,
  tagName: z.string(),
  path: z.string(),
});

/* ----------------------------- Tablix ---------------------------------- */

export interface TablixCellDto {
  colSpan?: number;
  rowSpan?: number;
  content: ItemDto | null;
}

export const tablixCellSchema: z.ZodType<TablixCellDto> = z.object({
  colSpan: z.number().int().positive().optional(),
  rowSpan: z.number().int().positive().optional(),
  content: z.lazy(() => itemSchema).nullable(),
});

/** Ubicación de un salto de página de grupo (`PageBreak > BreakLocation`). */
export const tablixBreakLocationSchema = z.enum(['Start', 'End', 'Between']);
export type TablixBreakLocation = z.infer<typeof tablixBreakLocationSchema>;

export const tablixSortSchema = z.object({
  /** Expresión de ordenación (`SortExpression > Value`). */
  value: z.string(),
  /** Ausente = ascendente (canónico en los ficheros de BC). */
  direction: z.enum(['Ascending', 'Descending']).optional(),
});
export type TablixSortDto = z.infer<typeof tablixSortSchema>;

export interface TablixMemberDto {
  /** Posición en el árbol = `memberPath` de los comandos. */
  path: number[];
  /** Nombre del grupo (`Group > @Name`); los miembros estáticos no lo traen. */
  name?: string;
  /** Presente = grupo dinámico; ausente = miembro estático. */
  expression?: string;
  total: 'none' | 'before' | 'after';
  hidden?: boolean | string;
  /** Ordenación del miembro (`SortExpressions`), en orden de documento. */
  sortExpressions?: TablixSortDto[];
  /** Saltos de página del grupo (`PageBreak > BreakLocation`), sin `None`. */
  pageBreaks?: TablixBreakLocation[];
  /** Item que alterna la visibilidad (`Visibility > ToggleItem`). */
  toggleItem?: string;
  children: TablixMemberDto[];
}

export const tablixMemberSchema: z.ZodType<TablixMemberDto> = z.lazy(() =>
  z.object({
    path: z.array(z.number().int().nonnegative()),
    name: z.string().optional(),
    expression: z.string().optional(),
    total: z.enum(['none', 'before', 'after']),
    hidden: z.union([z.boolean(), z.string()]).optional(),
    sortExpressions: z.array(tablixSortSchema).optional(),
    pageBreaks: z.array(tablixBreakLocationSchema).optional(),
    toggleItem: z.string().optional(),
    children: z.array(tablixMemberSchema),
  }),
);

/** Miembro al que pertenece una celda de banda (para insertar items). */
export const tablixHeaderMemberSchema = z.object({
  /** `path` del miembro en su jerarquía (mismo formato que los comandos). */
  path: z.array(z.number().int().nonnegative()),
  /** Primera hoja (fila/columna) que cubre. */
  start: z.number().int().nonnegative(),
  /** Hojas que cubre. */
  span: z.number().int().positive(),
});
export type TablixHeaderMemberDto = z.infer<typeof tablixHeaderMemberSchema>;

/** Banda de cabeceras: fila superior (columnas) o columna izquierda (filas). */
export interface TablixHeaderBandDto {
  /** Grosor de la banda: alto si es de columna, ancho si es de fila. */
  size: Length;
  /** Contenido de cada cabecera de la banda, ya colocado (geometría calculada). */
  cells: (ItemDto | null)[];
  /** Miembro de cada celda (mismo orden que `cells`). */
  members?: TablixHeaderMemberDto[];
}

export const tablixHeaderBandSchema: z.ZodType<TablixHeaderBandDto> = z.object({
  size: lengthSchema,
  cells: z.array(z.lazy(() => itemSchema).nullable()),
  members: z.array(tablixHeaderMemberSchema).optional(),
});

/**
 * Cabeceras del Tablix, **fuera de la rejilla del body**: bandas de
 * `TablixMember > TablixHeader` (arriba y a la izquierda) y esquina
 * (`TablixCorner`). `offset` es lo que hay que desplazar la rejilla.
 */
export interface TablixHeadersDto {
  offset: { top: Length; left: Length };
  /** Bandas superiores (cabeceras de columna), de la más externa a la interna. */
  columns: TablixHeaderBandDto[];
  /** Bandas izquierdas (cabeceras de fila), de la más externa a la interna. */
  rows: TablixHeaderBandDto[];
  /** Esquina: `[banda de columna][banda de fila]`. */
  corner: (ItemDto | null)[][];
}

export const tablixHeadersSchema: z.ZodType<TablixHeadersDto> = z.object({
  offset: z.object({ top: lengthSchema, left: lengthSchema }),
  columns: z.array(tablixHeaderBandSchema),
  rows: z.array(tablixHeaderBandSchema),
  corner: z.array(z.array(z.lazy(() => itemSchema).nullable())),
});

export interface TablixDto extends ItemBaseDto {
  kind: 'tablix';
  body: {
    columns: Length[];
    rows: { height: Length; cells: TablixCellDto[] }[];
  };
  rowHierarchy: TablixMemberDto[];
  columnHierarchy: TablixMemberDto[];
  /** Presente si el Tablix tiene cabeceras y/o esquina. */
  headers?: TablixHeadersDto;
}

export const tablixSchema: z.ZodType<TablixDto> = z.object({
  kind: z.literal('tablix'),
  ...itemBaseShape,
  body: z.object({
    columns: z.array(lengthSchema),
    rows: z.array(
      z.object({
        height: lengthSchema,
        cells: z.array(tablixCellSchema),
      }),
    ),
  }),
  rowHierarchy: z.array(tablixMemberSchema),
  columnHierarchy: z.array(tablixMemberSchema),
  headers: tablixHeadersSchema.optional(),
});

export const itemSchema: z.ZodType<ItemDto> = z.lazy(() =>
  z.union([
    textboxSchema,
    rectangleSchema,
    lineSchema,
    imageSchema,
    tablixSchema,
    unknownItemSchema,
  ]),
);

/* ------------------------- Página y regiones ---------------------------- */

export interface RegionDto {
  /** Ancho del área de contenido de la banda (el cuerpo define el del report). */
  width: Length;
  height: Length;
  items: ItemDto[];
  printOnFirstPage?: boolean;
  printOnLastPage?: boolean;
}

export const regionSchema: z.ZodType<RegionDto> = z.object({
  width: lengthSchema,
  height: lengthSchema,
  items: z.array(itemSchema),
  printOnFirstPage: z.boolean().optional(),
  printOnLastPage: z.boolean().optional(),
});

export const pageMarginsSchema = z.object({
  top: lengthSchema,
  bottom: lengthSchema,
  left: lengthSchema,
  right: lengthSchema,
});
export type PageMarginsDto = z.infer<typeof pageMarginsSchema>;

export const pageSchema = z.object({
  width: lengthSchema,
  height: lengthSchema,
  margins: pageMarginsSchema,
  header: regionSchema,
  body: regionSchema,
  footer: regionSchema,
});
export type PageDto = z.infer<typeof pageSchema>;

/* ------------------------------- Meta ----------------------------------- */

export const codeFunctionSchema = z.object({
  name: z.string(),
  parameters: z.array(z.string()).optional(),
});
export type CodeFunctionDto = z.infer<typeof codeFunctionSchema>;

/** Imagen incrustada del informe (`<EmbeddedImages>`); el `ImageData` no viaja. */
export const embeddedImageSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
});
export type EmbeddedImageDto = z.infer<typeof embeddedImageSchema>;

export const reportMetaSchema = z.object({
  /** Bloque `<Code>` VB custom del informe. */
  code: z.object({
    text: z.string(),
    functions: z.array(codeFunctionSchema),
  }),
  fields: z.array(z.object({ name: z.string(), dataType: z.string().optional() })),
  parameters: z.array(
    z.object({
      name: z.string(),
      dataType: z.string().optional(),
      default: z.string().optional(),
      prompt: z.string().optional(),
    }),
  ),
  /** Catálogo de imágenes embebidas (para el desplegable del panel de imagen). */
  embeddedImages: z.array(embeddedImageSchema).optional(),
});
export type ReportMetaDto = z.infer<typeof reportMetaSchema>;

/* ------------------------------ Raíz ------------------------------------ */

export const projectionSchema = z.object({
  sessionId: z.string(),
  /** Contador monotónico; sube con cada mutación (reconciliación del optimismo). */
  version: z.number().int().nonnegative(),
  reportName: z.string(),
  meta: reportMetaSchema,
  page: pageSchema,
});
export type ProjectionDto = z.infer<typeof projectionSchema>;
