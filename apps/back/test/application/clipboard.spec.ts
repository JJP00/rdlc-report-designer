import { readFile, utimes, writeFile } from 'node:fs/promises';
import { IPC_EVENTS } from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/**
 * F1 — portapapeles de items (`copy` / `cut` / `paste`).
 *
 * El portapapeles vive en el backend y guarda un **clon desprendido** del
 * subárbol: pegar no depende del original, cada pegado renombra y el undo quita
 * el clon sin tocar el portapapeles.
 */

afterEach(cleanupTempDirs);

async function openFixture(name = 'SalesInvoiceESP.rdlc'): Promise<{
  commands: CommandService;
  service: Awaited<ReturnType<typeof makeService>>['service'];
  watcher: Awaited<ReturnType<typeof makeService>>['watcher'];
  events: Awaited<ReturnType<typeof makeService>>['events'];
  sessionId: string;
  path: string;
  /** Índice reconstruido (los comandos estructurales lo dejan desactualizado). */
  index: () => DocumentIndex;
}> {
  const { service, watcher, events, tmp } = await makeService();
  const path = await writeFixture(tmp, name);

  const opened = await service.open(path);
  expect(opened.isRight()).toBe(true);
  if (!opened.isRight()) throw new Error('no abrió');

  return {
    commands: new CommandService(service),
    service,
    watcher,
    events,
    sessionId: opened.value.sessionId,
    path,
    index: () => {
      const target = service.getEditTarget(opened.value.sessionId);
      if (!target.isRight()) throw new Error('La sesión desapareció');
      return DocumentIndex.build(target.value.document.root);
    },
  };
}

/** Nombre del primer ancestro con `Name`. */
function ancestorName(node: RdlcNode): string | undefined {
  let current = node.parent;
  while (current) {
    const name = current.attribute('Name');
    if (name) return name;
    current = current.parent;
  }
  return undefined;
}

