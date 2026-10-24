import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonUpdatePreferenceAdapter } from '../../src/infrastructure/updates/JsonUpdatePreferenceAdapter.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rdlc-updates-'));
  dirs.push(dir);
  return dir;
}

describe('preferencias de actualización en JSON', () => {
  it('sin fichero no hay versión omitida', async () => {
    const dir = await makeDir();
    const adapter = new JsonUpdatePreferenceAdapter(join(dir, 'updates.json'));
    expect(await adapter.readSkippedVersion()).toBeNull();
  });

  it('guarda y lee la versión omitida', async () => {
    const dir = await makeDir();
    const adapter = new JsonUpdatePreferenceAdapter(join(dir, 'updates.json'));
    await adapter.writeSkippedVersion('0.9.1');
    expect(await adapter.readSkippedVersion()).toBe('0.9.1');
  });

  it('un JSON corrupto o con otro formato se trata como sin preferencia', async () => {
    const dir = await makeDir();
    const path = join(dir, 'updates.json');
    const adapter = new JsonUpdatePreferenceAdapter(path);

    await writeFile(path, '{ no es json');
    expect(await adapter.readSkippedVersion()).toBeNull();

    await writeFile(path, JSON.stringify({ skippedVersion: 42 }));
    expect(await adapter.readSkippedVersion()).toBeNull();
  });

  it('un fallo de escritura no lanza', async () => {
    const dir = await makeDir();
    const adapter = new JsonUpdatePreferenceAdapter(join(dir, 'no-existe', 'updates.json'));
    await expect(adapter.writeSkippedVersion('0.9.1')).resolves.toBeUndefined();
  });
});
