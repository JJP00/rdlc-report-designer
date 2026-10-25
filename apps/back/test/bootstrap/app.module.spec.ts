import { NestFactory } from '@nestjs/core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test de bootstrap: monta el contexto Nest completo con `electron` mockeado.
 * Caza errores del grafo de DI (el `@Inject(token)` explícito obligatorio,
 * ver ADR 0002) sin arrancar Electron.
 */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  app: {
    getPath: () => join(tmpdir(), 'rdlc-e2e-userData'),
    getLocale: () => 'es-ES',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  },
}));

describe('F0 · bootstrap Nest (hexágono)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('crea el contexto de aplicación con el grafo de DI completo', async () => {
    const { AppModule } = await import('../../src/app.module.js');
    const { IpcController } = await import('../../src/presentation/ipc/IpcController.js');

    const context = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    const controller = context.get(IpcController);
    expect(controller).toBeDefined();

    await context.close();
  });

  it('el handler de idioma responde con el grafo real (DI + LocaleRuntime + IPC)', async () => {
    // Regresión del bug real: una inyección por tipo sin `@Inject` llega
    // `undefined` en el build (esbuild no emite `design:paramtypes`), el
    // contexto monta igual… y el handler revienta al invocarse.
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const electron = await import('electron');
    (
      electron.ipcMain.handle as unknown as { mockImplementation: (impl: unknown) => void }
    ).mockImplementation((channel: string, handler: never) => {
      handlers.set(channel, handler);
    });

    const { IPC_CHANNELS } = await import('@rdlc-designer/contracts');
    const { AppModule } = await import('../../src/app.module.js');
    const { IpcController } = await import('../../src/presentation/ipc/IpcController.js');

    const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
    context.get(IpcController).register(() => null);

    const handler = handlers.get(IPC_CHANNELS.getLocale);
    expect(handler).toBeDefined();
    // `getLocale` mockeado devuelve 'es-ES' (y no hay preferencia guardada):
    // el idioma efectivo debe ser español, no el fallback inglés.
    const result = (await handler!({}, undefined)) as { ok: boolean; locale: string };
    expect(result).toMatchObject({ ok: true, locale: 'es' });

    await context.close();
  });
});
