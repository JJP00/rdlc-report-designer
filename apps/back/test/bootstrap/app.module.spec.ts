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
});
