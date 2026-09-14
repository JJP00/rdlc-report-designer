import type { BrowserWindow } from 'electron';
import type { EventBusPort } from '../../application/ports/out/EventBusPort.js';

/**
 * Adaptador de salida: eventos backend → front por `webContents.send`.
 * `attach` se llama al crear la ventana principal (main.ts).
 */
export class ElectronEventBusAdapter implements EventBusPort {
  private getWindow: () => BrowserWindow | null = () => null;

  attach(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;
  }

  send(channel: string, payload: unknown): void {
    this.getWindow()?.webContents.send(channel, payload);
  }
}
