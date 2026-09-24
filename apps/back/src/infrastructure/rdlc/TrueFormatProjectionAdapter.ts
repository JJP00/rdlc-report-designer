import type {
  CodeFunctionDto,
  ItemDto,
  Length,
  LengthUnit,
  ParagraphDto,
  ProjectionDto,
  RegionDto,
  ReportMetaDto,
  StyleDto,
  TablixCellDto,
  TablixDto,
  TablixMemberDto,
  TextboxDto,
} from '@rdlc-designer/contracts';
import { XmlElement, XmlText } from 'xml-trueformat';
import type { RdlcProjectionPort } from '../../application/ports/out/RdlcProjectionPort.js';
import type { RdlcDocument } from '../../domain/document/tree/RdlcNode.js';
import { TrueFormatDocument } from './trueformat/TrueFormatDocument.js';

/**
 * F0/F1 — Proyección leyendo el modelo de `xml-trueformat`.
 *
 * Cubre: página (tamaño/márgenes/regiones), items del cuerpo y de las cajas
 * (Textbox, Rectangle, Line, Image, Tablix con celdas), texto por runs, estilo
 * básico y meta (fields/parámetros/funciones VB).
 *
 * Regla clave de RDL: **dentro de una celda de Tablix el contenido no declara
 * tamaño** (lo define la celda, con ColSpan/RowSpan). La proyección hereda esa
 * geometría; si no, el contenido se dibujaría 0×0.
 *
 * F1 (pendiente): jerarquías del Tablix (grupos y totales) y sustitución por
 * `ProjectionService` sobre el árbol de dominio.
 */

const DEFAULT_WIDTH: Length = { value: 21, unit: 'cm' };
const DEFAULT_HEIGHT: Length = { value: 29.7, unit: 'cm' };
const DEFAULT_MARGIN_V: Length = { value: 2.5, unit: 'cm' };
const DEFAULT_MARGIN_H: Length = { value: 1.9, unit: 'cm' };
const LENGTH_RE = /^(-?\d+(?:\.\d+)?)(cm|mm|in|pt)?$/;
const ZERO: Length = { value: 0, unit: 'cm' };

/** Geometría base que comparten todas las variantes del contrato. */
interface ItemBaseOut {
  id: string;
  top: Length;
  left: Length;
  width: Length;
  height: Length;
  zIndex?: number;
  hidden?: boolean | string;
  style?: StyleDto;
}

/** Geometría de respaldo (p. ej. el tamaño de la celda que contiene el item). */
interface GeometryFallback {
  top: Length;
  left: Length;
  width: Length;
  height: Length;
}

export class TrueFormatProjectionAdapter implements RdlcProjectionPort {
  private unknownCounter = 0;

  project(input: {
    sessionId: string;
    filePath: string;
    document: RdlcDocument;
    version: number;
  }): ProjectionDto {
    if (!(input.document instanceof TrueFormatDocument)) {
      throw new Error('TrueFormatProjectionAdapter requiere un documento TrueFormat');
    }
    const root = input.document.raw().getRootElement();
    const section = root
      .getFirstElementByName('ReportSections')
      ?.getFirstElementByName('ReportSection');
    const bodyEl = section?.getFirstElementByName('Body');
    const pageEl = section?.getFirstElementByName('Page');
    const headerEl = pageEl?.getFirstElementByName('PageHeader');
    const footerEl = pageEl?.getFirstElementByName('PageFooter');

    const pageWidth = this.length(
      textOf(pageEl?.getFirstElementByName('PageWidth')),
      DEFAULT_WIDTH,
    );
    const pageHeight = this.length(
      textOf(pageEl?.getFirstElementByName('PageHeight')),
      DEFAULT_HEIGHT,
    );
    // El cuerpo (sección) define el ancho real del report; el A4 es el papel.
    const sectionWidth = this.length(textOf(section?.getFirstElementByName('Width')), pageWidth);

    const page = {
      width: pageWidth,
      height: pageHeight,
      margins: {
        top: this.length(textOf(pageEl?.getFirstElementByName('TopMargin')), DEFAULT_MARGIN_V),
        bottom: this.length(
          textOf(pageEl?.getFirstElementByName('BottomMargin')),
          DEFAULT_MARGIN_V,
        ),
        left: this.length(textOf(pageEl?.getFirstElementByName('LeftMargin')), DEFAULT_MARGIN_H),
        right: this.length(textOf(pageEl?.getFirstElementByName('RightMargin')), DEFAULT_MARGIN_H),
      },
      header: this.region(headerEl, sectionWidth),
      body: this.region(bodyEl, sectionWidth),
      footer: this.region(footerEl, sectionWidth),
    };

    return {
      sessionId: input.sessionId,
      version: input.version,
      reportName: baseName(input.filePath),
      meta: this.meta(root),
      page,
    };
  }

