import { describe, expect, it } from 'vitest';
import {
  loadTabUi,
  removeTabUi,
  sanitizeTabUi,
  saveTabUi,
  serializeTabUi,
  tabUiStorageKey,
  type TabUiStorage,
} from './tabUiStorage';
import { createTabUiState } from './workspace';

function memoryStorage(): TabUiStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('tabUiStorage', () => {
  it('guarda y recupera el ui por sessionId', () => {
    const storage = memoryStorage();
    const ui = {
      ...createTabUiState(),
      selectedId: 'x',
      selectedIds: ['x', 'y'],
      selectedCell: { id: 't', row: 1, col: 2, endRow: 3, extra: [{ row: 0, col: 0 }] },
      zoom: 1.2,
      showHierarchy: true,
    };
    saveTabUi('s1', ui, storage);
    expect(storage.data.has(tabUiStorageKey('s1'))).toBe(true);
    expect(loadTabUi('s1', storage)).toEqual(ui);
    expect(loadTabUi('s2', storage)).toBeUndefined();
    removeTabUi('s1', storage);
    expect(loadTabUi('s1', storage)).toBeUndefined();
  });

  it('valida al leer: campos inválidos vuelven al valor por defecto', () => {
    const ui = sanitizeTabUi({
      selectedId: 5,
      selectedIds: ['a', 3, null],
      selectedCell: { id: 'c', row: 'x', col: 1 },
      zoom: 99,
      showVariables: 'sí',
      showHierarchy: true,
    });
    expect(ui.selectedId).toBeNull();
    expect(ui.selectedIds).toEqual(['a']);
    expect(ui.selectedCell).toBeNull();
    expect(ui.zoom).toBe(4);
    expect(ui.showVariables).toBe(false);
    expect(ui.showHierarchy).toBe(true);
    expect(sanitizeTabUi('basura')).toEqual(createTabUiState());
  });

  it('tolera JSON corrupto, storage ausente o que lanza', () => {
    const storage = memoryStorage();
    storage.data.set(tabUiStorageKey('s1'), '{no json');
    expect(loadTabUi('s1', storage)).toBeUndefined();
    const throwing: TabUiStorage = {
      getItem: () => {
        throw new Error('denegado');
      },
      setItem: () => {
        throw new Error('cuota');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadTabUi('s1', throwing)).toBeUndefined();
    expect(() => saveTabUi('s1', createTabUiState(), throwing)).not.toThrow();
    expect(() => removeTabUi('s1', throwing)).not.toThrow();
    expect(loadTabUi('s1', undefined)).toBeUndefined();
  });

  it('serializa solo los campos conocidos', () => {
    const ui = { ...createTabUiState(), extra: () => 1 } as unknown as ReturnType<
      typeof createTabUiState
    >;
    expect(Object.keys(JSON.parse(serializeTabUi(ui))).sort()).toEqual([
      'selectedCell',
      'selectedId',
      'selectedIds',
      'showHierarchy',
      'showVariables',
      'zoom',
    ]);
  });
});
