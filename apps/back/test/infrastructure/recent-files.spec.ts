import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonRecentFilesAdapter } from '../../src/infrastructure/recent/JsonRecentFilesAdapter.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeAdapter(): Promise<{ adapter: JsonRecentFilesAdapter; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'rdlc-recent-'));
  dirs.push(dir);
  return { adapter: new JsonRecentFilesAdapter(join(dir, 'recent-files.json')), dir };
}

describe('recientes persistidos en JSON', () => {
  it('añade al frente, deduplica y limita a 8', async () => {
    const { adapter, dir } = await makeAdapter();
    const paths: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const path = join(dir, `informe-${index}.rdlc`);
      await writeFile(path, 'x');
      paths.push(path);
    }

    for (const path of paths) await adapter.add(path);

    const list = await adapter.list();
    expect(list).toHaveLength(8);
    expect(list[0]).toBe(paths[9]);
    expect(list[1]).toBe(paths[8]);

    // Re-añadir mueve al frente sin duplicar.
    const again = await adapter.add(paths[5]!);
    expect(again[0]).toBe(paths[5]);
    expect(again.filter((path) => path === paths[5])).toHaveLength(1);
  });

  it('descarta las rutas que ya no existen', async () => {
    const { adapter, dir } = await makeAdapter();
    const alive = join(dir, 'vive.rdlc');
    const gone = join(dir, 'fuera.rdlc');
    await writeFile(alive, 'x');
    await writeFile(gone, 'x');

    await adapter.add(gone);
    await adapter.add(alive);
    await rm(gone);

    expect(await adapter.list()).toEqual([alive]);
  });
});
