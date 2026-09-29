import type { NewItemSpec } from '@rdlc-designer/contracts';
import { insertCanonical, writeLength } from '../geometry/geometry.js';
import { formatLength, fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/** Nombre libre que elige quien crea el item (el índice del dominio lo sabe). */
export type ItemNamer = (kind: string) => string;

/** Rejilla por defecto del Tablix nuevo: 2 filas × 3 columnas (como RB). */
const TABLIX_ROWS = 2;
const TABLIX_COLUMNS = 3;

export interface CreateReportItemOptions {
  /** Necesario al crear un Tablix: su celda nace con un Textbox con nombre. */
  nameFor?: ItemNamer;
}

/** Construye un item nuevo válido (hijos obligatorios en orden canónico XSD). */
export function createReportItem(
  container: RdlcNode,
  spec: NewItemSpec & { name: string },
  options: CreateReportItemOptions = {},
): RdlcNode {
  if (spec.kind === 'tablix') {
    return createTablix(container, spec, options.nameFor ?? ((kind) => freeName(container, kind)));
  }

  const tagName =
    spec.kind === 'textbox'
      ? 'Textbox'
      : spec.kind === 'rectangle'
        ? 'Rectangle'
        : spec.kind === 'line'
          ? 'Line'
          : 'Image';

  const item = container.createElement(tagName);
  item.setAttribute('Name', spec.name);

  // `writeLength` inserta en orden canónico (Top, Left, Height, Width…).
  writeLength(item, 'Top', spec.top);
  writeLength(item, 'Left', spec.left);
  writeLength(item, 'Height', spec.height);
  writeLength(item, 'Width', spec.width);

  if (spec.kind === 'textbox') {
    appendTextboxContent(item, spec.text ?? '');
  }

  if (spec.kind === 'image') {
    item.appendChild(item.createElement('Source', 'External'));
    item.appendChild(item.createElement('Sizing', 'FitProportional'));
  }

  return item;
}

/**
 * Tablix nuevo: rejilla **2 filas × 3 columnas** (con 7,5 × 1,2 cm por defecto
 * salen celdas de 2,5 × 0,6 cm). Cada celda nace con un Textbox vacío y cada
 * hoja del body tiene su miembro en ambas jerarquías (el mínimo que exige el
 * XSD, ya «con cuerpo» para trabajar como en Report Builder).
 *
 * Los hijos van en el orden que emite BC (`TablixBody` primero y la geometría
 * después; el XSD lo admite como `choice`).
 */
function createTablix(
  container: RdlcNode,
  spec: Extract<NewItemSpec, { kind: 'tablix' }> & { name: string },
  nameFor: ItemNamer,
): RdlcNode {
  const tablix = container.createElement('Tablix');
  tablix.setAttribute('Name', spec.name);

  const columnWidths = distributeLength(spec.width, TABLIX_COLUMNS);
  const rowHeights = distributeLength(spec.height, TABLIX_ROWS);

  const body = tablix.createElement('TablixBody');
  const columns = body.createElement('TablixColumns');
  for (const width of columnWidths) {
    const column = columns.createElement('TablixColumn');
    column.appendChild(column.createElement('Width', formatLength(width)));
    columns.appendChild(column);
  }

  const rows = body.createElement('TablixRows');
  for (const height of rowHeights) {
    const row = rows.createElement('TablixRow');
    row.appendChild(row.createElement('Height', formatLength(height)));
    const cells = row.createElement('TablixCells');
    for (let column = 0; column < TABLIX_COLUMNS; column += 1) {
      const cell = cells.createElement('TablixCell');
      const contents = cell.createElement('CellContents');
      const textbox = contents.createElement('Textbox');
      textbox.setAttribute('Name', nameFor('textbox'));
      appendTextboxContent(textbox, '');
      contents.appendChild(textbox);
      cell.appendChild(contents);
      cells.appendChild(cell);
    }
    row.appendChild(cells);
    rows.appendChild(row);
  }
  body.appendChild(columns);
  body.appendChild(rows);

  tablix.appendChild(body);
  tablix.appendChild(hierarchy(tablix, 'TablixColumnHierarchy', TABLIX_COLUMNS));
  tablix.appendChild(hierarchy(tablix, 'TablixRowHierarchy', TABLIX_ROWS));

  tablix.appendChild(tablix.createElement('Top', formatLength(spec.top)));
  tablix.appendChild(tablix.createElement('Left', formatLength(spec.left)));
  tablix.appendChild(tablix.createElement('Height', formatLength(spec.height)));
  tablix.appendChild(tablix.createElement('Width', formatLength(spec.width)));
  tablix.appendChild(tablix.createElement('Style'));

  return tablix;
}

/** Jerarquía (de fila o columna) con `count` miembros hoja. */
function hierarchy(tablix: RdlcNode, tagName: string, count: number): RdlcNode {
  const hierarchy = tablix.createElement(tagName);
  const members = hierarchy.createElement('TablixMembers');
  for (let index = 0; index < count; index += 1) {
    members.appendChild(members.createElement('TablixMember'));
  }
  hierarchy.appendChild(members);
  return hierarchy;
}

/**
 * Reparte un ancho/alto total entre `count` celdas (el resto va a la última
 * para que la suma sea exacta; con 7,5/3 y 1,2/2 salen 2,5 y 0,6 cm).
 */
function distributeLength(total: Length, count: number): Length[] {
  const totalCm = toCm(total);
  const each = totalCm / count;
  const result: Length[] = [];
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    const value = index === count - 1 ? totalCm - used : each;
    used += value;
    result.push(fromCm(value));
  }
  return result;
}

/** `Paragraphs > Paragraph > TextRuns > TextRun > Value` (+ `CanGrow`). */
function appendTextboxContent(textbox: RdlcNode, text: string): void {
  insertCanonical(textbox, 'CanGrow', textbox.createElement('CanGrow', 'true'));

  const paragraphs = textbox.createElement('Paragraphs');
  const paragraph = paragraphs.createElement('Paragraph');
  const runs = paragraph.createElement('TextRuns');
  const run = runs.createElement('TextRun');
  run.appendChild(run.createElement('Value', text));

  runs.appendChild(run);
  paragraph.appendChild(runs);
  paragraphs.appendChild(paragraph);
  textbox.appendChild(paragraphs);
}

/** Respaldo sin índice: busca el primer `PrefijoN` libre en el documento. */
function freeName(container: RdlcNode, kind: string): string {
  const prefix = kind === 'textbox' ? 'Textbox' : kind === 'tablix' ? 'Tablix' : 'Item';
  let root = container;
  while (root.parent) root = root.parent;

  const used = new Set<string>();
  const visit = (node: RdlcNode): void => {
    const name = node.attribute('Name');
    if (name) used.add(name);
    for (const child of node.children()) visit(child);
  };
  visit(root);

  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}${index}`;
    if (!used.has(candidate)) return candidate;
  }
}
