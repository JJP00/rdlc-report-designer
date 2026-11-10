import { describe, expect, it } from 'vitest';
import {
  COALESCE_MS,
  MAX_UNDO_STEPS,
  commit,
  createHistory,
  mapCaret,
  redo,
  undo,
  type DraftSnapshot,
} from './draftHistory';

const snap = (text: string): DraftSnapshot => ({ text, paragraphs: [{ runs: [{ value: text }] }] });

describe('draftHistory', () => {
  it('deshacer y rehacer recorren los pasos en orden', () => {
    let h = createHistory(snap('a'));
    h = commit(h, snap('ab'), { now: 0 });
    h = commit(h, snap('abc'), { now: 0 });

    h = undo(h);
    expect(h.present.text).toBe('ab');
    h = undo(h);
    expect(h.present.text).toBe('a');
    h = redo(h);
    expect(h.present.text).toBe('ab');
    h = redo(h);
    expect(h.present.text).toBe('abc');
  });

  it('sin pasos, deshacer/rehacer no hacen nada (mismo objeto)', () => {
    const h = createHistory(snap('a'));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('un cambio nuevo descarta el rehacer', () => {
    let h = createHistory(snap('a'));
    h = commit(h, snap('ab'), { now: 0 });
    h = undo(h);
    h = commit(h, snap('ax'), { now: 0 });
    expect(h.future).toHaveLength(0);
    expect(redo(h)).toBe(h);
  });

  it('un cambio que deja el borrador igual no crea paso', () => {
    const h = createHistory(snap('a'));
    expect(commit(h, snap('a'), { now: 0 })).toBe(h);
  });

  it('las teclas seguidas en el mismo campo son un solo paso', () => {
    let h = createHistory(snap(''));
    h = commit(h, snap('a'), { key: 'textarea', now: 0 });
    h = commit(h, snap('ab'), { key: 'textarea', now: 200 });
    h = commit(h, snap('abc'), { key: 'textarea', now: 400 });
    expect(h.past).toHaveLength(1);
    expect(undo(h).present.text).toBe('');
  });

  it('una pausa larga, otro campo o un botón cortan la ráfaga', () => {
    let h = createHistory(snap(''));
    h = commit(h, snap('a'), { key: 'textarea', now: 0 });
    // Pausa larga: paso nuevo.
    h = commit(h, snap('ab'), { key: 'textarea', now: COALESCE_MS + 1 });
    expect(h.past).toHaveLength(2);
    // Otro campo: paso nuevo.
    h = commit(h, snap('abc'), { key: 'run:0', now: COALESCE_MS + 2 });
    expect(h.past).toHaveLength(3);
    // Sin clave (un botón): siempre paso nuevo, aunque sea seguido.
    h = commit(h, snap('abcd'), { now: COALESCE_MS + 3 });
    h = commit(h, snap('abcde'), { now: COALESCE_MS + 4 });
    expect(h.past).toHaveLength(5);
  });

  it('tras deshacer, teclear empieza un paso nuevo (no se funde con el anterior)', () => {
    let h = createHistory(snap(''));
    h = commit(h, snap('a'), { key: 'textarea', now: 0 });
    h = commit(h, snap('ab'), { key: 'textarea', now: 100 });
    h = undo(h);
    h = commit(h, snap('x'), { key: 'textarea', now: 200 });
    expect(h.past).toHaveLength(1);
    expect(undo(h).present.text).toBe('');
    expect(redo(undo(h)).present.text).toBe('x');
  });

  it('acota los pasos recordados', () => {
    let h = createHistory(snap('0'));
    for (let i = 1; i <= MAX_UNDO_STEPS + 50; i++) h = commit(h, snap(String(i)), { now: 0 });
    expect(h.past).toHaveLength(MAX_UNDO_STEPS);
    // Deshacer MAX pasos llega al más antiguo que se conserva.
    for (let i = 0; i < MAX_UNDO_STEPS; i++) h = undo(h);
    expect(h.present.text).toBe('50');
    expect(undo(h)).toBe(h);
  });

  it('deshacer restaura los párrafos exactos, no solo el texto', () => {
    const before: DraftSnapshot = {
      text: 'x',
      paragraphs: [{ runs: [{ value: 'x', style: { fontWeight: 'Bold' } }] }],
    };
    const after: DraftSnapshot = { text: 'x', paragraphs: [{ runs: [{ value: 'x' }] }] };
    let h = createHistory(before);
    h = commit(h, after, { now: 0 });
    expect(undo(h).present).toBe(before);
  });
});

describe('mapCaret', () => {
  it('deshacer un texto añadido al final deja el cursor al final', () => {
    expect(mapCaret('abAAA', 'ab', 5)).toBe(2);
  });

  it('rehacer deja el cursor detrás de lo reinsertado', () => {
    expect(mapCaret('ab', 'abAAA', 2)).toBe(5);
  });

  it('un cambio en medio mantiene el cursor junto a él', () => {
    // «abXYcd» con el cursor tras XY; al quitar XY queda entre b y c.
    expect(mapCaret('abXYcd', 'abcd', 4)).toBe(2);
    // Cursor dentro del tramo cambiado: acaba al final del tramo nuevo.
    expect(mapCaret('abXYcd', 'abcd', 3)).toBe(2);
    expect(mapCaret('abcd', 'abXYcd', 2)).toBe(4);
  });

  it('antes del cambio no se mueve y después se desplaza con él', () => {
    expect(mapCaret('hello world', 'hello big world', 2)).toBe(2);
    expect(mapCaret('hello world', 'hello big world', 11)).toBe(15);
  });

  it('acota el cursor y soporta textos vacíos', () => {
    expect(mapCaret('', 'abc', 0)).toBe(3);
    expect(mapCaret('abc', '', 3)).toBe(0);
    expect(mapCaret('abc', 'abc', 99)).toBe(3);
  });
});
