import { afterEach, describe, expect, it } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import { DocumentIndex } from '../../src/domain/document/index/DocumentIndex.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/**
 * Contrato de `CommandResult` desde el punto de vista del front:
 *
 * - los comandos que **crean** item devuelven su `id` (para seleccionarlo),
 * - el nombre lo decide el backend (su índice está siempre al día), así que dos
 *   inserciones seguidas nunca chocan aunque el front no haya visto la snapshot.
 */

afterEach(cleanupTempDirs);

async function openSession(): Promise<{
  commands: CommandService;
  service: Awaited<ReturnType<typeof makeService>>['service'];
  sessionId: string;
  index: () => DocumentIndex;
}> {
  const { service, tmp } = await makeService();
  const path = await writeFixture(tmp, 'PalletOutput.rdlc');

  const opened = await service.open(path);
  if (!opened.isRight()) throw new Error('no abrió');
  const sessionId = opened.value.sessionId;

  return {
    commands: new CommandService(service),
    service,
    sessionId,
    index: () => {
      const target = service.getEditTarget(sessionId);
      if (!target.isRight()) throw new Error('La sesión desapareció');
      return DocumentIndex.build(target.value.document.root);
    },
  };
}

const NEW_TEXTBOX = {
  kind: 'textbox',
  top: { value: 1, unit: 'cm' },
  left: { value: 1, unit: 'cm' },
  width: { value: 5, unit: 'cm' },
  height: { value: 1, unit: 'cm' },
  text: '',
} as const;

describe('CommandResult · id del item creado', () => {
  it('insertItem devuelve el id del item nuevo', async () => {
    const { commands, sessionId, index } = await openSession();

    const result = commands.execute(sessionId, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: NEW_TEXTBOX,
    });

    expect(result.isRight()).toBe(true);
    if (!result.isRight() || !result.value.ok) return;
    expect(result.value.id).toBeDefined();
    expect(index().get(result.value.id!)).toBeDefined();
  });

  it('duplicateItem devuelve el id del clon (Ctrl+D selecciona la copia)', async () => {
    const { commands, sessionId, index } = await openSession();

    const result = commands.execute(sessionId, { cmd: 'duplicateItem', id: 'Textbox25' });

    expect(result.isRight()).toBe(true);
    if (!result.isRight() || !result.value.ok) return;
    expect(result.value.id).toBeDefined();
    expect(result.value.id).not.toBe('Textbox25');
    expect(index().get(result.value.id!)).toBeDefined();
  });

  it('dos inserciones seguidas sin nombre (doble click) reciben nombres distintos', async () => {
    const { commands, sessionId, index } = await openSession();

    const first = commands.execute(sessionId, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: NEW_TEXTBOX,
    });
    const second = commands.execute(sessionId, {
      cmd: 'insertItem',
      scope: { kind: 'body' },
      index: 0,
      item: NEW_TEXTBOX,
    });

    expect(first.isRight() && second.isRight()).toBe(true);
    if (!first.isRight() || !first.value.ok || !second.isRight() || !second.value.ok) return;

    expect(first.value.id).toBeDefined();
    expect(second.value.id).toBeDefined();
    expect(first.value.id).not.toBe(second.value.id);
    expect(index().get(first.value.id!)).toBeDefined();
    expect(index().get(second.value.id!)).toBeDefined();
  });
});
