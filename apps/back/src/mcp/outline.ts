import type {
  ItemDto,
  Length,
  ProjectionDto,
  RegionDto,
  TablixDto,
  TablixMemberDto,
} from '@rdlc-designer/contracts';

/**
 * Vistas compactas de la proyección para el agente. El JSON completo de un
 * informe real son decenas de miles de tokens; el agente casi siempre necesita
 * el **mapa** (qué hay, dónde, cómo se llama) y solo a veces un item entero.
 */

export type RegionName = 'pageHeader' | 'body' | 'pageFooter';

const fmt = (length: Length): string => `${Number(length.value.toFixed(4))}${length.unit}`;

const box = (item: ItemDto): string =>
  `top=${fmt(item.top)} left=${fmt(item.left)} w=${fmt(item.width)} h=${fmt(item.height)}`;

function regionOf(projection: ProjectionDto, region: RegionName): RegionDto {
  return region === 'pageHeader'
    ? projection.page.header
    : region === 'pageFooter'
      ? projection.page.footer
      : projection.page.body;
}

/** Texto del Textbox: runs de cada párrafo unidos, párrafos separados por « ¶ ». */
function textOf(item: ItemDto): string {
  if (item.kind !== 'textbox') return '';
  return item.paragraphs.map((p) => p.runs.map((r) => r.value).join('')).join(' ¶ ');
}

/** Todos los items del subárbol (rectángulos y celdas de tablix incluidas). */
export function* walkItems(items: readonly (ItemDto | null)[]): Generator<ItemDto> {
  for (const item of items) {
    if (!item) continue;
    yield item;
    if (item.kind === 'rectangle') yield* walkItems(item.children);
    if (item.kind === 'tablix') {
      for (const row of item.body.rows) {
        yield* walkItems(row.cells.map((cell) => cell.content));
      }
      if (item.headers) {
        for (const band of [...item.headers.columns, ...item.headers.rows]) {
          yield* walkItems(band.cells);
        }
        for (const row of item.headers.corner) yield* walkItems(row);
      }
    }
  }
}

export function findItem(projection: ProjectionDto, id: string): ItemDto | undefined {
  for (const region of ['pageHeader', 'body', 'pageFooter'] as const) {
    for (const item of walkItems(regionOf(projection, region).items)) {
      if (item.id === id) return item;
    }
  }
  return undefined;
}

/** Datos de cabecera del informe: página, regiones, conteo de items y metadatos. */
export function describeReport(projection: ProjectionDto): Record<string, unknown> {
  const counts = (region: RegionDto): Record<string, number> => {
    const byKind: Record<string, number> = {};
    for (const item of walkItems(region.items)) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    return byKind;
  };
  const { page, meta } = projection;
  return {
    reportName: projection.reportName,
    version: projection.version,
    page: {
      width: fmt(page.width),
      height: fmt(page.height),
      margins: {
        top: fmt(page.margins.top),
        bottom: fmt(page.margins.bottom),
        left: fmt(page.margins.left),
        right: fmt(page.margins.right),
      },
    },
    regions: {
      pageHeader: {
        present: page.header.present !== false,
        height: fmt(page.header.height),
        items: counts(page.header),
      },
      body: {
        width: fmt(page.body.width),
        height: fmt(page.body.height),
        items: counts(page.body),
      },
      pageFooter: {
        present: page.footer.present !== false,
        height: fmt(page.footer.height),
        items: counts(page.footer),
      },
    },
    fields: meta.fields,
    parameters: meta.parameters,
    embeddedImages: meta.embeddedImages ?? [],
    codeFunctions: meta.code.functions,
    hasCode: meta.code.text.trim().length > 0,
  };
}

/* ------------------------------- Outline ---------------------------------- */

class Lines {
  readonly out: string[] = [];
  truncated = false;
  /** Textos/expresiones recortados: el agente debe saberlo, no inferirlo de un «…». */
  clipped = 0;

  constructor(
    private readonly max: number,
    private readonly fullText: boolean,
  ) {}

  /** Una línea de texto: aplana espacios y, salvo `fullText`, recorta marcando cuánto falta. */
  clip(text: string, max = 60): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (this.fullText || flat.length <= max) return flat;
    this.clipped += 1;
    return `${flat.slice(0, max - 1)}…[+${flat.length - max + 1} chars]`;
  }

  add(depth: number, text: string): void {
    if (this.out.length >= this.max) {
      this.truncated = true;
      return;
    }
    this.out.push(`${'  '.repeat(depth)}${text}`);
  }
}

