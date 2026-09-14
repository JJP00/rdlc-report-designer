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

/** Arrastre con eventos de ratón reales (dev/QA): mouseDown → moves → mouseUp. */
async function performDrag(
  window: BrowserWindow,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  const steps = 12;
  window.webContents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 60));

  for (let step = 1; step <= steps; step += 1) {
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: Math.round(x1 + ((x2 - x1) * step) / steps),
      y: Math.round(y1 + ((y2 - y1) * step) / steps),
      button: 'left',
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  window.webContents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 });
  log.info(`[qa] drag ${x1},${y1} → ${x2},${y2}`);
  await new Promise((resolve) => setTimeout(resolve, 700));
}

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
    // Arrastre simulado para reproducir bugs de interacción: "x1,y1,x2,y2".
    const drag = process.env['RDLC_SHOT_DRAG'];
    if (drag) {
      const [x1, y1, x2, y2] = drag.split(',').map(Number);
      await performDrag(window, x1 ?? 0, y1 ?? 0, x2 ?? 0, y2 ?? 0);
    }

    // Preparación opcional (p. ej. abrir paneles/diálogos) antes de capturar.
    const script = process.env['RDLC_SHOT_SCRIPT'];
    if (script) {
      await window.webContents.executeJavaScript(script);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const image = await window.webContents.capturePage();
    await writeFile(shotPath, image.toPNG());
    log.info(`Captura guardada en ${shotPath}`);
  } catch (error) {
    log.error('No se pudo capturar la pantalla', error);
  }

  if (process.env['RDLC_SHOT_QUIT'] === '1') app.quit();
}
