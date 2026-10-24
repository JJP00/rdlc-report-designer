import { app, shell } from 'electron';
import log from 'electron-log/main';
import type { AppUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UpdaterPort } from '../../application/ports/out/UpdaterPort.js';

/** Repositorio de las releases (público: la API se consulta sin credenciales). */
const REPO = 'JJP00/rdlc-report-designer';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const NOTES_TIMEOUT_MS = 8000;
/** Tope defensivo para las notas (el renderer las muestra como texto). */
const NOTES_MAX_CHARS = 20_000;

/** Desinstalador que deja el instalador NSIS junto al ejecutable. */
const NSIS_UNINSTALLER = 'Uninstall RDLC Report Designer.exe';

/**
 * Adaptador de salida sobre `electron-updater` (releases de GitHub, instalador
 * NSIS aplicado en silencio). La descarga es diferencial (blockmap) y verifica
 * el `sha512` de `latest.yml`.
 *
 * Solo las instalaciones NSIS se actualizan en sitio (`canInstall`): ejecutar un
 * instalador NSIS sobre una copia MSI/portable/zip crearía una segunda
 * instalación, así que ahí solo se avisa y se enlaza a la release.
 */
export class ElectronUpdaterAdapter implements UpdaterPort {
  private updater: AppUpdater | null = null;

  get currentVersion(): string {
    return app.getVersion();
  }

  get canInstall(): boolean {
    if (!app.isPackaged) return false;
    // El portable se autoextrae en %TEMP% y exporta esta variable.
    if (process.env['PORTABLE_EXECUTABLE_FILE']) return false;
    return existsSync(join(dirname(process.execPath), NSIS_UNINSTALLER));
  }

  async check(): Promise<{ version: string } | null> {
    if (!app.isPackaged) throw new Error('Updates are only available in packaged builds');
    const updater = await this.load();
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) return null;
    return { version: result.updateInfo.version };
  }

  async fetchReleaseNotes(version: string): Promise<string | null> {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rdlc-report-designer' },
      signal: AbortSignal.timeout(NOTES_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const release = (await response.json()) as { body?: unknown };
    if (typeof release.body !== 'string' || release.body.trim() === '') return null;
    return release.body.slice(0, NOTES_MAX_CHARS);
  }

  async download(onProgress: (percent: number) => void): Promise<void> {
    const updater = await this.load();
    const listener = (progress: { percent: number }): void => onProgress(progress.percent);
    updater.on('download-progress', listener);
    try {
      await updater.downloadUpdate();
    } finally {
      updater.off('download-progress', listener);
    }
  }

  setInstallOnQuit(enabled: boolean): void {
    if (this.updater) this.updater.autoInstallOnAppQuit = enabled;
  }

  quitAndInstall(): void {
    if (!this.updater) throw new Error('Updater not initialised');
    // isSilent = true (sin interfaz del instalador), isForceRunAfter = true (relanza la app).
    this.updater.quitAndInstall(true, true);
  }

  async openReleasePage(): Promise<void> {
    await shell.openExternal(RELEASES_URL);
  }

  /** Carga perezosa: `electron-updater` toca `electron` al instanciarse. */
  private async load(): Promise<AppUpdater> {
    if (this.updater) return this.updater;
    // CJS: la forma de import soportada en ESM es la exportación por defecto.
    const module = await import('electron-updater');
    const { autoUpdater } = module.default;
    autoUpdater.logger = log;
    // Nada se descarga ni se instala sin que el usuario lo pida.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    this.updater = autoUpdater;
    return autoUpdater;
  }
}
