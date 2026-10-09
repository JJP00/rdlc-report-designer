import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { app, BrowserWindow, dialog, ipcMain, Menu, session, type WebContents } from 'electron';
import log from 'electron-log/main';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC_CHANNELS, IPC_EVENTS, windowCloseConfirmationSchema } from '@rdlc-designer/contracts';
import { AppModule } from './app.module.js';
import { ElectronEventBusAdapter } from './infrastructure/events/ElectronEventBusAdapter.js';
import { IpcController } from './presentation/ipc/IpcController.js';
import { createWindowLifecycle, type WindowLifecycle } from './lifecycle/windowLifecycle.js';
import { isNavigationAllowed, isPermissionAllowed } from './security/navigation.js';

log.initialize();

let mainWindow: BrowserWindow | null = null;
/** URL con la que se carga el renderer: la única navegación permitida (T2). */
let appUrl = '';

/** Ciclo de vida (cierre sin acuse, render caído, «no responde») de la ventana actual. */
let lifecycle: WindowLifecycle | null = null;

/**
 * Endurecimiento común a todo `webContents` (T2): sin ventanas nuevas, sin
 * navegación fuera de la URL de la app y sin `<webview>`. Un `.rdlc` con un
 * enlace no puede sacar al renderer del editor.
 */
function hardenWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  contents.on('will-navigate', (event, url) => {
    if (isNavigationAllowed(url, appUrl)) return;
    event.preventDefault();
    log.warn(`[seguridad] navegación bloqueada: ${url}`);
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    log.warn('[seguridad] webview bloqueado');
  });
}

/** Fichero inicial: `RDLC_OPEN` (dev) o primer argumento `.rdlc`/`.rdl` (CLI). */
function findInitialFile(): string | null {
  const fromEnv = process.env['RDLC_OPEN'];
  if (fromEnv) return fromEnv;
  const fromArgs = process.argv.slice(1).find((arg) => /\.(rdlc|rdl)$/i.test(arg));
  return fromArgs ?? null;
}

async function createWindow(): Promise<BrowserWindow> {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const bench = process.env['RDLC_BENCH'];
  const rendererFile = join(import.meta.dirname, '../renderer/index.html');
  appUrl = devServerUrl ?? pathToFileURL(rendererFile).href;

  const window = new BrowserWindow({
    width: 1500,
    height: 950,
    show: false,
    title: 'RDLC Report Designer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload en CommonJS y **bundleado** (T2): el sandbox no puede
      // `require` paquetes de `node_modules`, solo `electron`.
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });

  // Guarda de cierre: el SO pide cerrar (X, Alt+F4, quit) y **decide el front**
  // (cambios sin guardar). Si el renderer aún no ha cargado, no hay trabajo que
  // perder: se cierra directamente. El modo benchmark no abre documentos y se
  // deja cerrar sin pasar por el front.
  const isBench = bench !== undefined;
  const windowLifecycle = createWindowLifecycle({
    isBench,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    showDialog: async (options) => (await dialog.showMessageBox(window, options)).response,
    closeWindow: () => window.close(),
    destroyWindow: () => window.destroy(),
    reload: () => window.webContents.reload(),
    isDestroyed: () => window.isDestroyed(),
    log,
  });
  lifecycle = windowLifecycle;
  window.on('close', (event) => {
    if (windowLifecycle.allowClose || window.webContents.isLoading()) return;
    event.preventDefault();
    window.webContents.send(IPC_EVENTS.closeRequested);
    // El front acusa con `acknowledgeCloseRequest`; si no llega (ErrorBoundary
    // desmontado, renderer colgado), se ofrece cerrar sin guardar (BUG-51).
    windowLifecycle.armCloseWatchdog();
  });

  // El proceso del renderer murió (p. ej. un render error): recargar recupera
  // las sesiones vivas vía `listSessions`, cerrar no espera más.
  window.webContents.on('render-process-gone', (_event, details) => {
    windowLifecycle.handleRenderProcessGone(details.reason);
  });

  // El front se quedó colgado: esperar o recargar (no se instala en benchmark).
  if (!isBench) {
    window.on('unresponsive', () => windowLifecycle.handleUnresponsive());
    window.on('responsive', () => windowLifecycle.handleResponsive());
  }

  // Diagnóstico: la consola del renderer también va al log del main.
  window.webContents.on('console-message', (event) => {
    log.info('[renderer]', event.message);
  });

  if (devServerUrl) {
    await window.loadURL(
      bench ? `${devServerUrl}/?bench=${encodeURIComponent(bench)}` : devServerUrl,
    );
  } else {
    // El benchmark también se puede medir sobre el build de producción.
    await window.loadFile(rendererFile, bench ? { query: { bench } } : undefined);
  }

  return window;
}

async function bootstrap(): Promise<void> {
  // Sin menú de aplicación nativo (File/Edit/View/Window): las acciones viven
  // en la toolbar del renderer.
  Menu.setApplicationMenu(null);

  // Permisos (T2): todo denegado salvo escribir en el portapapeles.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(isPermissionAllowed(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    isPermissionAllowed(permission),
  );

  const nest = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const events = nest.get(ElectronEventBusAdapter);
  events.attach(() => mainWindow);

  const ipc = nest.get(IpcController);
  ipc.setPendingOpen(findInitialFile());
  ipc.register(() => mainWindow);

  // El renderer acusa la petición de cierre: está vivo y atendiendo. Cancela
  // el vigilante para que no salte el diálogo de «no responde» (BUG-51).
  ipcMain.handle(IPC_CHANNELS.acknowledgeCloseRequest, () => {
    lifecycle?.cancelCloseWatchdog();
  });

  // Respuesta del renderer a la petición de cierre (guardas de cambios).
  ipcMain.handle(IPC_CHANNELS.confirmWindowClose, (_event, payload: unknown) => {
    // Confirmación o cancelación: en ambos casos el front está vivo, así que el
    // vigilante ya no procede.
    lifecycle?.cancelCloseWatchdog();
    const parsed = windowCloseConfirmationSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.proceed) return;
    if (lifecycle) lifecycle.allowClose = true;
    mainWindow?.close();
  });

  mainWindow = await createWindow();
  log.info('RDLC Report Designer iniciado');

  await maybeCaptureScreenshot(mainWindow);
}

// Endurecimiento (T2) para toda ventana que cree la app.
app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

// Una sola instancia (BUG-29): dos procesos sobre el mismo fichero se pisan
// (watchers y copias en memoria separadas). La segunda instancia se cierra y
// trae al frente la ventana de la primera. El lock es por `user-data-dir`, así
// que los e2e (con su propio directorio temporal) no se ven afectados.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

if (hasSingleInstanceLock) {
  void app.whenReady().then(bootstrap);
} else {
  app.quit();
}

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
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: x1,
    y: y1,
    button: 'left',
    clickCount: 1,
  });
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

  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: x2,
    y: y2,
    button: 'left',
    clickCount: 1,
  });
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
