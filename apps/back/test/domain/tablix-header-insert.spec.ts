import type { ProjectionDto, TablixDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/domain/document/commands/applyCommand.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { TrueFormatProjectionAdapter } from '../../src/infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../../src/infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { corpusByName } from '../golden/fixtures.js';
import { undoAll } from './command-test-utils.js';

/**
 * G8 · insertar items en cabeceras/esquina del Tablix (`TablixHeader` /
 * `TablixCorner`). Caso real: `Tablix7` de `SalesInvoiceESP` (Textbox72 en la
 * esquina, Textbox73/75 en las cabeceras de columna).
 *
 * Como en RB, una celda de cabecera admite **un** item: las ocupadas se
 * rechazan con motivo y las vacías aceptan `insertItem`/`insertClone`.
 */

const xmlAdapter = new TrueFormatXmlAdapter();
const projectionAdapter = new TrueFormatProjectionAdapter();

function open(name: string): {
  xml: string;
  doc: ReturnType<TrueFormatXmlAdapter['parse']>;
  index: DocumentIndex;
} {
  const { xml } = corpusByName(name);
  const doc = xmlAdapter.parse(xml);
  return { xml, doc, index: DocumentIndex.build(doc.root) };
}

const NEW_TEXTBOX = {
  kind: 'textbox' as const,
  name: 'TextboxCabecera',
  top: { value: 0, unit: 'cm' as const },
  left: { value: 0, unit: 'cm' as const },
  width: { value: 2, unit: 'cm' as const },
  height: { value: 0.6, unit: 'cm' as const },
  text: '',
};

describe('G8 · insertar en cabecera/esquina del Tablix', () => {
  it('inserta en una cabecera que quedó vacía (tras borrar su item)', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };

    // Se libera la celda de la cabecera de la columna 1 (Textbox73).
    const removed = applyCommand(ctx, { cmd: 'deleteItem', id: 'Textbox73' });
    expect(removed.isRight()).toBe(true);
    if (!removed.isRight()) return;
    const afterDelete = xmlAdapter.serialize(doc);

    const applied = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'tablixHeader', id: 'Tablix7', axis: 'column', path: [0] },
      index: 0,
      item: NEW_TEXTBOX,
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    const start = output.indexOf('Name="Tablix7"');
    const tablix = output.slice(start, output.indexOf('</Tablix>', start));
    // La cabecera vive en la jerarquía de columnas (tras el body).
    const hierarchy = tablix.slice(
      tablix.indexOf('<TablixColumnHierarchy>'),
      tablix.indexOf('</TablixColumnHierarchy>'),
    );
    expect(hierarchy).toContain('Name="TextboxCabecera"');

    // Undo del insert: vuelve al estado tras el borrado; y el borrado, al original.
    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(afterDelete);
    const undoneDelete = undoAll(ctx, removed.value);
    expect(undoneDelete.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('inserta en la esquina y el undo es exacto', () => {
    const { xml, doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };

    const removed = applyCommand(ctx, { cmd: 'deleteItem', id: 'Textbox72' });
    expect(removed.isRight()).toBe(true);
    if (!removed.isRight()) return;

    const applied = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'tablixCorner', id: 'Tablix7', row: 0, col: 0 },
      index: 0,
      item: { ...NEW_TEXTBOX, name: 'TextboxEsquina' },
    });
    expect(applied.isRight()).toBe(true);
    if (!applied.isRight()) return;

    const output = xmlAdapter.serialize(doc);
    const corner = output.slice(
      output.indexOf('<TablixCorner>'),
      output.indexOf('</TablixCorner>'),
    );
    expect(corner).toContain('Name="TextboxEsquina"');

    const undone = undoAll(ctx, applied.value);
    expect(undone.isRight()).toBe(true);
    const undoneDelete = undoAll(ctx, removed.value);
    expect(undoneDelete.isRight()).toBe(true);
    expect(xmlAdapter.serialize(doc)).toBe(xml);
  });

  it('rechaza celdas de cabecera y esquina ya ocupadas', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const ctx = { root: doc.root, index };

    const header = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'tablixHeader', id: 'Tablix7', axis: 'column', path: [0] },
      index: 0,
      item: { ...NEW_TEXTBOX, name: 'TextboxCabecera' },
    });
    expect(header.isLeft()).toBe(true);
    if (header.isLeft()) expect(header.value.reason).toBe('headerCellOccupied');

    const corner = applyCommand(ctx, {
      cmd: 'insertItem',
      scope: { kind: 'tablixCorner', id: 'Tablix7', row: 0, col: 0 },
      index: 0,
      item: { ...NEW_TEXTBOX, name: 'TextboxEsquina' },
    });
    expect(corner.isLeft()).toBe(true);
    if (corner.isLeft()) expect(corner.value.reason).toBe('cornerCellOccupied');
  });

  it('rechaza una cabecera que no existe (miembro sin TablixHeader)', () => {
    const { doc, index } = open('SalesInvoiceESP.rdlc');
    const applied = applyCommand(
      { root: doc.root, index },
      {
        cmd: 'insertItem',
        scope: { kind: 'tablixHeader', id: 'Tablix2', axis: 'column', path: [0] },
        index: 0,
        item: { ...NEW_TEXTBOX, name: 'TextboxCabecera' },
      },
    );
    expect(applied.isLeft()).toBe(true);
  });

  it('la proyección expone el miembro (path/start/span) de cada celda de banda', () => {
    const projection = projectionAdapter.project({
      sessionId: 'test',
      filePath: 'SalesInvoiceESP.rdlc',
      document: xmlAdapter.parse(corpusByName('SalesInvoiceESP.rdlc').xml),
      version: 1,
    });
    const tablix = findTablix(projection, 'Tablix7');
    expect(tablix).toBeDefined();

    const band = tablix?.headers?.columns[0];
    expect(band?.members).toHaveLength(2);
    expect(band?.members?.[0]).toEqual({ path: [0], start: 0, span: 1 });
    expect(band?.members?.[1]).toEqual({ path: [1], start: 1, span: 1 });
    // Las celdas de la banda siguen en el mismo orden que los miembros.
    expect(band?.cells[0]?.id).toBe('Textbox73');
    expect(band?.cells[1]?.id).toBe('Textbox75');
  });
});

/** Busca el Tablix en todas las regiones (incluye anidados en celdas). */
function findTablix(projection: ProjectionDto, id: string): TablixDto | undefined {
  const search = (items: ProjectionDto['page']['body']['items']): TablixDto | undefined => {
    for (const item of items) {
      if (item.kind === 'tablix') {
        if (item.id === id) return item;
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (!cell?.content) continue;
            const found = search([cell.content]);
            if (found) return found;
          }
        }
      }
      if (item.kind === 'rectangle') {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return undefined;
  };

  return search(projection.page.body.items) ?? search(projection.page.header.items);
}
