import type { NewItemSpec } from '@rdlc-designer/contracts';
import { insertCanonical, writeLength } from '../geometry/geometry.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

/** Construye un item nuevo válido (hijos obligatorios en orden canónico XSD). */
export function createReportItem(
  container: RdlcNode,
  spec: NewItemSpec & { name: string },
): RdlcNode {
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
    insertCanonical(item, 'CanGrow', item.createElement('CanGrow', 'true'));

    const paragraphs = item.createElement('Paragraphs');
    const paragraph = paragraphs.createElement('Paragraph');
    const runs = paragraph.createElement('TextRuns');
    const run = runs.createElement('TextRun');
    run.appendChild(run.createElement('Value', spec.text ?? ''));

    runs.appendChild(run);
    paragraph.appendChild(runs);
    paragraphs.appendChild(paragraph);
    item.appendChild(paragraphs);
  }

  if (spec.kind === 'image') {
    item.appendChild(item.createElement('Source', 'External'));
    item.appendChild(item.createElement('Sizing', 'FitProportional'));
  }

  return item;
}