describe('F1 · portapapeles (copy / cut / paste)', () => {
  it('copiar + pegar crea un clon con nombre nuevo y el undo lo quita', async () => {
    const { commands, service, sessionId, index } = await openFixture();

    const copied = commands.copy(sessionId, ['Textbox23']);
    expect(copied.isRight()).toBe(true);

    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isRight()).toBe(true);
    if (!pasted.isRight() || !pasted.value.ok) return;
    const newId = pasted.value.id;
    expect(newId).toBeDefined();
    if (!newId) return;
    expect(newId).not.toBe('Textbox23');
    expect(index().get(newId)).toBeDefined();

    // El original sigue intacto en su sitio.
    expect(index().get('Textbox23')).toBeDefined();

    // El undo del pegado quita el clon (y el portapapeles sigue lleno).
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(index().get(newId)).toBeUndefined();
    expect(commands.paste(sessionId, { kind: 'body' }, 0).isRight()).toBe(true);
  });

  it('pegar en el cuerpo un item de celda materializa Width/Height (RB estira sin tamaño)', async () => {
    const { commands, service, sessionId, index } = await openFixture();

    // Un textbox dentro de una celda no declara longitudes (las pone la celda).
    let cellTextbox: string | undefined;
    for (const name of index().names()) {
      const node = index().get(name);
      if (!node || node.tagName !== 'Textbox' || node.child('Width')) continue;
      let current = node.parent;
      while (current && current.tagName !== 'TablixCell') current = current.parent;
      if (current) {
        cellTextbox = name;
        break;
      }
    }
    expect(cellTextbox).toBeDefined();
    if (!cellTextbox) return;

    expect(commands.copy(sessionId, [cellTextbox]).isRight()).toBe(true);
    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isRight()).toBe(true);
    if (!pasted.isRight() || !pasted.value.ok || !pasted.value.id) return;

    const clone = index().get(pasted.value.id);
    expect(clone?.child('Top')?.text()).toBe('0cm');
    expect(clone?.child('Left')?.text()).toBe('0cm');
    expect(clone?.child('Width')?.text()).toBe('5cm');
    expect(clone?.child('Height')?.text()).toBe('1cm');

    // El original sigue sin longitudes (dentro de su celda).
    expect(index().get(cellTextbox)?.child('Width')).toBeUndefined();
    expect(service.versionOf(sessionId)).toBeGreaterThan(0);
  });

  it('pegar varias veces da nombres distintos', async () => {
    const { commands, sessionId, index } = await openFixture();

    expect(commands.copy(sessionId, ['Textbox23']).isRight()).toBe(true);

    const first = commands.paste(sessionId, { kind: 'body' }, 0);
    const second = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(first.isRight() && second.isRight()).toBe(true);
    if (!first.isRight() || !first.value.ok || !second.isRight() || !second.value.ok) return;

    const firstId = first.value.id;
    const secondId = second.value.id;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    if (!firstId || !secondId) return;
    expect(firstId).not.toBe(secondId);
    expect(index().get(firstId)).toBeDefined();
    expect(index().get(secondId)).toBeDefined();
  });

  it('pegar dentro de un rectángulo deja el item como hijo suyo', async () => {
    const { commands, service, sessionId, index } = await openFixture();

    expect(commands.copy(sessionId, ['Textbox23']).isRight()).toBe(true);

    const pasted = commands.paste(sessionId, { kind: 'rectangle', id: 'Rectangle1' }, 0);
    expect(pasted.isRight()).toBe(true);
    if (!pasted.isRight() || !pasted.value.ok || !pasted.value.id) return;
    const pastedId = pasted.value.id;

    const node = index().get(pastedId);
    expect(node).toBeDefined();
    if (node) expect(ancestorName(node)).toBe('Rectangle1');

    // El índice del documento lo marca como anidado.
    expect(index().isNested(pastedId)).toBe(true);
    expect(service.versionOf(sessionId)).toBeGreaterThan(0);
  });

  it('cortar copia y elimina; el undo devuelve el original a su sitio', async () => {
    const { commands, sessionId, index } = await openFixture();

    const cut = commands.cut(sessionId, ['Textbox23']);
    expect(cut.isRight()).toBe(true);
    expect(index().get('Textbox23')).toBeUndefined();

    // El portapapeles tiene el item cortado: se puede pegar en otro sitio.
    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isRight()).toBe(true);

    // Deshacer el pegado y luego el corte.
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(index().get('Textbox23')).toBeDefined();
  });

  it('multiselección: copiar y pegar varios crea los clones en un solo undo', async () => {
    const { commands, sessionId, index } = await openFixture();

    expect(commands.copy(sessionId, ['Textbox23', 'Textbox120']).isRight()).toBe(true);

    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isRight()).toBe(true);
    if (!pasted.isRight() || !pasted.value.ok) return;
    const ids = pasted.value.ids ?? [];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(index().get(id)).toBeDefined();

    // Un solo undo quita los dos clones; los originales siguen intactos.
    expect(commands.undo(sessionId).isRight()).toBe(true);
    for (const id of ids) expect(index().get(id)).toBeUndefined();
    expect(index().get('Textbox23')).toBeDefined();
    expect(index().get('Textbox120')).toBeDefined();
  });

  it('cortar varios es un solo paso: un undo devuelve los dos a su sitio', async () => {
    const { commands, sessionId, index } = await openFixture();

    const cut = commands.cut(sessionId, ['Textbox23', 'Textbox120']);
    expect(cut.isRight()).toBe(true);
    expect(index().get('Textbox23')).toBeUndefined();
    expect(index().get('Textbox120')).toBeUndefined();

    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(index().get('Textbox23')).toBeDefined();
    expect(index().get('Textbox120')).toBeDefined();
  });

  it('pegar sin haber copiado se rechaza con un mensaje claro', async () => {
    const { commands, sessionId } = await openFixture();

    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isLeft()).toBe(true);
    if (pasted.isLeft()) {
      expect(pasted.value.code).toBe('E_COMMAND_REJECTED');
      expect(pasted.value.errorMessage).toContain('portapapeles');
    }
  });

  it('la recarga externa descarta el portapapeles (nodos del documento viejo)', async () => {
    const { commands, watcher, events, sessionId, path } = await openFixture();

    expect(commands.copy(sessionId, ['Textbox23']).isRight()).toBe(true);

    const external = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');
    const future = new Date(Date.now() + 5_000);
    await utimes(path, future, future);

    const before = events.sent.filter((e) => e.channel === IPC_EVENTS.documentChanged).length;
    watcher.trigger(path);
    await vi.waitFor(() => {
      const after = events.sent.filter((e) => e.channel === IPC_EVENTS.documentChanged).length;
      expect(after).toBeGreaterThan(before);
    });

    const pasted = commands.paste(sessionId, { kind: 'body' }, 0);
    expect(pasted.isLeft()).toBe(true);
    if (pasted.isLeft()) expect(pasted.value.errorMessage).toContain('portapapeles');
  });
});
