import { describe, expect, it } from 'vitest';
import { createSerialQueue, createSessionOps, visibleBusyLabel } from './fileOps';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSessionOps (guarda por sesión)', () => {
  it('una operación en la pestaña A no bloquea el guardado de la B', async () => {
    const ops = createSessionOps();
    const a = deferred<boolean>();
    const runA = ops.run('a', 'save', () => a.promise);
    let bRan = false;
    const runB = ops.run('b', 'save', async () => {
      bRan = true;
      return true;
    });
    expect(bRan).toBe(true);
    expect(ops.busyIds().sort()).toEqual(['a', 'b']);
    await expect(runB).resolves.toBe(true);
    a.resolve(true);
    await runA;
    await Promise.resolve();
    expect(ops.busyIds()).toEqual([]);
  });

  it('en la misma pestaña, una segunda operación se encadena (no se descarta)', async () => {
    const ops = createSessionOps();
    const first = deferred<boolean>();
    const order: string[] = [];
    const p1 = ops.run('a', 'save', async () => {
      order.push('1-start');
      const r = await first.promise;
      order.push('1-end');
      return r;
    });
    const p2 = ops.run('a', 'saveAs', async () => {
      order.push('2');
      return true;
    });
    expect(order).toEqual(['1-start']);
    first.resolve(false); // aunque la primera falle, la segunda se ejecuta
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
    expect(order).toEqual(['1-start', '1-end', '2']);
  });

  it('join devuelve el resultado de la operación en vuelo sin lanzar otra', async () => {
    const ops = createSessionOps();
    const first = deferred<boolean>();
    let runs = 0;
    const p1 = ops.run('a', 'save', () => {
      runs++;
      return first.promise;
    });
    const joined = ops.run(
      'a',
      'save',
      async () => {
        runs++;
        return true;
      },
      { join: true },
    );
    first.resolve(false);
    await expect(joined).resolves.toBe(false);
    await p1;
    expect(runs).toBe(1);
  });

  it('libera la sesión aunque la tarea lance', async () => {
    const ops = createSessionOps();
    await expect(ops.run('a', 'save', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await Promise.resolve();
    expect(ops.isBusy('a')).toBe(false);
  });
});

describe('createSerialQueue (abrir/crear)', () => {
  it('encola lo que llega durante una apertura y lo ejecuta en orden', async () => {
    const queue = createSerialQueue();
    const gate = deferred<void>();
    const order: string[] = [];
    expect(
      queue.enqueue(async () => {
        order.push('1');
        await gate.promise;
      }),
    ).toBe(true);
    expect(
      queue.enqueue(async () => {
        order.push('2');
      }),
    ).toBe(false);
    expect(queue.pending()).toBe(1);
    gate.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['1', '2']);
    expect(queue.isBusy()).toBe(false);
  });

  it('un trabajo que falla no bloquea los siguientes', async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    queue.enqueue(async () => {
      throw new Error('boom');
    });
    queue.enqueue(async () => {
      order.push('ok');
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['ok']);
  });
});

describe('visibleBusyLabel', () => {
  const ops = [
    { id: 1, sessionId: 'a', label: 'Guardando…' },
    { id: 2, sessionId: null, label: 'Abriendo…' },
  ];
  it('muestra la de la pestaña activa o, si no, la del workspace; nunca la de otra pestaña', () => {
    expect(visibleBusyLabel(ops, 'a')).toBe('Guardando…');
    expect(visibleBusyLabel(ops, 'b')).toBe('Abriendo…');
    expect(visibleBusyLabel([ops[0]!], 'b')).toBeNull();
    expect(visibleBusyLabel([], 'a')).toBeNull();
  });
});
