/**
 * Puerto de salida: comprobar, descargar e instalar versiones nuevas (adaptador:
 * `electron-updater` sobre las releases de GitHub). El caso de uso
 * (`UpdateService`) no conoce ni Electron ni la red.
 */
export const UPDATER_PORT = Symbol('UpdaterPort');

export interface UpdaterPort {
  /** Versión instalada (`app.getVersion()`). */
  readonly currentVersion: string;
  /**
   * Esta instalación se puede actualizar en sitio (instalador NSIS). En
   * portable/MSI/zip/desarrollo solo se avisa y se enlaza a la release.
   */
  readonly canInstall: boolean;

  /** Versión más nueva publicada, o `null` si ya se está al día. Lanza si falla. */
  check(): Promise<{ version: string } | null>;
  /** Notas de la release `version` (Markdown), o `null` si no se pueden leer. */
  fetchReleaseNotes(version: string): Promise<string | null>;
  /** Descarga la versión encontrada por el último `check()`. */
  download(onProgress: (percent: number) => void): Promise<void>;
  /** Con `true`, la versión descargada se instala sola al cerrar la app. */
  setInstallOnQuit(enabled: boolean): void;
  /** Cierra la app, instala en silencio la versión descargada y la relanza. */
  quitAndInstall(): void;
  /** Abre la página de releases en el navegador. */
  openReleasePage(): Promise<void>;
}