  /* ------------------------------ región ------------------------------- */

  private region(el: XmlElement | undefined, width: Length): RegionDto {
    return {
      width,
      height: this.length(textOf(el?.getFirstElementByName('Height'))),
      items: this.items(el?.getFirstElementByName('ReportItems')),
    };
  }

  private items(container: XmlElement | undefined, fallback?: GeometryFallback): ItemDto[] {
    if (!container) return [];
    return container.children
      .filter((c): c is XmlElement => c instanceof XmlElement)
      .map((c) => this.item(c, fallback))
      .filter((i): i is ItemDto => i !== null);
  }

  /* ------------------------------- items ------------------------------- */

  private item(el: XmlElement, fallback?: GeometryFallback): ItemDto | null {
    const declared = {
      top: maybeLength(textOf(el.getFirstElementByName('Top'))),
      left: maybeLength(textOf(el.getFirstElementByName('Left'))),
      width: maybeLength(textOf(el.getFirstElementByName('Width'))),
      height: maybeLength(textOf(el.getFirstElementByName('Height'))),
    };
    const geometry: GeometryFallback = {
      top: declared.top ?? fallback?.top ?? ZERO,
      left: declared.left ?? fallback?.left ?? ZERO,
      width: declared.width ?? fallback?.width ?? ZERO,
      height: declared.height ?? fallback?.height ?? ZERO,
    };
    const base: ItemBaseOut = {
      id: el.getAttributeValue('Name') ?? `${el.tagName}__${(this.unknownCounter += 1)}`,
      ...geometry,
      zIndex: this.int(textOf(el.getFirstElementByName('ZIndex'))),
      hidden: this.hidden(el),
      style: this.style(el.getFirstElementByName('Style')),
    };

    switch (el.tagName) {
      case 'Textbox':
        return this.textbox(el, base);
      case 'Rectangle':
        return {
          ...base,
          kind: 'rectangle',
          children: this.items(el.getFirstElementByName('ReportItems'), geometry),
        };
      case 'Line':
        return { ...base, kind: 'line' };
      case 'Image': {
        const source = textOf(el.getFirstElementByName('Source'));
        const sourceKind =
          source === 'External' || source === 'Embedded' || source === 'Database'
            ? source
            : undefined;
        return {
          ...base,
          kind: 'image',
          ...(sourceKind ? { source: sourceKind } : {}),
          value: textOf(el.getFirstElementByName('Value')),
          mimeType: textOf(el.getFirstElementByName('MIMEType')),
          sizing: textOf(el.getFirstElementByName('Sizing')),
        };
      }
      case 'Tablix':
        return this.tablix(el, base);
      default:
        return { ...base, kind: 'unknown', tagName: el.tagName, path: el.tagName };
    }
  }

  private textbox(el: XmlElement, base: ItemBaseOut): TextboxDto {
    return {
      ...base,
      kind: 'textbox',
      paragraphs: this.paragraphs(el),
      canGrow: this.bool(textOf(el.getFirstElementByName('CanGrow'))),
      keepTogether: this.bool(textOf(el.getFirstElementByName('KeepTogether'))),
    };
  }

