import { IPC_EVENTS, type UpdateState } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import type { EventBusPort } from '../../src/application/ports/out/EventBusPort.js';
import type { UpdatePreferencePort } from '../../src/application/ports/out/UpdatePreferencePort.js';
import type { UpdaterPort } from '../../src/application/ports/out/UpdaterPort.js';
import { UpdateService } from '../../src/application/services/UpdateService.js';

class FakeUpdater implements UpdaterPort {
  currentVersion = '0.8.0';
  canInstall = true;
  /** Resultado de `check()`: versión nueva, `null` (al día) o un error. */
  found: { version: string } | null | Error = { version: '0.9.0' };
  notes: string | null | Error = '## Changes\n- something';
  downloadError: Error | null = null;
  installOnQuit = false;
  installed = 0;
  releasePageOpened = 0;
  progress: number[] = [25, 80];

  check(): Promise<{ version: string } | null> {
    return this.found instanceof Error ? Promise.reject(this.found) : Promise.resolve(this.found);
  }
  fetchReleaseNotes(): Promise<string | null> {
    return this.notes instanceof Error ? Promise.reject(this.notes) : Promise.resolve(this.notes);
  }
  download(onProgress: (percent: number) => void): Promise<void> {
    if (this.downloadError) return Promise.reject(this.downloadError);
    for (const percent of this.progress) onProgress(percent);
    return Promise.resolve();
  }
  setInstallOnQuit(enabled: boolean): void {
    this.installOnQuit = enabled;
  }
  quitAndInstall(): void {
    this.installed += 1;
  }
  openReleasePage(): Promise<void> {
    this.releasePageOpened += 1;
    return Promise.resolve();
  }
}

class FakePreference implements UpdatePreferencePort {
  skipped: string | null = null;
  readSkippedVersion(): Promise<string | null> {
    return Promise.resolve(this.skipped);
  }
  writeSkippedVersion(version: string): Promise<void> {
    this.skipped = version;
    return Promise.resolve();
  }
}

function setup(): {
  service: UpdateService;
  updater: FakeUpdater;
  preference: FakePreference;
  published: UpdateState[];
} {
  const updater = new FakeUpdater();
  const preference = new FakePreference();
  const published: UpdateState[] = [];
  const events: EventBusPort = {
    send: (channel, payload) => {
      if (channel === IPC_EVENTS.updateStateChanged) published.push(payload as UpdateState);
    },
  };
  return {
    service: new UpdateService(updater, preference, events),
    updater,
    preference,
    published,
  };
}

describe('actualizaciones · comprobación', () => {
  it('arranca en idle con la versión instalada', () => {
    const { service } = setup();
    expect(service.getState()).toEqual({
      status: 'idle',
      currentVersion: '0.8.0',
      canInstall: true,
    });
  });

  it('automática: ofrece la versión nueva con sus notas', async () => {
    const { service, published } = setup();
    const state = await service.checkAutomatically();
    expect(state).toMatchObject({
      status: 'available',
      version: '0.9.0',
      notes: '## Changes\n- something',
    });
    // La comprobación automática no pasa por «checking» (sin parpadeo en la UI).
    expect(published.map((s) => s.status)).toEqual(['available']);
  });

  it('automática: no propone la versión omitida', async () => {
    const { service, preference } = setup();
    preference.skipped = '0.9.0';
    expect((await service.checkAutomatically()).status).toBe('idle');
  });

  it('automática: propone una versión posterior a la omitida', async () => {
    const { service, preference, updater } = setup();
    preference.skipped = '0.9.0';
    updater.found = { version: '0.9.1' };
    expect((await service.checkAutomatically()).status).toBe('available');
  });

  it('manual: ignora «omitir versión»', async () => {
    const { service, preference } = setup();
    preference.skipped = '0.9.0';
    expect((await service.checkManually()).status).toBe('available');
  });

  it('automática: un fallo de red no molesta; la manual sí informa', async () => {
    const { service, updater } = setup();
    updater.found = new Error('ENOTFOUND');
    expect((await service.checkAutomatically()).status).toBe('idle');
    const manual = await service.checkManually();
    expect(manual).toMatchObject({ status: 'error', errorMessage: 'ENOTFOUND' });
  });

  it('manual: informa de que ya se está al día', async () => {
    const { service, updater, published } = setup();
    updater.found = null;
    expect((await service.checkManually()).status).toBe('upToDate');
    expect(published.map((s) => s.status)).toEqual(['checking', 'upToDate']);
  });

  it('las notas ilegibles no impiden ofrecer la versión', async () => {
    const { service, updater } = setup();
    updater.notes = new Error('rate limited');
    expect(await service.checkAutomatically()).toMatchObject({
      status: 'available',
      notes: null,
    });
  });

  it('una oferta vigente no se vuelve a comprobar', async () => {
    const { service, updater } = setup();
    await service.checkAutomatically();
    updater.found = null;
    expect((await service.checkManually()).status).toBe('available');
  });
});

