import type {
  BorderStyle,
  CodeFunctionDto,
  ItemDto,
  ItemPageBreak,
  Length,
  TablixFilterDto,
  LengthUnit,
  ParagraphDto,
  ProjectionDto,
  RegionDto,
  ReportMetaDto,
  StyleDto,
  TablixBreakLocation,
  TablixCellDto,
  TablixDto,
  TablixHeaderBandDto,
  TablixHeadersDto,
  TablixMemberDto,
  TablixSortDto,
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
// Acepta `.5in` (sin cero inicial) y `pc` (pica = 12pt), ambos válidos en RDL.
const LENGTH_RE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(cm|mm|in|pt|pc)?$/;
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
  pageBreak?: ItemPageBreak;
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
      header: this.region(headerEl, sectionWidth, headerEl !== undefined),
      body: this.region(bodyEl, sectionWidth, true),
      footer: this.region(footerEl, sectionWidth, footerEl !== undefined),
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

  private region(el: XmlElement | undefined, width: Length, present: boolean): RegionDto {
    return {
      width,
      height: this.length(textOf(el?.getFirstElementByName('Height'))),
      items: this.items(el?.getFirstElementByName('ReportItems')),
      printOnFirstPage: this.bool(textOf(el?.getFirstElementByName('PrintOnFirstPage'))),
      printOnLastPage: this.bool(textOf(el?.getFirstElementByName('PrintOnLastPage'))),
      present,
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
    const breakLocation = textOf(
      el.getFirstElementByName('PageBreak')?.getFirstElementByName('BreakLocation'),
    );
    const base: ItemBaseOut = {
      id: el.getAttributeValue('Name') ?? `${el.tagName}__${(this.unknownCounter += 1)}`,
      ...geometry,
      zIndex: this.int(textOf(el.getFirstElementByName('ZIndex'))),
      hidden: this.hidden(el),
      ...(isItemPageBreak(breakLocation) ? { pageBreak: breakLocation } : {}),
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
      .map((p) => {
        // `ListStyle` es hijo directo de `<Paragraph>` (no vive en `<Style>`).
        const style: StyleDto = { ...(this.style(p.getFirstElementByName('Style')) ?? {}) };
        const listStyle = textOf(p.getFirstElementByName('ListStyle'));
        if (listStyle === 'None' || listStyle === 'Bulleted' || listStyle === 'Numbered') {
          style.listStyle = listStyle;
        }
        return {
          style: Object.keys(style).length > 0 ? style : undefined,
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
        };
      });
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

    // Columna de cada celda. Los ficheros de BC/SSRS escriben **una celda por
    // columna**: la celda i vive en la columna i y las columnas que cubre un
    // `ColSpan` van rellenas de celdas vacías (no son contenido). Los ficheros
    // ya fusionados por versiones anteriores del editor solo listan las anclas:
    // ahí la columna se acumula con los `ColSpan` anteriores.
    const rows = rowEls.map((rowEl, rowIndex) => {
      const cellEls = elementChildren(rowEl.getFirstElementByName('TablixCells'), 'TablixCell');
      const spans = cellEls.map((cellEl) => {
        const contents = cellEl.getFirstElementByName('CellContents');
        return this.int(textOf(contents?.getFirstElementByName('ColSpan'))) ?? 1;
      });
      const total = spans.reduce((acc, span) => acc + span, 0);
      const bySlot = cellEls.length === columns.length && total !== columns.length;

      const cells: TablixCellDto[] = [];
      let coveredUntil = 0;
      let columnIndex = 0;
      cellEls.forEach((cellEl, index) => {
        if (bySlot) {
          // Relleno de una celda fusionada: no se proyecta.
          if (index < coveredUntil) return;
          columnIndex = index;
          coveredUntil = index + spans[index]!;
        }
        cells.push(this.tablixCell(cellEl, columnIndex, rowIndex, columns, rowHeights));
        if (!bySlot) columnIndex += spans[index]!;
      });
      return { height: rowHeights[rowIndex] ?? ZERO, cells };
    });

    const row = this.tablixMembers(el.getFirstElementByName('TablixRowHierarchy'));
    const column = this.tablixMembers(el.getFirstElementByName('TablixColumnHierarchy'));
    this.inferTotals(row.leaves, rowEls);

    const headers = this.tablixHeaders(el, columns, rowHeights);
    const filters = this.tablixFilters(el.getFirstElementByName('Filters'));

    return {
      ...base,
      kind: 'tablix',
      body: { columns, rows },
      rowHierarchy: row.members,
      columnHierarchy: column.members,
      ...(headers ? { headers } : {}),
      ...(filters.length > 0 ? { filters } : {}),
    };
  }

  /** Filtros del Tablix (`Filters > Filter`); los operadores no estándar se omiten. */
  private tablixFilters(el: XmlElement | undefined): TablixFilterDto[] {
    const filters: TablixFilterDto[] = [];
    for (const filter of elementChildren(el, 'Filter')) {
      const operator = textOf(filter.getFirstElementByName('Operator'));
      const known = TABLIX_FILTER_OPERATORS.find((value) => value === operator);
      if (!known) continue;
      filters.push({
        expression: textOf(filter.getFirstElementByName('FilterExpression')) ?? '',
        operator: known,
        values: elementChildren(filter.getFirstElementByName('FilterValues'), 'FilterValue').map(
          (value) => textOf(value) ?? '',
        ),
      });
    }
    return filters;
  }

  /**
   * Cabeceras del Tablix (`TablixMember > TablixHeader`) y esquina
   * (`TablixCorner`). Cada cabecera se coloca como item con su geometría ya
   * calculada: el **grosor** lo fija el `Size` del miembro y el **largo**, las
   * filas/columnas que cubre. El `offset` es la suma de las bandas (lo que hay
   * que desplazar la rejilla del body).
   */
  private tablixHeaders(
    el: XmlElement,
    columns: Length[],
    rows: Length[],
  ): TablixHeadersDto | undefined {
    const columnBands = rawHeaderBands(el.getFirstElementByName('TablixColumnHierarchy'));
    const rowBands = rawHeaderBands(el.getFirstElementByName('TablixRowHierarchy'));
    const offsetTop = sumLengths(columnBands.map((band) => band.size));
    const offsetLeft = sumLengths(rowBands.map((band) => band.size));

    let bandTop = ZERO;
    const columnDtos: TablixHeaderBandDto[] = columnBands.map((band) => {
      const top = bandTop;
      bandTop = addLengths(bandTop, band.size);
      return {
        size: band.size,
        cells: band.cells.map((cell) =>
          cell.content
            ? this.item(cell.content, {
                top,
                left: addLengths(offsetLeft, sumLengths(columns.slice(0, cell.start))),
                width: sumLengths(columns.slice(cell.start, cell.start + cell.span)),
                height: band.size,
              })
            : null,
        ),
        members: band.cells.map((cell) => ({
          path: cell.path,
          start: cell.start,
          span: cell.span,
        })),
      };
    });

    let bandLeft = ZERO;
    const rowDtos: TablixHeaderBandDto[] = rowBands.map((band) => {
      const left = bandLeft;
      bandLeft = addLengths(bandLeft, band.size);
      return {
        size: band.size,
        cells: band.cells.map((cell) =>
          cell.content
            ? this.item(cell.content, {
                top: addLengths(offsetTop, sumLengths(rows.slice(0, cell.start))),
                left,
                width: band.size,
                height: sumLengths(rows.slice(cell.start, cell.start + cell.span)),
              })
            : null,
        ),
        members: band.cells.map((cell) => ({
          path: cell.path,
          start: cell.start,
          span: cell.span,
        })),
      };
    });

    const corner = this.tablixCorner(
      el.getFirstElementByName('TablixCorner'),
      columnBands,
      rowBands,
    );

    if (columnDtos.length === 0 && rowDtos.length === 0 && corner.length === 0) return undefined;
    return {
      offset: { top: offsetTop, left: offsetLeft },
      columns: columnDtos,
      rows: rowDtos,
      corner,
    };
  }

  /** Esquina: celda `[banda de columna][banda de fila]`; el tamaño lo dan las bandas. */
  private tablixCorner(
    cornerEl: XmlElement | undefined,
    columnBands: RawHeaderBand[],
    rowBands: RawHeaderBand[],
  ): (ItemDto | null)[][] {
    const cornerRows = elementChildren(
      cornerEl?.getFirstElementByName('TablixCornerRows'),
      'TablixCornerRow',
    );
    return cornerRows.map((rowEl, row) =>
      elementChildren(rowEl, 'TablixCornerCell').map((cellEl, col) => {
        const content = nonSpanChild(cellEl.getFirstElementByName('CellContents'));
        if (!content) return null;
        const columnBand = columnBands[row];
        const rowBand = rowBands[col];
        return this.item(content, {
          top: sumLengths(columnBands.slice(0, row).map((band) => band.size)),
          height: columnBand?.size ?? ZERO,
          left: sumLengths(rowBands.slice(0, col).map((band) => band.size)),
          width: rowBand?.size ?? ZERO,
        });
      }),
    );
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
          const name = group?.getAttributeValue('Name');
          const nested = memberEl.getFirstElementByName('TablixMembers');
          const childPath = [...path, index];
          const children = nested ? build(nested, childPath, inGroup || group !== undefined) : [];
          const hidden = textOf(
            memberEl.getFirstElementByName('Visibility')?.getFirstElementByName('Hidden'),
          );
          const toggleItem = textOf(
            memberEl.getFirstElementByName('Visibility')?.getFirstElementByName('ToggleItem'),
          );
          const sortExpressions = this.memberSortExpressions(memberEl);
          const pageBreaks = this.memberPageBreaks(group);
          const dto: TablixMemberDto = {
            path: childPath,
            total: 'none',
            children,
            ...(name !== undefined && name !== '' ? { name } : {}),
            ...(expression !== undefined && expression !== '' ? { expression } : {}),
            ...(hidden !== undefined
              ? {
                  hidden: hidden === 'true' ? true : hidden === 'false' ? false : hidden,
                }
              : {}),
            ...(sortExpressions.length > 0 ? { sortExpressions } : {}),
            ...(pageBreaks.length > 0 ? { pageBreaks } : {}),
            ...(toggleItem !== undefined && toggleItem !== '' ? { toggleItem } : {}),
          };
          if (children.length === 0) {
            leaves.push({ dto, inGroup: inGroup || group !== undefined });
          }
          return dto;
        });

    return { members: build(container, [], false), leaves };
  }

  /** `SortExpressions` del miembro (dirección ausente = ascendente). */
  private memberSortExpressions(memberEl: XmlElement): TablixSortDto[] {
    return elementChildren(memberEl.getFirstElementByName('SortExpressions'), 'SortExpression')
      .map((sort) => {
        const value = textOf(sort.getFirstElementByName('Value')) ?? '';
        const direction = textOf(sort.getFirstElementByName('Direction'));
        return {
          value,
          ...(direction === 'Descending' ? { direction: 'Descending' as const } : {}),
        };
      })
      .filter((sort) => sort.value !== '');
  }

  /** `PageBreak > BreakLocation` del grupo (solo los valores que editamos). */
  private memberPageBreaks(group: XmlElement | undefined): TablixBreakLocation[] {
    return elementChildren(group, 'PageBreak')
      .map((pageBreak) => textOf(pageBreak.getFirstElementByName('BreakLocation')))
      .filter(
        (location): location is TablixBreakLocation =>
          location === 'Start' || location === 'End' || location === 'Between',
      );
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
        // En RDLC el tipo va como atributo `rd:TypeName`; en los `.rdl` de SSRS
        // es un elemento hijo `<rd:TypeName>` (BUG-25).
        const dataType =
          field.getAttributeValue('rd:TypeName') ??
          textOf(field.getFirstElementByName('rd:TypeName'));
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

    const embeddedImages: NonNullable<ReportMetaDto['embeddedImages']> = [];
    for (const image of root.getFirstElementByName('EmbeddedImages')?.children ?? []) {
      if (!(image instanceof XmlElement) || image.tagName !== 'EmbeddedImage') continue;
      const name = image.getAttributeValue('Name');
      if (!name) continue;
      const mimeType = textOf(image.getFirstElementByName('MIMEType'));
      embeddedImages.push(mimeType ? { name, mimeType } : { name });
    }

    const code = textOf(root.getFirstElementByName('Code')) ?? '';
    return {
      code: { text: code, functions: parseVbFunctions(code) },
      fields,
      parameters,
      embeddedImages,
    };
  }

  /* --------------------------- value objects ---------------------------- */

  private length(raw: string | undefined, fallback: Length = ZERO): Length {
    return maybeLength(raw) ?? fallback;
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
    // En RDL el `Hidden` va dentro de `Visibility` (no como hijo directo del
    // item): buscar solo el hijo directo lo perdía en todos los informes de BC.
    const raw = textOf(el.getFirstElementByName('Visibility')?.getFirstElementByName('Hidden'));
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

    const border = this.border(el);
    if (border) style.border = border;

    return Object.keys(style).length > 0 ? style : undefined;
  }

  /**
   * Bordes **resueltos por lado** con la herencia del genérico **propiedad a
   * propiedad**: BC escribe `<Border><Style>Solid</Style></Border>` +
   * `<TopBorder><Width>1pt</Width></TopBorder>` (el lado solo cambia el ancho).
   */
  private border(el: XmlElement): StyleDto['border'] {
    const generic = el.getFirstElementByName('Border');
    const border: NonNullable<StyleDto['border']> = {};
    let any = false;

    for (const side of BORDER_SIDES) {
      const node = el.getFirstElementByName(side.tag);
      if (!node && !generic) continue;

      const rawStyle =
        textOf(node?.getFirstElementByName('Style')) ??
        textOf(generic?.getFirstElementByName('Style'));
      const color =
        textOf(node?.getFirstElementByName('Color')) ??
        textOf(generic?.getFirstElementByName('Color'));
      const width = maybeLength(
        textOf(node?.getFirstElementByName('Width')) ??
          textOf(generic?.getFirstElementByName('Width')),
      );
      const styleValue = BORDER_STYLE_VALUES.find((value) => value === rawStyle);
      if (styleValue === undefined && color === undefined && width === undefined) continue;

      border[side.key] = {
        style: styleValue ?? 'None',
        ...(color !== undefined ? { color } : {}),
        ...(width !== undefined ? { width } : {}),
      };
      any = true;
    }

    return any ? border : undefined;
  }
}