  private paragraphs(el: XmlElement): ParagraphDto[] {
    const container = el.getFirstElementByName('Paragraphs');
    if (!container) return [];
    return container.children
      .filter((c): c is XmlElement => c instanceof XmlElement && c.tagName === 'Paragraph')
      .map((p) => ({
        style: this.style(p.getFirstElementByName('Style')),
        runs: (p.getFirstElementByName('TextRuns')?.children ?? [])
          .filter((c): c is XmlElement => c instanceof XmlElement && c.tagName === 'TextRun')
          .map((run) => {
            const label = textOf(run.getFirstElementByName('Label'));
            return {
              value: textOf(run.getFirstElementByName('Value')) ?? '',
              ...(label !== undefined ? { label } : {}),
              style: this.style(run.getFirstElementByName('Style')),
            };
          }),
      }));
  }

  private tablix(el: XmlElement, base: ItemBaseOut): TablixDto {
    const bodyEl = el.getFirstElementByName('TablixBody');
    const columns = (bodyEl?.getFirstElementByName('TablixColumns')?.children ?? [])
      .filter((c): c is XmlElement => c instanceof XmlElement && c.tagName === 'TablixColumn')
      .map((col) => this.length(textOf(col.getFirstElementByName('Width'))));
    const rowEls = (bodyEl?.getFirstElementByName('TablixRows')?.children ?? []).filter(
      (c): c is XmlElement => c instanceof XmlElement && c.tagName === 'TablixRow',
    );
    const rowHeights = rowEls.map((row) =>
      this.length(textOf(row.getFirstElementByName('Height'))),
    );

    // La columna de una celda es la **acumulada** de los `ColSpan` anteriores
    // (no el índice del array: con celdas fusionadas, o tras fusionar, el índice
    // y la columna real divergen y el contenido heredaría un tamaño erróneo).
    const rows = rowEls.map((rowEl, rowIndex) => {
      let columnIndex = 0;
      const cells = (rowEl.getFirstElementByName('TablixCells')?.children ?? [])
        .filter((c): c is XmlElement => c instanceof XmlElement && c.tagName === 'TablixCell')
        .map((cellEl) => {
          const cell = this.tablixCell(cellEl, columnIndex, rowIndex, columns, rowHeights);
          columnIndex += cell.colSpan ?? 1;
          return cell;
        });
      return { height: rowHeights[rowIndex] ?? ZERO, cells };
    });

    const row = this.tablixMembers(el.getFirstElementByName('TablixRowHierarchy'));
    const column = this.tablixMembers(el.getFirstElementByName('TablixColumnHierarchy'));
    this.inferTotals(row.leaves, rowEls);

    return {
      ...base,
      kind: 'tablix',
      body: { columns, rows },
      rowHierarchy: row.members,
      columnHierarchy: column.members,
    };
  }

  /**
   * Árbol de miembros de una jerarquía. Devuelve también las **hojas** en orden
   * de documento (cada hoja es una fila/columna del body) con el dato de si
   * cuelgan de un grupo: es lo que necesita la inferencia de totales.
   */
  private tablixMembers(hierarchyEl: XmlElement | undefined): {
    members: TablixMemberDto[];
    leaves: { dto: TablixMemberDto; inGroup: boolean }[];
  } {
    const container = hierarchyEl?.getFirstElementByName('TablixMembers');
    if (!container) return { members: [], leaves: [] };

    const leaves: { dto: TablixMemberDto; inGroup: boolean }[] = [];
    const build = (parent: XmlElement, path: number[], inGroup: boolean): TablixMemberDto[] =>
      parent.children
        .filter(
          (child): child is XmlElement =>
            child instanceof XmlElement && child.tagName === 'TablixMember',
        )
        .map((memberEl, index) => {
          const group = memberEl.getFirstElementByName('Group');
          const expression = textOf(
            group
              ?.getFirstElementByName('GroupExpressions')
              ?.getFirstElementByName('GroupExpression'),
          );
          const nested = memberEl.getFirstElementByName('TablixMembers');
          const childPath = [...path, index];
          const children = nested ? build(nested, childPath, inGroup || group !== undefined) : [];
          const hidden = textOf(
            memberEl.getFirstElementByName('Visibility')?.getFirstElementByName('Hidden'),
          );
          const dto: TablixMemberDto = {
            path: childPath,
            total: 'none',
            children,
            ...(expression !== undefined && expression !== '' ? { expression } : {}),
            ...(hidden !== undefined
              ? {
                  hidden: hidden === 'true' ? true : hidden === 'false' ? false : hidden,
                }
              : {}),
          };
          if (children.length === 0) {
            leaves.push({ dto, inGroup: inGroup || group !== undefined });
          }
          return dto;
        });

    return { members: build(container, [], false), leaves };
  }

