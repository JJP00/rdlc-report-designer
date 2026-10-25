import { Inject, Injectable } from '@nestjs/common';
import { IPC_EVENTS, type UpdateState } from '@rdlc-designer/contracts';
import { EVENT_BUS_PORT, type EventBusPort } from '../ports/out/EventBusPort.js';
import {
  UPDATE_PREFERENCE_PORT,
  type UpdatePreferencePort,
} from '../ports/out/UpdatePreferencePort.js';
import { UPDATER_PORT, type UpdaterPort } from '../ports/out/UpdaterPort.js';

/**
 * Casos de uso de actualización: comprobar (al arrancar o a petición),
 * descargar, omitir una versión e instalar. El estado vive aquí y se publica al
 * renderer en cada cambio (`updateStateChanged`); el renderer no toca la red.
 *
 * - Comprobación **automática** (arranque): silenciosa; no propone la versión
 *   omitida y no muestra errores (offline no debe molestar).
 * - Comprobación **manual** (Fichero → Buscar actualizaciones…): informa
 *   siempre (disponible, al día o error) y ignora «omitir versión».
 */
@Injectable()
export class UpdateService {
  private state: UpdateState;
  /** Hay una comprobación en vuelo (la automática no cambia el estado visible). */
  private checking = false;
  /** El usuario pidió «Reiniciar e instalar»: la salida debe instalar y relanzar. */
  private restartRequested = false;

  constructor(
    @Inject(UPDATER_PORT) private readonly updater: UpdaterPort,
    @Inject(UPDATE_PREFERENCE_PORT) private readonly preference: UpdatePreferencePort,
    @Inject(EVENT_BUS_PORT) private readonly events: EventBusPort,
  ) {
    this.state = this.baseState('idle');
  }

  getState(): UpdateState {
    return this.state;
  }

  /** Comprobación silenciosa del arranque. */
  async checkAutomatically(): Promise<UpdateState> {
    return this.check(false);
  }

  /** Comprobación pedida por el usuario: siempre informa. */
  async checkManually(): Promise<UpdateState> {
    return this.check(true);
  }

  /** Descarga la versión ofrecida; al terminar queda lista para instalarse. */
  async download(): Promise<UpdateState> {
    const offered = this.state.version;
    if (this.state.status !== 'available' || !offered) return this.state;
    if (!this.updater.canInstall) return this.state;

    this.publish({ ...this.state, status: 'downloading', percent: 0 });
    try {
      await this.updater.download((percent) => {
        if (this.state.status !== 'downloading') return;
        this.publish({ ...this.state, percent: Math.min(100, Math.max(0, Math.round(percent))) });
      });
    } catch (error) {
      this.publish(this.errorState(error, offered, this.state.notes));
      return this.state;
    }
    // «Instalar más tarde»: una versión descargada se instala sola al salir.
    this.updater.setInstallOnQuit(true);
    const { percent: _percent, ...rest } = this.state;
    this.publish({ ...rest, status: 'downloaded' });
    return this.state;
  }

  /**
   * Marca que la próxima salida debe instalar y relanzar. El cierre real lo
   * hace el main por la guarda de cambios sin guardar (`mainWindow.close()`).
   */
  requestInstall(): boolean {
    if (this.state.status !== 'downloaded') return false;
    this.restartRequested = true;
    return true;
  }

  /** El usuario canceló el cierre (cambios sin guardar): no reiniciar. */
  cancelRestart(): void {
    this.restartRequested = false;
  }

  /** `true` una sola vez si la salida en curso debe instalar y relanzar. */
  takeRestartRequest(): boolean {
    const requested = this.restartRequested;
    this.restartRequested = false;
    return requested;
  }

  quitAndInstall(): void {
    this.updater.quitAndInstall();
  }

  /** Omite la versión ofrecida: no se vuelve a proponer sola. */
  async skip(): Promise<UpdateState> {
    const offered = this.state.version;
    if (!offered || (this.state.status !== 'available' && this.state.status !== 'error')) {
      return this.state;
    }
    await this.preference.writeSkippedVersion(offered);
    this.publish(this.baseState('idle'));
    return this.state;
  }

  openReleasePage(): Promise<void> {
    return this.updater.openReleasePage();
  }

  /* ------------------------------ helpers ------------------------------- */

  private async check(manual: boolean): Promise<UpdateState> {
    // Una descarga/versión lista o una comprobación en curso no se pisan.
    if (this.checking) return this.state;
    const { status } = this.state;
    if (status === 'downloading' || status === 'downloaded') return this.state;
    // La oferta vigente se conserva (sin parpadeo) salvo que ya fallara.
    if (status === 'available') return this.state;

    this.checking = true;
    if (manual) this.publish(this.baseState('checking'));
    try {
      const found = await this.updater.check();
      if (!found) {
        this.publish(this.baseState(manual ? 'upToDate' : 'idle'));
        return this.state;
      }
      if (!manual && (await this.preference.readSkippedVersion()) === found.version) {
        this.publish(this.baseState('idle'));
        return this.state;
      }
      const notes = await this.safeNotes(found.version);
      this.publish({ ...this.baseState('available'), version: found.version, notes });
    } catch (error) {
      // Una comprobación automática fallida (sin red…) no molesta al usuario.
      this.publish(manual ? this.errorState(error) : this.baseState('idle'));
    } finally {
      this.checking = false;
    }
    return this.state;
  }

  private async safeNotes(version: string): Promise<string | null> {
    try {
      return await this.updater.fetchReleaseNotes(version);
    } catch {
      return null;
    }
  }

  private baseState(status: UpdateState['status']): UpdateState {
    return {
      status,
      currentVersion: this.updater.currentVersion,
      canInstall: this.updater.canInstall,
    };
  }

  private errorState(error: unknown, version?: string, notes?: string | null): UpdateState {
    return {
      ...this.baseState('error'),
      ...(version ? { version } : {}),
      ...(notes !== undefined ? { notes } : {}),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  private publish(next: UpdateState): void {
    this.state = next;
    this.events.send(IPC_EVENTS.updateStateChanged, next);
  }
}
