import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { app, BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { ElectronEventBusAdapter } from './infrastructure/events/ElectronEventBusAdapter.js';
import { IpcController } from './presentation/ipc/IpcController.js';

log.initialize();

let mainWindow: BrowserWindow | null = null;

/** Fichero inicial: `RDLC_OPEN` (dev) o primer argumento `.rdlc` (CLI). */
function findInitialFile(): string | null {
  const fromEnv = process.env['RDLC_OPEN'];
  if (fromEnv) return fromEnv;
  const fromArgs = process.argv.slice(1).find((arg) => arg.toLowerCase().endsWith('.rdlc'));
  return fromArgs ?? null;
}

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

  // Diagnóstico: la consola del renderer también va al log del main.
  window.webContents.on('console-message', (event) => {
    log.info('[renderer]', event.message);
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const bench = process.env['RDLC_BENCH'];
  if (devServerUrl) {
    await window.loadURL(bench ? `${devServerUrl}/?bench=${encodeURIComponent(bench)}` : devServerUrl);
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
  ipc.setPendingOpen(findInitialFile());
  ipc.register(() => mainWindow);

  mainWindow = await createWindow();
  log.info('RDLC Report Designer iniciado');

  await maybeCaptureScreenshot(mainWindow);
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

/**
 * Dev/diagnóstico: `RDLC_SHOT=<ruta.png>` captura la ventana tras cargar
 * (con `RDLC_SHOT_DELAY` ms de espera) y sale si `RDLC_SHOT_QUIT=1`.
 */
async function maybeCaptureScreenshot(window: BrowserWindow): Promise<void> {
  const shotPath = process.env['RDLC_SHOT'];
  if (!shotPath) return;

  const delay = Number(process.env['RDLC_SHOT_DELAY'] ?? 5000);
  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    const image = await window.webContents.capturePage();
    await writeFile(shotPath, image.toPNG());
    log.info(`Captura guardada en ${shotPath}`);
  } catch (error) {
    log.error('No se pudo capturar la pantalla', error);
  }

  if (process.env['RDLC_SHOT_QUIT'] === '1') app.quit();
}
