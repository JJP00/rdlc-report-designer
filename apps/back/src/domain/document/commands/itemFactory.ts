import type { NewItemSpec } from '@rdlc-designer/contracts';
import { insertCanonical, writeLength } from '../geometry/geometry.js';
import { formatLength } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/** Nombre libre que elige quien crea el item (el índice del dominio lo sabe). */
export type ItemNamer = (kind: string) => string;

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
 * Tablix nuevo: rejilla 1×1 (una celda con un Textbox vacío) y las dos
 * jerarquías con un miembro hoja cada una — el mínimo que exige el XSD.
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

  const body = tablix.createElement('TablixBody');
  const columns = body.createElement('TablixColumns');
  const column = columns.createElement('TablixColumn');
  column.appendChild(column.createElement('Width', formatLength(spec.width)));
  columns.appendChild(column);

  const rows = body.createElement('TablixRows');
  const row = rows.createElement('TablixRow');
  row.appendChild(row.createElement('Height', formatLength(spec.height)));
  const cells = row.createElement('TablixCells');
  const cell = cells.createElement('TablixCell');
  const contents = cell.createElement('CellContents');
  const textbox = contents.createElement('Textbox');
  textbox.setAttribute('Name', nameFor('textbox'));
  appendTextboxContent(textbox, '');
  contents.appendChild(textbox);
  cell.appendChild(contents);
  cells.appendChild(cell);
  row.appendChild(cells);
  rows.appendChild(row);
  body.appendChild(columns);
  body.appendChild(rows);

  tablix.appendChild(body);
  tablix.appendChild(hierarchy(tablix, 'TablixColumnHierarchy'));
  tablix.appendChild(hierarchy(tablix, 'TablixRowHierarchy'));

  tablix.appendChild(tablix.createElement('Top', formatLength(spec.top)));
  tablix.appendChild(tablix.createElement('Left', formatLength(spec.left)));
  tablix.appendChild(tablix.createElement('Height', formatLength(spec.height)));
  tablix.appendChild(tablix.createElement('Width', formatLength(spec.width)));
  tablix.appendChild(tablix.createElement('Style'));

  return tablix;
}

/** Jerarquía (de fila o columna) con un único miembro hoja. */
function hierarchy(tablix: RdlcNode, tagName: string): RdlcNode {
  const hierarchy = tablix.createElement(tagName);
  const members = hierarchy.createElement('TablixMembers');
  members.appendChild(members.createElement('TablixMember'));
  hierarchy.appendChild(members);
  return hierarchy;
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
