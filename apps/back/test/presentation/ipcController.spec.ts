import 'reflect-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC_CHANNELS, IPC_EVENTS } from '@rdlc-designer/contracts';
import { describe, expect, it, vi } from 'vitest';
import { IpcController } from '../../src/presentation/ipc/IpcController.js';
import { LocaleRuntime } from '../../src/infrastructure/locale/LocaleRuntime.js';
import { left, right } from '../../src/shared/either.js';
import { UnknownSessionError } from '../../src/shared/domainError.js';

/**
 * Apertura pedida **desde fuera** (2.ª instancia de la asociación de ficheros:
 * doble clic en el Explorador con la app ya abierta): la ruta se autoriza como
 * el fichero de arranque (BUG-50) y se entrega al renderer — en vivo por
 * `openRequested`, o encolada si aún no ha montado (viaja con `pendingOpen`).
 */

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  app: { getPath: () => tmpdir() },
}));

interface Sent {
  channel: string;
  payload: unknown;
}

/** Registra un `IpcController` con dobles mínimos y una ventana que captura envíos. */
function registerController(extraSessions: Record<string, unknown> = {}): {
  controller: IpcController;
  sent: Sent[];
} {
  ipcHandlers.clear();
  const sessions = {
    open: async () => right({ sessionId: 's', projection: {} }),
    saveAs: async () => right({ path: 'x', bytesIdentical: false }),
    createNew: async () => right({ sessionId: 's', projection: {} }),
    ...extraSessions,
  } as unknown as ConstructorParameters<typeof IpcController>[0];
  const recents = {
    list: async () => [],
    add: async (path: string) => [path],
  } as unknown as ConstructorParameters<typeof IpcController>[3];
  // Idioma fijo (`RDLC_LOCALE`) para que los títulos nativos sean estables.
  const locale = new LocaleRuntime(
    { read: async () => null, write: async () => undefined } as never,
    'en',
    'es-ES',
  );
  const controller = new IpcController(sessions, {} as never, {} as never, recents, locale);
  const sent: Sent[] = [];
  const window = {
    webContents: {
      send: (channel: string, payload: unknown): void => {
        sent.push({ channel, payload });
      },
    },
  };
  controller.register(() => window as never);
  return { controller, sent };
}

async function invoke(channel: string, payload: unknown): Promise<Record<string, unknown>> {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`sin handler para ${channel}`);
  return (await handler({}, payload)) as Record<string, unknown>;
}

const externalPath = join(tmpdir(), 'externo-reporte.rdlc');

describe('rdlc:lint', () => {
  it('devuelve los hallazgos del servicio como { ok: true, findings }', async () => {
    const findings = [
      {
        rule: 'unbalancedBracket',
        severity: 'error',
        itemId: 'Title',
        location: 'Value',
        params: { char: '(', index: 12 },
      },
    ];
    const { controller } = registerController({ lintOf: () => right(findings) });
    expect(controller).toBeDefined();

    const result = await invoke(IPC_CHANNELS.lint, { sessionId: 's' });

    expect(result).toEqual({ ok: true, findings });
  });

  it('una sesión desconocida responde con error, no con findings', async () => {
    registerController({ lintOf: () => left(UnknownSessionError.create('nope')) });

    const result = await invoke(IPC_CHANNELS.lint, { sessionId: 'nope' });

    expect(result.ok).toBe(false);
    expect(result['code']).toBe('E_NOT_FOUND');
  });
});

describe('apertura desde fuera (asociación de ficheros)', () => {
  it('antes del montaje se encola y llega con la entrega inicial', async () => {
    const { controller, sent } = registerController();
    controller.requestOpen(externalPath);
    expect(sent).toEqual([]);

    const result = await invoke(IPC_CHANNELS.pendingOpen, {});

    expect(result).toEqual({ ok: true, path: null, paths: [externalPath] });
  });

  it('con el renderer montado, la apertura va en vivo por openRequested', async () => {
    const { controller, sent } = registerController();
    await invoke(IPC_CHANNELS.pendingOpen, {});

    controller.requestOpen(externalPath);

    expect(sent).toEqual([{ channel: IPC_EVENTS.openRequested, payload: { path: externalPath } }]);
  });

  it('la ruta externa queda autorizada para openFile (BUG-50)', async () => {
    const { controller } = registerController();
    controller.requestOpen(externalPath);

    const result = await invoke(IPC_CHANNELS.openFile, { path: externalPath });

    expect(result.ok).toBe(true);
  });
});