  /**
   * Totales (heurística documentada): el RDL no marca las filas de total; una
   * fila estática con funciones agregadas pegada a un grupo es un total — `after`
   * si el grupo va antes y `before` si va después (igual que infiere RB).
   */
  private inferTotals(
    leaves: { dto: TablixMemberDto; inGroup: boolean }[],
    rowEls: XmlElement[],
  ): void {
    leaves.forEach((leaf, index) => {
      if (leaf.inGroup) return;
      const rowEl = rowEls[index];
      if (!rowEl || !rowHasAggregate(rowEl)) return;
      if (leaves[index - 1]?.inGroup) leaf.dto.total = 'after';
      else if (leaves[index + 1]?.inGroup) leaf.dto.total = 'before';
    });
  }

  /**
   * La celda define el tamaño del contenido: `ColumnSpan × RowSpan` sobre las
   * dimensiones de las columnas/filas. Los hijos `ColSpan`/`RowSpan`/`Height`
   * de `CellContents` NO son el contenido.
   */
  private tablixCell(
    cellEl: XmlElement,
    columnIndex: number,
    rowIndex: number,
    columns: Length[],
    rowHeights: Length[],
  ): TablixCellDto {
    const contents = cellEl.getFirstElementByName('CellContents');
    const colSpan = this.int(textOf(contents?.getFirstElementByName('ColSpan'))) ?? 1;
    const rowSpan = this.int(textOf(contents?.getFirstElementByName('RowSpan'))) ?? 1;

    // El ancho sale de las columnas de la rejilla que cubre la celda. Si la
    // posición desborda lo declarado (ficheros de BC con filas más anchas que
    // `TablixColumns`), se usa la última columna como referencia: 0 dejaría el
    // contenido invisible.
    const width = this.spanWidth(columns, columnIndex, colSpan);
    const height = this.spanHeight(rowHeights, rowIndex, rowSpan);

    const contentEl = (contents?.children ?? []).find(
      (c): c is XmlElement =>
        c instanceof XmlElement && !['ColSpan', 'RowSpan', 'Height'].includes(c.tagName),
    );

    const cell: TablixCellDto = {
      content: contentEl ? this.item(contentEl, { top: ZERO, left: ZERO, width, height }) : null,
    };
    if (colSpan > 1) cell.colSpan = colSpan;
    if (rowSpan > 1) cell.rowSpan = rowSpan;
    return cell;
  }

  /** Ancho de `colSpan` columnas desde `columnIndex` (tolerante al desborde). */
  private spanWidth(columns: Length[], columnIndex: number, colSpan: number): Length {
    const slice = columns.slice(columnIndex, columnIndex + colSpan);
    if (slice.length > 0) return sumLengths(slice);
    return columns[columns.length - 1] ?? ZERO;
  }

  /** Alto de `rowSpan` filas desde `rowIndex` (tolerante al desborde). */
  private spanHeight(rowHeights: Length[], rowIndex: number, rowSpan: number): Length {
    const slice = rowHeights.slice(rowIndex, rowIndex + rowSpan);
    if (slice.length > 0) return sumLengths(slice);
    return rowHeights[rowHeights.length - 1] ?? ZERO;
  }