/** Lados de un borde: override en `Style` por cada lado. */
const BORDER_SIDES = [
  { key: 'top', tag: 'TopBorder' },
  { key: 'left', tag: 'LeftBorder' },
  { key: 'bottom', tag: 'BottomBorder' },
  { key: 'right', tag: 'RightBorder' },
] as const;

const BORDER_STYLE_VALUES: BorderStyle[] = ['None', 'Solid', 'Dashed', 'Dotted', 'Double'];

const TABLIX_FILTER_OPERATORS = [
  'Equal',
  'Like',
  'NotEqual',
  'GreaterThan',
  'GreaterThanOrEqual',
  'LessThan',
  'LessThanOrEqual',
  'TopN',
  'BottomN',
  'TopPercent',
  'BottomPercent',
  'In',
  'Between',
] as const;

function isItemPageBreak(value: string | undefined): value is ItemPageBreak {
  return (
    value === 'None' ||
    value === 'Start' ||
    value === 'End' ||
    value === 'StartAndEnd' ||
    value === 'Between'
  );
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
  // La pica no existe en el contrato (cm|mm|in|pt): 1pc = 12pt.
  const picas = match[2] === 'pc';
  const value = Number(match[1]) * (picas ? 12 : 1);
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: picas ? 'pt' : ((match[2] as LengthUnit | undefined) ?? 'cm') };
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