function describeMembers(
  lines: Lines,
  depth: number,
  axis: string,
  members: readonly TablixMemberDto[],
): void {
  for (const member of members) {
    const parts = [`${axis}[${member.path.join(',')}]`];
    if (member.expression !== undefined) {
      parts.push(
        `group${member.name ? ` "${member.name}"` : ''} on ${lines.clip(member.expression)}`,
      );
    } else {
      parts.push('static');
    }
    if (member.total !== 'none') parts.push(`total=${member.total}`);
    if (member.hidden !== undefined) parts.push(`hidden=${String(member.hidden)}`);
    lines.add(depth, parts.join(' '));
    describeMembers(lines, depth + 1, axis, member.children);
  }
}

function outlineTablix(lines: Lines, depth: number, item: TablixDto): void {
  lines.add(
    depth + 1,
    `columns: ${item.body.columns.map(fmt).join(', ')} | rows: ${item.body.rows.map((r) => fmt(r.height)).join(', ')}`,
  );
  describeMembers(lines, depth + 1, 'rowGroup', item.rowHierarchy);
  describeMembers(lines, depth + 1, 'colGroup', item.columnHierarchy);
  if (item.filters?.length) {
    lines.add(
      depth + 1,
      `filters: ${item.filters.map((f) => `${lines.clip(f.expression)} ${f.operator} ${f.values.map((v) => lines.clip(v, 30)).join('|')}`).join('; ')}`,
    );
  }
  item.body.rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      const span =
        (cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1
          ? ` span=${cell.rowSpan ?? 1}x${cell.colSpan ?? 1}`
          : '';
      if (!cell.content) {
        lines.add(depth + 1, `cell(${r},${c})${span} empty`);
        return;
      }
      outlineItem(lines, depth + 1, cell.content, `cell(${r},${c})${span} `);
    });
  });
  const headers = item.headers;
  if (headers) {
    const bands: [string, (typeof headers.columns)[number][]][] = [
      ['colHeader', headers.columns],
      ['rowHeader', headers.rows],
    ];
    for (const [label, list] of bands) {
      list.forEach((band, b) => {
        band.cells.forEach((content, c) => {
          const path = band.members?.[c]?.path.join(',');
          if (content)
            outlineItem(lines, depth + 1, content, `${label}[band ${b}, member ${path ?? c}] `);
        });
      });
    }
    headers.corner.forEach((row, r) =>
      row.forEach((content, c) => {
        if (content) outlineItem(lines, depth + 1, content, `corner(${r},${c}) `);
      }),
    );
  }
}

function outlineItem(lines: Lines, depth: number, item: ItemDto, prefix = ''): void {
  const hidden = item.hidden !== undefined ? ` hidden=${String(item.hidden)}` : '';
  const head = `${prefix}${item.kind} "${item.id}" ${box(item)}${hidden}`;
  switch (item.kind) {
    case 'textbox': {
      const text = textOf(item);
      lines.add(depth, text ? `${head} text: ${lines.clip(text)}` : head);
      break;
    }
    case 'image':
      lines.add(
        depth,
        `${head} source=${item.source ?? '?'}${item.value ? ` value=${lines.clip(item.value, 40)}` : ''}`,
      );
      break;
    case 'rectangle':
      lines.add(depth, head);
      for (const child of item.children) outlineItem(lines, depth + 1, child);
      break;
    case 'tablix':
      lines.add(depth, head);
      outlineTablix(lines, depth, item);
      break;
    case 'unknown':
      lines.add(depth, `${head} <${item.tagName}> (not editable)`);
      break;
    default:
      lines.add(depth, head);
  }
}

export interface OutlineOptions {
  /** Limitar a una región; por defecto las tres. */
  region?: RegionName;
  /** Esquema de un solo item (y su subárbol) en vez de las regiones. */
  id?: string;
  maxLines: number;
  /** No recortar textos ni expresiones largas. */
  fullText?: boolean;
}

export function outlineOf(projection: ProjectionDto, options: OutlineOptions): string | undefined {
  const lines = new Lines(options.maxLines, options.fullText === true);

  if (options.id !== undefined) {
    const item = findItem(projection, options.id);
    if (!item) return undefined;
    outlineItem(lines, 0, item);
  } else {
    const regions: RegionName[] = options.region
      ? [options.region]
      : ['pageHeader', 'body', 'pageFooter'];
    for (const name of regions) {
      const region = regionOf(projection, name);
      const absent = name !== 'body' && region.present === false;
      lines.add(
        0,
        `${name}${absent ? ' (absent; create it with setRegionPresent)' : ''} h=${fmt(region.height)} w=${fmt(region.width)} · ${region.items.length} items`,
      );
      for (const item of region.items) outlineItem(lines, 1, item);
    }
  }

  if (lines.clipped > 0) {
    lines.out.push(
      `… ${lines.clipped} text(s)/expression(s) shortened ("…[+N chars]"): get the full text with rdlc_get_item {id}, or pass fullText: true.`,
    );
  }
  if (lines.truncated) {
    lines.out.push(
      `… output truncated to ${options.maxLines} lines: ask for a specific region or item id.`,
    );
  }
  return lines.out.join('\n');
}
