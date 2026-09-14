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

  project(input: { sessionId: string; filePath: string; document: RdlcDocument; version: number }): ProjectionDto {
    if (!(input.document instanceof TrueFormatDocument)) {
      throw new Error('TrueFormatProjectionAdapter requiere un documento TrueFormat');
    }
    const root = input.document.raw().getRootElement();
    const section = root.getFirstElementByName('ReportSections')?.getFirstElementByName('ReportSection');
    const bodyEl = section?.getFirstElementByName('Body');
    const pageEl = section?.getFirstElementByName('Page');
    const headerEl = pageEl?.getFirstElementByName('PageHeader');
    const footerEl = pageEl?.getFirstElementByName('PageFooter');

    const page = {
      width: this.length(textOf(pageEl?.getFirstElementByName('PageWidth')), DEFAULT_WIDTH),
      height: this.length(textOf(pageEl?.getFirstElementByName('PageHeight')), DEFAULT_HEIGHT),
      margins: {
        top: this.length(textOf(pageEl?.getFirstElementByName('TopMargin')), DEFAULT_MARGIN_V),
        bottom: this.length(textOf(pageEl?.getFirstElementByName('BottomMargin')), DEFAULT_MARGIN_V),
        left: this.length(textOf(pageEl?.getFirstElementByName('LeftMargin')), DEFAULT_MARGIN_H),
        right: this.length(textOf(pageEl?.getFirstElementByName('RightMargin')), DEFAULT_MARGIN_H),
      },
      header: this.region(headerEl),
      body: this.region(bodyEl),
      footer: this.region(footerEl),
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

  private region(el: XmlElement | undefined): RegionDto {
    return {
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
      case 'Image':
        return {
          ...base,
          kind: 'image',
          source: textOf(el.getFirstElementByName('Source')),
          sourceKind: this.imageSourceKind(textOf(el.getFirstElementByName('Source'))),
          sizing: textOf(el.getFirstElementByName('Sizing')),
        };
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
          .map((run) => ({
            value: textOf(run.getFirstElementByName('Value')) ?? '',
            style: this.style(run.getFirstElementByName('Style')),
          })),
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
    const rowHeights = rowEls.map((row) => this.length(textOf(row.getFirstElementByName('Height'))));

    const rows = rowEls.map((rowEl, rowIndex) => ({
      height: rowHeights[rowIndex] ?? ZERO,
      cells: (rowEl.getFirstElementByName('TablixCells')?.children ?? [])
        .filter((c): c is XmlElement => c instanceof XmlElement && c.tagName === 'TablixCell')
        .map((cellEl, colIndex) => this.tablixCell(cellEl, colIndex, rowIndex, columns, rowHeights)),
    }));

    return {
      ...base,
      kind: 'tablix',
      body: { columns, rows },
      // F1: jerarquías de filas/columnas (grupos y totales).
      rowHierarchy: [],
      columnHierarchy: [],
    };
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

    const width = sumLengths(columns.slice(columnIndex, columnIndex + colSpan));
    const height = sumLengths(rowHeights.slice(rowIndex, rowIndex + rowSpan));

    const contentEl = (contents?.children ?? []).find(
      (c): c is XmlElement =>
        c instanceof XmlElement && !['ColSpan', 'RowSpan', 'Height'].includes(c.tagName),
    );

    const cell: TablixCellDto = {
      content: contentEl
        ? this.item(contentEl, { top: ZERO, left: ZERO, width, height })
        : null,
    };
    if (colSpan > 1) cell.colSpan = colSpan;
    if (rowSpan > 1) cell.rowSpan = rowSpan;
    return cell;
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

  private imageSourceKind(source: string | undefined): 'External' | 'Embedded' | 'Database' | undefined {
    return source === 'External' || source === 'Embedded' || source === 'Database' ? source : undefined;
  }

  private style(el: XmlElement | undefined): StyleDto | undefined {
    if (!el) return undefined;
    const style: StyleDto = {};
    const fontFamily = textOf(el.getFirstElementByName('FontFamily'));
    const fontSize = textOf(el.getFirstElementByName('FontSize'));
    const fontWeight = textOf(el.getFirstElementByName('FontWeight'));
    const fontStyle = textOf(el.getFirstElementByName('FontStyle'));
    const color = textOf(el.getFirstElementByName('Color'));
    const backgroundColor = textOf(el.getFirstElementByName('BackgroundColor'));
    const textAlign = textOf(el.getFirstElementByName('TextAlign'));
    const verticalAlign = textOf(el.getFirstElementByName('VerticalAlign'));
    const format = textOf(el.getFirstElementByName('Format'));

    if (fontFamily) style.fontFamily = fontFamily;
    if (fontSize) style.fontSize = this.length(fontSize);
    if (fontWeight === 'Bold' || fontWeight === 'Normal') style.fontWeight = fontWeight;
    if (fontStyle === 'Italic' || fontStyle === 'Normal') style.fontStyle = fontStyle;
    if (color) style.color = color;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (textAlign === 'Left' || textAlign === 'Center' || textAlign === 'Right' || textAlign === 'Justify') {
      style.textAlign = textAlign;
    }
    if (verticalAlign === 'Top' || verticalAlign === 'Middle' || verticalAlign === 'Bottom') {
      style.verticalAlign = verticalAlign;
    }
    if (format) style.format = format;

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

/** Extrae firmas `Function`/`Sub` del bloque VB custom (`Code.`). */
function parseVbFunctions(code: string): CodeFunctionDto[] {
  const functions: CodeFunctionDto[] = [];
  const re = /(?:^|\n)\s*(?:Public|Private|Protected|Friend)?\s*(?:Shared\s+)?(?:Function|Sub)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    if (!name) continue;
    const params = (match[2] ?? '')
      .split(',')
      .map((p) => p.trim().split(/\s+As\s+/i)[0]?.trim() ?? '')
      .filter((p) => p.length > 0);
    functions.push(params.length > 0 ? { name, parameters: params } : { name });
  }
  return functions;
}