function addLengths(a: Length, b: Length): Length {
  return sumLengths([a, b]);
}

/* --------------------- cabeceras del Tablix (crudo) ---------------------- */

interface RawHeaderCell {
  /** `path` del miembro en su jerarquía (índices entre hermanos). */
  path: number[];
  /** Primera columna/fila (índice de hoja) que cubre el miembro. */
  start: number;
  /** Columnas/filas que cubre (número de hojas bajo el miembro). */
  span: number;
  content: XmlElement | undefined;
}

interface RawHeaderBand {
  /** Profundidad en la jerarquía (0 = el miembro más externo). */
  depth: number;
  size: Length;
  cells: RawHeaderCell[];
}

/**
 * Bandas `TablixHeader` de una jerarquía, agrupadas por profundidad (los
 * hermanos comparten banda) y ordenadas de fuera a dentro. El `span` de cada
 * miembro sale del contador de hojas: cada hoja es una fila/columna del body.
 */
function rawHeaderBands(hierarchyEl: XmlElement | undefined): RawHeaderBand[] {
  const container = hierarchyEl?.getFirstElementByName('TablixMembers');
  if (!container) return [];

  const bands = new Map<number, RawHeaderBand>();
  let leaf = 0;

  const walk = (parent: XmlElement, depth: number, path: number[]): void => {
    elementChildren(parent, 'TablixMember').forEach((member, index) => {
      const memberPath = [...path, index];
      const start = leaf;
      const nested = member.getFirstElementByName('TablixMembers');
      if (nested) walk(nested, depth + 1, memberPath);
      else leaf += 1;

      const header = member.getFirstElementByName('TablixHeader');
      const size = maybeLength(textOf(header?.getFirstElementByName('Size')));
      if (!header || !size) return;

      const band = bands.get(depth) ?? { depth, size, cells: [] };
      band.cells.push({
        path: memberPath,
        start,
        span: leaf - start,
        content: nonSpanChild(header.getFirstElementByName('CellContents')),
      });
      bands.set(depth, band);
    });
  };

  walk(container, 0, []);
  return [...bands.values()].sort((a, b) => a.depth - b.depth);
}

/** Primer hijo de `CellContents` que no sea un span (el report item de la celda). */
function nonSpanChild(contents: XmlElement | undefined): XmlElement | undefined {
  return elementChildren(contents).find(
    (child) => !['ColSpan', 'RowSpan', 'Height'].includes(child.tagName),
  );
}

function elementChildren(parent: XmlElement | undefined, tagName?: string): XmlElement[] {
  if (!parent) return [];
  return parent.children.filter(
    (child): child is XmlElement =>
      child instanceof XmlElement && (tagName === undefined || child.tagName === tagName),
  );
}

function baseName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return name.replace(/\.(rdlc|rdl)$/i, '');
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
