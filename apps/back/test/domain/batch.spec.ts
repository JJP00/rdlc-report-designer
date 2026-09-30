import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import { makeService, cleanupTempDirs, writeFixture } from '../application/test-utils.js';

/** U3 · comando `batch`: varios comandos en un solo paso de undo. */

afterEach(cleanupTempDirs);

async function openFixture(): Promise<{
  commands: CommandService;
  service: Awaited<ReturnType<typeof makeService>>['service'];
  sessionId: string;
  path: string;
  original: Buffer;
}> {
  const { service, tmp } = await makeService();
  const path = await writeFixture(tmp, 'PalletOutput.rdlc');
  const opened = await service.open(path);
  if (!opened.isRight()) throw new Error('no abrió');
  return {
    commands: new CommandService(service),
    service,
    sessionId: opened.value.sessionId,
    path,
    original: await readFile(path),
  };
}

const styled = (id: string, color: string): { cmd: 'setStyle'; id: string; style: object } => ({
  cmd: 'setStyle',
  id,
  style: { color },
});

describe('U3 · batch (edición en lote)', () => {
  it('aplica varios comandos con un único undo byte-exacto', async () => {
    const { commands, sessionId, path, original } = await openFixture();

    const applied = commands.execute(sessionId, {
      cmd: 'batch',
      commands: [styled('Textbox25', '#ff0000'), styled('Textbox28', '#00ff00')],
    });
    expect(applied.isRight()).toBe(true);

    // Deshacer una sola vez devuelve el fichero a sus bytes originales.
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(await readFile(path)).toEqual(original);
  });

  it('si un comando de dentro falla, no deja nada aplicado (atómico)', async () => {
    const { commands, sessionId, path, original } = await openFixture();

    const applied = commands.execute(sessionId, {
      cmd: 'batch',
      commands: [styled('Textbox25', '#ff0000'), styled('NoExiste', '#00ff00')],
    });
    expect(applied.isLeft()).toBe(true);

    // El primero se revirtió: bytes idénticos y el documento sigue válido.
    expect(await readFile(path)).toEqual(original);
  });

  it('el rehacer reaplica el lote completo', async () => {
    const { commands, service, sessionId } = await openFixture();

    expect(
      commands.execute(sessionId, {
        cmd: 'batch',
        commands: [styled('Textbox25', '#ff0000'), styled('Textbox28', '#00ff00')],
      }).isRight(),
    ).toBe(true);
    expect(commands.undo(sessionId).isRight()).toBe(true);
    expect(commands.redo(sessionId).isRight()).toBe(true);

    const target = service.getEditTarget(sessionId);
    expect(target.isRight()).toBe(true);
    if (!target.isRight()) return;
    expect(target.value.index.get('Textbox25')?.child('Style')?.child('Color')?.text()).toBe(
      '#ff0000',
    );
  });
});
