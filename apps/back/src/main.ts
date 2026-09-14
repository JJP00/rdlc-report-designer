import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { app, BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { ElectronEventBusAdapter } from './infrastructure/events/ElectronEventBusAdapter.js';
import { IpcController } from './presentation/ipc/IpcController.js';

log.initialize();

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    show: false,
    title: 'RDLC Report Designer',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  const nest = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const events = nest.get(ElectronEventBusAdapter);
  events.attach(() => mainWindow);

  const ipc = nest.get(IpcController);
  ipc.register(() => mainWindow);

  mainWindow = await createWindow();
  log.info('RDLC Report Designer iniciado');
}

void app.whenReady().then(bootstrap);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().then((window) => {
      mainWindow = window;
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => log.error(error));
process.on('unhandledRejection', (error) => log.error(error));