describe('actualizaciones · descarga e instalación', () => {
  it('descarga con progreso y deja la versión lista para instalar al salir', async () => {
    const { service, updater, published } = setup();
    await service.checkAutomatically();
    const state = await service.download();

    expect(state).toMatchObject({ status: 'downloaded', version: '0.9.0' });
    expect(state.percent).toBeUndefined();
    expect(updater.installOnQuit).toBe(true);
    expect(published.map((s) => s.status)).toEqual([
      'available',
      'downloading',
      'downloading',
      'downloading',
      'downloaded',
    ]);
    expect(published.filter((s) => s.status === 'downloading').map((s) => s.percent)).toEqual([
      0, 25, 80,
    ]);
  });

  it('un fallo de descarga deja el error con la versión y no instala nada', async () => {
    const { service, updater } = setup();
    await service.checkAutomatically();
    updater.downloadError = new Error('checksum mismatch');

    expect(await service.download()).toMatchObject({
      status: 'error',
      version: '0.9.0',
      errorMessage: 'checksum mismatch',
    });
    expect(updater.installOnQuit).toBe(false);
  });

  it('en instalaciones no actualizables no descarga', async () => {
    const { service, updater } = setup();
    updater.canInstall = false;
    await service.checkAutomatically();
    expect((await service.download()).status).toBe('available');
  });

  it('solo se puede pedir reiniciar con la versión descargada', async () => {
    const { service } = setup();
    await service.checkAutomatically();
    expect(service.requestInstall()).toBe(false);
    await service.download();
    expect(service.requestInstall()).toBe(true);
  });

  it('la petición de reinicio se consume una vez y se puede cancelar', async () => {
    const { service } = setup();
    await service.checkAutomatically();
    await service.download();

    service.requestInstall();
    expect(service.takeRestartRequest()).toBe(true);
    expect(service.takeRestartRequest()).toBe(false);

    service.requestInstall();
    service.cancelRestart();
    expect(service.takeRestartRequest()).toBe(false);
  });

  it('quitAndInstall delega en el adaptador', () => {
    const { service, updater } = setup();
    service.quitAndInstall();
    expect(updater.installed).toBe(1);
  });
});

describe('actualizaciones · omitir y página de descargas', () => {
  it('omitir persiste la versión ofrecida y limpia la oferta', async () => {
    const { service, preference } = setup();
    await service.checkAutomatically();
    const state = await service.skip();
    expect(preference.skipped).toBe('0.9.0');
    expect(state.status).toBe('idle');
  });

  it('omitir sin oferta no persiste nada', async () => {
    const { service, preference } = setup();
    await service.skip();
    expect(preference.skipped).toBeNull();
  });

  it('abre la página de descargas', async () => {
    const { service, updater } = setup();
    await service.openReleasePage();
    expect(updater.releasePageOpened).toBe(1);
  });
});
