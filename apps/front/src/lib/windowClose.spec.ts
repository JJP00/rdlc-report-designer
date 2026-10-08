import type { ProjectionDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { createTab, type TabState } from './workspace';
import { dirtyClosingTabs, planWindowClose, saveTabsInOrder } from './windowClose';

/** Proyección mínima: el plan de cierre solo mira `dirty` y las rutas. */
function projection(version = 1): ProjectionDto {
  return { version } as unknown as ProjectionDto;
}

function tab(sessionId: string, path: string, dirty = false): TabState {
  const created = createTab({ sessionId, path, projection: projection() });
  return dirty ? { ...created, dirty: true } : created;
}

describe('planWindowClose', () => {
  it('sin pestañas sucias confirma el cierre directamente', () => {
    const plan = planWindowClose([tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc')]);

    expect(plan).toEqual({ kind: 'confirm' });
  });

  it('sin ninguna pestaña también confirma (no hay trabajo que resolver)', () => {
    expect(planWindowClose([])).toEqual({ kind: 'confirm' });
  });

  it('con una sucia usa la guarda de una pestaña, con su ruta', () => {
    const plan = planWindowClose([
      tab('s1', 'C:\\a\\Uno.rdlc'),
      tab('s2', 'C:\\a\\Dos.rdlc', true),
    ]);

    expect(plan).toEqual({
      kind: 'intent',
      intent: { kind: 'windowClose', sessionId: 's2', path: 'C:\\a\\Dos.rdlc' },
    });
  });

  it('con varias sucias propone «Guardar todas», solo las sucias y en orden', () => {
    const plan = planWindowClose([
      tab('s1', 'C:\\a\\Uno.rdlc', true),
      tab('s2', 'C:\\a\\Dos.rdlc'),
      tab('s3', 'C:\\a\\Tres.rdlc', true),
    ]);

    expect(plan).toEqual({
      kind: 'intent',
      intent: {
        kind: 'windowCloseAll',
        tabs: [
          { sessionId: 's1', path: 'C:\\a\\Uno.rdlc' },
          { sessionId: 's3', path: 'C:\\a\\Tres.rdlc' },
        ],
      },
    });
  });

  it('dirtyClosingTabs conserva el orden de las pestañas', () => {
    const dirty = dirtyClosingTabs([
      tab('s1', 'C:\\a\\Uno.rdlc', true),
      tab('s2', 'C:\\a\\Dos.rdlc'),
      tab('s3', 'C:\\a\\Tres.rdlc', true),
    ]);

    expect(dirty.map((entry) => entry.sessionId)).toEqual(['s1', 's3']);
  });
});

describe('saveTabsInOrder (Guardar todas)', () => {
  it('guarda en orden y da todo por bien', async () => {
    const calls: string[] = [];
    const outcome = await saveTabsInOrder(
      [
        { sessionId: 's1', path: 'C:\\a\\Uno.rdlc' },
        { sessionId: 's2', path: 'C:\\a\\Dos.rdlc' },
      ],
      () => true,
      (sessionId) => {
        calls.push(sessionId);
        return Promise.resolve(true);
      },
    );

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(['s1', 's2']);
  });

  it('al primer fallo se detiene y devuelve la pestaña que falló', async () => {
    const calls: string[] = [];
    const outcome = await saveTabsInOrder(
      [
        { sessionId: 's1', path: 'C:\\a\\Uno.rdlc' },
        { sessionId: 's2', path: 'C:\\a\\Dos.rdlc' },
        { sessionId: 's3', path: 'C:\\a\\Tres.rdlc' },
      ],
      () => true,
      (sessionId) => {
        calls.push(sessionId);
        return Promise.resolve(sessionId !== 's2');
      },
    );

    expect(outcome).toEqual({
      ok: false,
      failed: { sessionId: 's2', path: 'C:\\a\\Dos.rdlc' },
    });
    expect(calls).toEqual(['s1', 's2']);
  });

  it('las pestañas que ya no están abiertas se saltan sin guardarse', async () => {
    const calls: string[] = [];
    const open = new Set(['s2']);
    const outcome = await saveTabsInOrder(
      [
        { sessionId: 's1', path: 'C:\\a\\Uno.rdlc' },
        { sessionId: 's2', path: 'C:\\a\\Dos.rdlc' },
      ],
      (sessionId) => open.has(sessionId),
      (sessionId) => {
        calls.push(sessionId);
        return Promise.resolve(true);
      },
    );

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(['s2']);
  });

  it('sin pestañas que guardar también es un éxito (nada pendiente)', async () => {
    const outcome = await saveTabsInOrder([], () => true, () => Promise.resolve(true));
    expect(outcome).toEqual({ ok: true });
  });
});
