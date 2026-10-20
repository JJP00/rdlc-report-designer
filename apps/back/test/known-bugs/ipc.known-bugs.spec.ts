import 'reflect-metadata';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@rdlc-designer/contracts';
import { dialog } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IpcController } from '../../src/presentation/ipc/IpcController.js';
import { LocaleRuntime } from '../../src/infrastructure/locale/LocaleRuntime.js';
import { right } from '../../src/shared/either.js';

/**
 * BUG-50 — El renderer solo puede abrir/crear/guardar como en rutas que el
 * usuario eligió con un diálogo nativo (o el fichero de arranque del CLI). Antes
 * las rutas llegaban crudas del renderer: con el renderer comprometido,
 * `createNew`/`saveAs` podían escribir (y `openFile` leer) cualquier fichero.
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

/** Registra un `IpcController` con dobles mínimos y deja los handlers en el mapa. */
function registerController(
  overrides: {
    saveAs?: (sessionId: string, path: string) => Promise<unknown>;
    open?: (path: string) => Promise<unknown>;
    recents?: string[];
  } = {},
): void {
  ipcHandlers.clear();
  const sessions = {
    saveAs: overrides.saveAs ?? (async () => right({ path: 'x', bytesIdentical: false })),
    createNew: async () => right({ sessionId: 's', projection: {} }),
    open: overrides.open ?? (async () => right({ sessionId: 's', projection: {} })),
  } as unknown as ConstructorParameters<typeof IpcController>[0];
  const recents = {
    list: async () => overrides.recents ?? [],
    add: async (path: string) => [path],
  } as unknown as ConstructorParameters<typeof IpcController>[3];
  // Idioma fijo (`RDLC_LOCALE`) para que los títulos nativos sean estables.
  const locale = new LocaleRuntime(
    { read: async () => null, write: async () => undefined } as never,
    'en',
    'es-ES',
  );
  const controller = new IpcController(sessions, {} as never, {} as never, recents, locale);
  controller.register(() => null);
}

async function invoke(channel: string, payload: unknown): Promise<Record<string, unknown>> {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`sin handler para ${channel}`);
  return (await handler({}, payload)) as Record<string, unknown>;
}

const arbitraryPath = join(tmpdir(), 'reporte-arbitrario.rdlc');

describe('BUG-50 rutas del renderer fuera de un diálogo nativo', () => {
  it('saveAs rechaza la ruta arbitraria y no llega a escribir', async () => {
    let called = false;
    registerController({
      saveAs: async () => {
        called = true;
        return right({ path: arbitraryPath, bytesIdentical: false });
      },
    });

    const result = await invoke(IPC_CHANNELS.saveAs, {
      sessionId: 's',
      path: arbitraryPath,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('E_COMMAND_REJECTED');
    expect(called).toBe(false);
  });

  it('createNew rechaza la ruta arbitraria y no llega a escribir', async () => {
    registerController();

    const result = await invoke(IPC_CHANNELS.createNew, { path: arbitraryPath });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('E_COMMAND_REJECTED');
  });

  it('saveAs acepta la ruta que devolvió el diálogo de guardado', async () => {
    const target = join(tmpdir(), 'elegido-en-dialogo.rdlc');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: target,
    } as never);
    registerController();

    const picked = await invoke(IPC_CHANNELS.pickSavePath, {});
    expect(picked.path).toBe(target);

    const saved = await invoke(IPC_CHANNELS.saveAs, { sessionId: 's', path: target });
    expect(saved.ok).toBe(true);
  });

  it('openFile acepta una ruta de recientes (la lista la sirve el backend)', async () => {
    const recent = join(tmpdir(), 'reciente.rdlc');
    registerController({ recents: [recent] });

    const result = await invoke(IPC_CHANNELS.openFile, { path: recent });

    expect(result.ok).toBe(true);
  });

  it('openFile rechaza una ruta que no salió del diálogo ni es reciente', async () => {
    registerController();

    const result = await invoke(IPC_CHANNELS.openFile, { path: arbitraryPath });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('E_COMMAND_REJECTED');
  });
});
