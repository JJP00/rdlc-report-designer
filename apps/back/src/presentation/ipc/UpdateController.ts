import { IPC_CHANNELS, type UpdateStateResult } from '@rdlc-designer/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { ipcMain, type BrowserWindow } from 'electron';
import { UpdateService } from '../../application/services/UpdateService.js';

/**
 * Adaptador de entrada de las actualizaciones: `ipcMain.handle` → `UpdateService`.
 * Ningún canal recibe datos del renderer (la versión ofrecida y la URL de la
 * release viven en el main), así que no hay nada que validar con zod.
 */
@Injectable()
export class UpdateController {
  // `@Inject` explícito: el build (esbuild) no emite `design:paramtypes`.
  constructor(@Inject(UpdateService) private readonly updates: UpdateService) {}

  register(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle(IPC_CHANNELS.getUpdateState, (): UpdateStateResult => this.result());

    ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (): Promise<UpdateStateResult> => ({
      ok: true,
      state: await this.updates.checkManually(),
    }));

    ipcMain.handle(IPC_CHANNELS.downloadUpdate, async (): Promise<UpdateStateResult> => ({
      ok: true,
      state: await this.updates.download(),
    }));

    // Reiniciar pasa por la guarda de cambios sin guardar: se pide cerrar la
    // ventana y, si el usuario confirma, el main instala y relanza al quedarse
    // sin ventanas (`window-all-closed`). Si cancela, `cancelRestart` lo anula.
    ipcMain.handle(IPC_CHANNELS.installUpdate, (): UpdateStateResult => {
      if (this.updates.requestInstall()) getWindow()?.close();
      return this.result();
    });

    ipcMain.handle(IPC_CHANNELS.skipUpdateVersion, async (): Promise<UpdateStateResult> => ({
      ok: true,
      state: await this.updates.skip(),
    }));

    ipcMain.handle(IPC_CHANNELS.openReleasePage, () => this.updates.openReleasePage());
  }

  private result(): UpdateStateResult {
    return { ok: true, state: this.updates.getState() };
  }
}