  /* ------------------------------- meta -------------------------------- */

  private meta(root: XmlElement): ReportMetaDto {
    const fields: { name: string; dataType?: string }[] = [];
    for (const dataSet of root.getFirstElementByName('DataSets')?.children ?? []) {
      if (!(dataSet instanceof XmlElement) || dataSet.tagName !== 'DataSet') continue;
      for (const field of dataSet.getFirstElementByName('Fields')?.children ?? []) {
        if (!(field instanceof XmlElement) || field.tagName !== 'Field') continue;
        const name = field.getAttributeValue('Name');
        if (!name) continue;
        const dataType = field.getAttributeValue('rd:TypeName');
        fields.push(dataType ? { name, dataType } : { name });
      }
    }

    const parameters: ReportMetaDto['parameters'] = [];
    for (const param of root.getFirstElementByName('ReportParameters')?.children ?? []) {
      if (!(param instanceof XmlElement) || param.tagName !== 'ReportParameter') continue;
      const name = param.getAttributeValue('Name');
      if (!name) continue;
      parameters.push({
        name,
        dataType: textOf(param.getFirstElementByName('DataType')),
        prompt: textOf(param.getFirstElementByName('Prompt')),
        default: textOf(
          param
            .getFirstElementByName('DefaultValue')
            ?.getFirstElementByName('Values')
            ?.getFirstElementByName('Value'),
        ),
      });
    }

    const code = textOf(root.getFirstElementByName('Code')) ?? '';
    return { code: { text: code, functions: parseVbFunctions(code) }, fields, parameters };
  }

  /* --------------------------- value objects ---------------------------- */

  private length(raw: string | undefined, fallback: Length = ZERO): Length {
    if (!raw) return fallback;
    const match = LENGTH_RE.exec(raw.trim());
    if (!match) return fallback;
    return { value: Number(match[1]), unit: (match[2] as LengthUnit | undefined) ?? 'cm' };
  }

  private int(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
  }

  private bool(raw: string | undefined): boolean | undefined {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  }

