import { describe, expect, it } from 'vitest';
import { PendingOpenQueue } from '../../src/presentation/ipc/PendingOpenQueue.js';

/**
 * `PendingOpenQueue` — entrega de ficheros al renderer: el de arranque se
 * consume una sola vez (BUG-29) y las aperturas externas (2.ª instancia de la
 * asociación de ficheros) van en vivo, salvo si llegan antes del montaje (se
 * acumulan para la entrega inicial).
 */

describe('PendingOpenQueue', () => {
  it('entrega el fichero de arranque una sola vez', () => {
    const queue = new PendingOpenQueue();
    queue.setStartup('a.rdlc');
    expect(queue.consume()).toEqual({ path: 'a.rdlc', paths: [] });
    // Recarga del renderer (BUG-29): no se re-entrega.
    expect(queue.consume()).toEqual({ path: null, paths: [] });
  });

  it('acumula las aperturas externas llegadas antes del montaje', () => {
    const queue = new PendingOpenQueue();
    queue.setStartup('a.rdlc');
    expect(queue.requestExternal('b.rdlc')).toBe(false);
    expect(queue.requestExternal('c.rdl')).toBe(false);
    expect(queue.consume()).toEqual({ path: 'a.rdlc', paths: ['b.rdlc', 'c.rdl'] });
  });

  it('sin arranque, las externas tempranas llegan igual con el consumo', () => {
    const queue = new PendingOpenQueue();
    queue.setStartup(null);
    expect(queue.requestExternal('b.rdlc')).toBe(false);
    expect(queue.consume()).toEqual({ path: null, paths: ['b.rdlc'] });
  });

  it('tras el montaje, las aperturas externas van en vivo (true)', () => {
    const queue = new PendingOpenQueue();
    queue.setStartup(null);
    queue.consume();
    expect(queue.requestExternal('b.rdlc')).toBe(true);
    // Ya no quedan encoladas: quien llama las emite como evento.
    expect(queue.consume()).toEqual({ path: null, paths: [] });
  });
});
