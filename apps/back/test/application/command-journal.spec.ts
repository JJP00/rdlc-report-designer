import { readFile, utimes, writeFile } from 'node:fs/promises';
import { IPC_EVENTS } from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/**
 * Journal de comandos (undo/redo) atado al documento vivo.
 *
 * Los inversos guardan **nodos** del documento en memoria: si la sesión recarga
 * el fichero (edición externa) esos nodos quedan desprendidos. Aplicarlos
 * entonces no hace nada visible (o peor: toca un árbol fantasma), así que el
 * journal debe descartarse al cambiar el documento.
 */

afterEach(cleanupTempDirs);

const INSERT = {
  cmd: 'insertItem',
  scope: { kind: 'body' },
  index: 0,
  item: {
    kind: 'textbox',
    name: 'TextboxNuevo',
    top: { value: 1, unit: 'cm' },
    left: { value: 1, unit: 'cm' },
    width: { value: 5, unit: 'cm' },
    height: { value: 1, unit: 'cm' },
    text: 'Hola',
  },
} as const;

async function openFixture(): Promise<{
  commands: CommandService;
  service: Awaited<ReturnType<typeof makeService>>['service'];
  watcher: Awaited<ReturnType<typeof makeService>>['watcher'];
  events: Awaited<ReturnType<typeof makeService>>['events'];
  sessionId: string;
  path: string;
}> {
  const { service, watcher, events, tmp } = await makeService();
  const path = await writeFixture(tmp, 'PalletOutput.rdlc');

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
  };
}

describe('F1 · journal de comandos', () => {
  it('las snapshots internas se marcan como internas (el front no las cuenta como recarga)', async () => {
    const { commands, events, sessionId } = await openFixture();

    expect(commands.execute(sessionId, INSERT).isRight()).toBe(true);

    const snapshots = events
      .payloads<{ reason?: string }>(IPC_EVENTS.documentChanged)
      .filter((event) => event.reason !== undefined);
    expect(snapshots[snapshots.length - 1]?.reason).toBe('internal');
  });

  it('deshace y rehace con normalidad mientras el documento no cambie', async () => {
    const { commands, service, sessionId } = await openFixture();

    const inserted = commands.execute(sessionId, INSERT);
    expect(inserted.isRight()).toBe(true);
    expect(service.versionOf(sessionId)).toBeGreaterThan(1);

    const undone = commands.undo(sessionId);
    expect(undone.isRight()).toBe(true);
    const target = service.getEditTarget(sessionId);
    expect(target.isRight()).toBe(true);
    if (target.isRight()) expect(target.value.index.get('TextboxNuevo')).toBeUndefined();

    const redone = commands.redo(sessionId);
    expect(redone.isRight()).toBe(true);
    const after = service.getEditTarget(sessionId);
    if (after.isRight()) expect(after.value.index.get('TextboxNuevo')).toBeDefined();
  });

  it('deshacer hasta el estado original deja la sesión limpia (dirty false)', async () => {
    const { commands, events, sessionId } = await openFixture();
    const dirtyEvents = (): { dirty: boolean }[] =>
      events.payloads<{ dirty: boolean }>(IPC_EVENTS.dirtyChanged);

    expect(commands.execute(sessionId, INSERT).isRight()).toBe(true);
    expect(dirtyEvents().at(-1)).toEqual({ sessionId, dirty: true });

    // Deshacer deja el XML byte a byte como estaba: no hay nada que guardar.
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(dirtyEvents().at(-1)).toEqual({ sessionId, dirty: false });

    // Rehacer vuelve a ensuciar.
    expect(commands.redo(sessionId).isRight()).toBe(true);
    expect(dirtyEvents().at(-1)).toEqual({ sessionId, dirty: true });
  });

  it('el journal sigue vivo tras guardar (no cambia el documento)', async () => {
    const { commands, service, sessionId } = await openFixture();

    expect(commands.execute(sessionId, INSERT).isRight()).toBe(true);
    expect((await service.save(sessionId)).isRight()).toBe(true);

    expect(commands.undo(sessionId).isRight()).toBe(true);
    const target = service.getEditTarget(sessionId);
    if (target.isRight()) expect(target.value.index.get('TextboxNuevo')).toBeUndefined();
  });

  it('descarta el journal si el fichero se recarga: el undo no escribe valores viejos', async () => {
    const { commands, service, watcher, events, sessionId, path } = await openFixture();

    // Edición guardada: el run 0 de Textbox25 pasa de '(' a 'MIO'.
    const edited = commands.execute(sessionId, {
      cmd: 'setText',
      id: 'Textbox25',
      p: 0,
      r: 0,
      value: 'MIO',
    });
    expect(edited.isRight()).toBe(true);
    expect((await service.save(sessionId)).isRight()).toBe(true);

    // Fuera, ese mismo run cambia a '[EXTERNO]' (y hay que recargar).
    const external = (await readFile(path, 'utf8')).replace(
      '<Value>MIO</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');
    // mtime futura: garantiza que el watcher no lo tome por el eco de nuestro
    // guardado (el filtro compara mtime con la última escritura propia).
    const future = new Date(Date.now() + 5_000);
    await utimes(path, future, future);

    const before = events.sent.filter((e) => e.channel === IPC_EVENTS.documentChanged).length;
    watcher.trigger(path);
    await vi.waitFor(() => {
      const after = events.sent.filter((e) => e.channel === IPC_EVENTS.documentChanged).length;
      expect(after).toBeGreaterThan(before);
    });

    // El undo ya no tiene nada que deshacer: sin journal no puede reescribir el
    // documento vivo con el valor anterior de un árbol que ya no existe.
    expect(commands.undo(sessionId).isRight()).toBe(true);

    const target = service.getEditTarget(sessionId);
    expect(target.isRight()).toBe(true);
    if (target.isRight()) {
      const runValue = target.value.index
        .get('Textbox25')
        ?.child('Paragraphs')
        ?.child('Paragraph')
        ?.child('TextRuns')
        ?.child('TextRun')
        ?.child('Value')
        ?.text();
      expect(runValue).toBe('[EXTERNO]');
    }

    // Nada mutado: el guardado reescribe los mismos bytes.
    const saved = await service.save(sessionId);
    expect(saved.isRight()).toBe(true);
    if (saved.isRight()) expect(saved.value.bytesIdentical).toBe(true);
  });
});