  private hidden(el: XmlElement): boolean | string | undefined {
    const raw = textOf(el.getFirstElementByName('Hidden'));
    if (raw === undefined) return undefined;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  private imageSourceKind(
    source: string | undefined,
  ): 'External' | 'Embedded' | 'Database' | undefined {
    return source === 'External' || source === 'Embedded' || source === 'Database'
      ? source
      : undefined;
  }

  private style(el: XmlElement | undefined): StyleDto | undefined {
    if (!el) return undefined;
    const style: StyleDto = {};
    const fontFamily = textOf(el.getFirstElementByName('FontFamily'));
    const fontSize = textOf(el.getFirstElementByName('FontSize'));
    const fontWeight = textOf(el.getFirstElementByName('FontWeight'));
    const fontStyle = textOf(el.getFirstElementByName('FontStyle'));
    const textDecoration = textOf(el.getFirstElementByName('TextDecoration'));
    const color = textOf(el.getFirstElementByName('Color'));
    const backgroundColor = textOf(el.getFirstElementByName('BackgroundColor'));
    const textAlign = textOf(el.getFirstElementByName('TextAlign'));
    const verticalAlign = textOf(el.getFirstElementByName('VerticalAlign'));
    const format = textOf(el.getFirstElementByName('Format'));

    if (fontFamily) style.fontFamily = fontFamily;
    if (fontSize) style.fontSize = this.length(fontSize);
    if (fontWeight === 'Bold' || fontWeight === 'Normal') style.fontWeight = fontWeight;
    if (fontStyle === 'Italic' || fontStyle === 'Normal') style.fontStyle = fontStyle;
    if (
      textDecoration === 'None' ||
      textDecoration === 'Underline' ||
      textDecoration === 'LineThrough' ||
      textDecoration === 'Overline'
    ) {
      style.textDecoration = textDecoration;
    }
    if (color) style.color = color;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (
      textAlign === 'Left' ||
      textAlign === 'Center' ||
      textAlign === 'Right' ||
      textAlign === 'Justify'
    ) {
      style.textAlign = textAlign;
    }
    if (verticalAlign === 'Top' || verticalAlign === 'Middle' || verticalAlign === 'Bottom') {
      style.verticalAlign = verticalAlign;
    }
    if (format) style.format = format;

    const listStyle = textOf(el.getFirstElementByName('ListStyle'));
    if (listStyle === 'None' || listStyle === 'Bulleted' || listStyle === 'Numbered') {
      style.listStyle = listStyle;
    }

    const padding = {
      top: maybeLength(textOf(el.getFirstElementByName('PaddingTop'))),
      left: maybeLength(textOf(el.getFirstElementByName('PaddingLeft'))),
      bottom: maybeLength(textOf(el.getFirstElementByName('PaddingBottom'))),
      right: maybeLength(textOf(el.getFirstElementByName('PaddingRight'))),
    };
    if (Object.values(padding).some((value) => value !== undefined)) {
      style.padding = Object.fromEntries(
        Object.entries(padding).filter(([, value]) => value !== undefined),
      );
    }

    return Object.keys(style).length > 0 ? style : undefined;
  }
}

/* ------------------------------- helpers --------------------------------- */

function textOf(el: XmlElement | undefined): string | undefined {
  if (!el) return undefined;
  const textNode = el.children.find((c): c is XmlText => c instanceof XmlText);
  return textNode?.unescapeText();
}

/** Longitud declarada; `undefined` si el elemento no la trae (no lo confundas con 0). */
function maybeLength(raw: string | undefined): Length | undefined {
  if (raw === undefined) return undefined;
  const match = LENGTH_RE.exec(raw.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: (match[2] as LengthUnit | undefined) ?? 'cm' };
}

const CM_PER_UNIT: Record<LengthUnit, number> = {
  cm: 1,
  mm: 0.1,
  in: 2.54,
  pt: 2.54 / 72,
};

function sumLengths(lengths: Length[]): Length {
  const cm = lengths.reduce((acc, length) => acc + length.value * CM_PER_UNIT[length.unit], 0);
  return { value: Number(cm.toFixed(6)), unit: 'cm' };
}

function baseName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return name.replace(/\.rdlc$/i, '');
}

/** true si la fila contiene alguna expresión agregada (`=Sum(`, `=Count(`…). */
const AGGREGATE_RE = /^=\s*(Sum|Count|CountDistinct|Avg|Min|Max|First|Last|Aggregate)\s*\(/i;

function rowHasAggregate(row: XmlElement): boolean {
  for (const child of row.children) {
    if (!(child instanceof XmlElement)) continue;
    if (child.tagName === 'Value') {
      const value = textOf(child);
      if (value !== undefined && AGGREGATE_RE.test(value)) return true;
    }
    if (rowHasAggregate(child)) return true;
  }
  return false;
}

/** Extrae firmas `Function`/`Sub` del bloque VB custom (`Code.`). */
function parseVbFunctions(code: string): CodeFunctionDto[] {
  const functions: CodeFunctionDto[] = [];
  const re =
    /(?:^|\n)\s*(?:Public|Private|Protected|Friend)?\s*(?:Shared\s+)?(?:Function|Sub)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    if (!name) continue;
    const params = (match[2] ?? '')
      .split(',')
      .map(
        (p) =>
          p
            .trim()
            // `ByVal Value As String` → `Value` (sin modo de paso ni tipo).
            .split(/\s+As\s+/i)[0]
            ?.replace(/^(?:ByVal|ByRef|Optional|ParamArray)\s+/i, '')
            .trim() ?? '',
      )
      .filter((p) => p.length > 0);
    functions.push(params.length > 0 ? { name, parameters: params } : { name });
  }
  return functions;
}
