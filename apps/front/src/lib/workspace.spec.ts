import type { ProjectionDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import {
  activateTab,
  adoptSessions,
  applyConflictDetected,
  applyDirtyChanged,
  applyDocumentChanged,
  applyExternalReloadFailed,
  applyFileMissingChanged,
  applySavedEvent,
  applySessionClosed,
  createTab,
  createTabUiState,
  createWorkspace,
  cycleTab,
  EMPTY_TAB_UI,
  findTabByPath,
  IDLE_STATUS,
  markClipboard,
  normalizePath,
  openTab,
  RELOADED_STATUS,
  removeTab,
  resolveTabUiPatch,
  updateTab,
  updateTabUi,
  type TabState,
  type WorkspaceState,
} from './workspace';

/** Proyección mínima: el workspace solo la transporta y compara versiones. */
function projection(version: number): ProjectionDto {
  return { version } as unknown as ProjectionDto;
}

function tab(sessionId: string, path: string, version = 1): TabState {
  return createTab({ sessionId, path, projection: projection(version) });
}

function withTabs(...tabs: TabState[]): WorkspaceState {
  let state = createWorkspace();
  for (const item of tabs) state = openTab(state, item);
  return state;
}

describe('normalizePath (clave del anti-duplicados)', () => {
  it('unifica separadores, quita barras repetidas/final y baja a minúsculas en Windows', () => {
    expect(normalizePath('C:\\Informes\\Pedidos.rdlc', true)).toBe('c:/informes/pedidos.rdlc');
    expect(normalizePath('C:/Informes//Pedidos.rdlc', true)).toBe('c:/informes/pedidos.rdlc');
    expect(normalizePath('/home/Ana/Pedidos.RDLC', true)).toBe('/home/ana/pedidos.rdlc');
  });

  it('quita la barra final sin comerse la raíz', () => {
    expect(normalizePath('C:\\Informes\\', true)).toBe('c:/informes');
    expect(normalizePath('/', true)).toBe('/');
  });

  it('en plataformas case-sensitive respeta las mayúsculas', () => {
    expect(normalizePath('C:\\Informes\\Pedidos.rdlc', false)).toBe('C:/Informes/Pedidos.rdlc');
  });
});

describe('openTab', () => {
  it('añade la pestaña, la activa y conserva la anterior abierta', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

    expect(state.order).toEqual(['s1', 's2']);
    expect(state.activeSessionId).toBe('s2');
    expect(state.tabs.size).toBe(2);
    expect(state.tabs.get('s1')?.path).toBe('C:\\a\\Uno.rdlc');
  });

  it('anti-duplicado: la misma ruta con otra caja activa la existente, no la reabre', () => {
    const state = withTabs(tab('s1', 'C:\\Informes\\Pedidos.rdlc'), tab('s2', 'C:\\Informes\\Stock.rdlc'));

    const next = openTab(state, tab('s3', 'c:\\INFORMES\\pedidos.RDLC'));

    expect(next.tabs.size).toBe(2);
    expect(next.order).toEqual(['s1', 's2']);
    expect(next.activeSessionId).toBe('s1');
  });

  it('sin case-insensitive (plataformas sensibles) las dos rutas conviven', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'));
    // `openTab` usa el detector de plataforma; se comprueba aquí el helper.
    expect(findTabByPath(state, 'c:\\A\\uno.rdlc', true)).toBe('s1');
    expect(findTabByPath(state, 'c:\\A\\uno.rdlc', false)).toBeUndefined();
  });

  it('si la sesión ya está en el workspace se actualiza y se activa, sin duplicar', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

    const next = openTab(state, { ...tab('s1', 'C:\\a\\Uno-renombrado.rdlc', 7), dirty: true });

    expect(next.tabs.size).toBe(2);
    expect(next.activeSessionId).toBe('s1');
    expect(next.tabs.get('s1')?.path).toBe('C:\\a\\Uno-renombrado.rdlc');
    expect(next.tabs.get('s1')?.dirty).toBe(true);
    expect(next.tabs.get('s1')?.projection.version).toBe(7);
  });
});

describe('removeTab', () => {
  it('si se cierra la activa, la nueva activa es la vecina de la derecha', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'), tab('s3', 'C:\\a\\Tres.rdlc'));
    const activated = activateTab(state, 's2');

    const next = removeTab(activated, 's2');

    expect(next.order).toEqual(['s1', 's3']);
    expect(next.activeSessionId).toBe('s3');
  });

  it('sin vecina derecha, la activa pasa a la izquierda', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

    const next = removeTab(state, 's2');

    expect(next.order).toEqual(['s1']);
    expect(next.activeSessionId).toBe('s1');
  });

  it('al cerrar la última pestaña el workspace queda vacío (sin ventana)', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'));

    const next = removeTab(state, 's1');

    expect(next.tabs.size).toBe(0);
    expect(next.order).toEqual([]);
    expect(next.activeSessionId).toBeNull();
  });

  it('cerrar una pestaña no activa conserva la activa', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'), tab('s3', 'C:\\a\\Tres.rdlc'));
    const activated = activateTab(state, 's3');

    const next = removeTab(activated, 's1');

    expect(next.activeSessionId).toBe('s3');
    expect(next.order).toEqual(['s2', 's3']);
  });

  it('es idempotente: eliminar una sesión desconocida no cambia nada', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'));

    expect(removeTab(state, 's2')).toBe(state);
  });
});

describe('cycleTab', () => {
  it('rota hacia delante con vuelta circular y hacia atrás', () => {
    const state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'), tab('s3', 'C:\\a\\Tres.rdlc'));
    const first = activateTab(state, 's1');

    expect(cycleTab(first, 1).activeSessionId).toBe('s2');
    expect(cycleTab(cycleTab(cycleTab(first, 1), 1), 1).activeSessionId).toBe('s1');
    expect(cycleTab(first, -1).activeSessionId).toBe('s3');
  });

  it('sin pestañas no hace nada', () => {
    const state = createWorkspace();
    expect(cycleTab(state, 1)).toBe(state);
  });
});

describe('enrutado de eventos por sessionId', () => {
  const base = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

  it('documentChanged solo toca la pestaña del evento', () => {
    const next = applyDocumentChanged(base, {
      sessionId: 's1',
      projection: projection(4),
    });

    expect(next.tabs.get('s1')?.projection.version).toBe(4);
    expect(next.tabs.get('s2')?.projection.version).toBe(1);
    expect(next.tabs.get('s1')?.reloads).toBe(0);
  });

  it('un snapshot con versión anterior no pisa la proyección nueva', () => {
    const state = updateTab(base, 's1', { projection: projection(5) });

    const next = applyDocumentChanged(state, {
      sessionId: 's1',
      projection: projection(3),
    });

    expect(next.tabs.get('s1')?.projection.version).toBe(5);
  });

  it('una recarga externa cuenta, limpia el conflicto y deja su estado', () => {
    const state = updateTab(base, 's1', { conflict: 'C:\\a\\Uno.rdlc', fileMissing: 'C:\\a\\Uno.rdlc' });

    const next = applyDocumentChanged(state, {
      sessionId: 's1',
      projection: projection(6),
      reason: 'external',
    });

    const s1 = next.tabs.get('s1')!;
    expect(s1.reloads).toBe(1);
    expect(s1.conflict).toBeNull();
    expect(s1.status).toBe(RELOADED_STATUS);
    expect(next.tabs.get('s2')?.reloads).toBe(0);
  });

  it('un snapshot interno no cuenta como recarga externa', () => {
    const next = applyDocumentChanged(base, {
      sessionId: 's1',
      projection: projection(2),
      reason: 'internal',
    });

    expect(next.tabs.get('s1')?.reloads).toBe(0);
  });

  it('dirtyChanged actualiza el * de su pestaña', () => {
    const next = applyDirtyChanged(base, { sessionId: 's2', dirty: true });

    expect(next.tabs.get('s2')?.dirty).toBe(true);
    expect(next.tabs.get('s1')?.dirty).toBe(false);
  });

  it('conflictDetected marca conflicto y estado solo en su pestaña', () => {
    const next = applyConflictDetected(base, { sessionId: 's1', filePath: 'C:\\a\\Uno.rdlc' });

    expect(next.tabs.get('s1')?.conflict).toBe('C:\\a\\Uno.rdlc');
    expect(next.tabs.get('s1')?.status).toContain('cambió en disco');
    expect(next.tabs.get('s2')?.conflict).toBeNull();
  });

  it('saved limpia el conflicto (robustez) y fija la ruta guardada', () => {
    const state = updateTab(base, 's1', { conflict: 'C:\\a\\Uno.rdlc', fileMissing: 'C:\\a\\Uno.rdlc' });

    const next = applySavedEvent(state, { sessionId: 's1', path: 'C:\\a\\Uno2.rdlc' });

    const s1 = next.tabs.get('s1')!;
    expect(s1.conflict).toBeNull();
    expect(s1.fileMissing).toBeNull();
    expect(s1.path).toBe('C:\\a\\Uno2.rdlc');
    expect(next.tabs.get('s2')?.conflict).toBeNull();
  });

  it('fileMissingChanged enseña y retira el aviso de su pestaña', () => {
    const missing = applyFileMissingChanged(base, {
      sessionId: 's1',
      filePath: 'C:\\a\\Uno.rdlc',
      missing: true,
    });
    expect(missing.tabs.get('s1')?.fileMissing).toBe('C:\\a\\Uno.rdlc');

    const back = applyFileMissingChanged(missing, {
      sessionId: 's1',
      filePath: 'C:\\a\\Uno.rdlc',
      missing: false,
    });
    expect(back.tabs.get('s1')?.fileMissing).toBeNull();
  });

  it('externalReloadFailed avisa en suave sin conflicto', () => {
    const state = updateTab(base, 's1', { conflict: 'C:\\a\\Uno.rdlc' });

    const next = applyExternalReloadFailed(state, {
      sessionId: 's1',
      filePath: 'C:\\a\\Uno.rdlc',
      reason: 'unreadable',
    });

    expect(next.tabs.get('s1')?.conflict).toBeNull();
    expect(next.tabs.get('s1')?.status).toContain('no se pudo leer');
  });

  it('sessionClosed retira la pestaña y elige vecina; repetido es idempotente', () => {
    const activated = activateTab(base, 's1');

    const next = applySessionClosed(activated, { sessionId: 's1' });

    expect(next.order).toEqual(['s2']);
    expect(next.activeSessionId).toBe('s2');
    expect(applySessionClosed(next, { sessionId: 's1' })).toBe(next);
  });

  it('un evento de una sesión que no está en el workspace no hace nada', () => {
    expect(applyDirtyChanged(base, { sessionId: 's9', dirty: true })).toBe(base);
    expect(applyConflictDetected(base, { sessionId: 's9', filePath: 'x' })).toBe(base);
    expect(applySavedEvent(base, { sessionId: 's9', path: 'x' })).toBe(base);
    expect(applyDocumentChanged(base, { sessionId: 's9', projection: projection(9) })).toBe(base);
    expect(applyFileMissingChanged(base, { sessionId: 's9', filePath: 'x', missing: true })).toBe(base);
    expect(applyExternalReloadFailed(base, { sessionId: 's9', filePath: 'x', reason: 'unreadable' })).toBe(base);
  });
});

describe('adoptSessions (re-adopción tras recargar la interfaz)', () => {
  it('adopta todas las sesiones vivas en orden y activa la última', () => {
    const adopted = adoptSessions(createWorkspace(), [
      { sessionId: 'a', filePath: 'C:\\a\\Uno.rdlc', dirty: false, projection: projection(2) },
      { sessionId: 'b', filePath: 'C:\\a\\Dos.rdlc', dirty: true, projection: projection(5) },
    ]);

    expect(adopted.order).toEqual(['a', 'b']);
    expect(adopted.activeSessionId).toBe('b');
    expect(adopted.tabs.get('a')?.status).toBe('Sesión recuperada: C:\\a\\Uno.rdlc');
    expect(adopted.tabs.get('b')?.dirty).toBe(true);
    expect(adopted.tabs.get('b')?.projection.version).toBe(5);
  });

  it('sin sesiones no toca el workspace', () => {
    const state = createWorkspace();
    expect(adoptSessions(state, [])).toBe(state);
  });
});

describe('createTab', () => {
  it('nace limpia, sin conflicto ni errores, con UI por defecto', () => {
    const created = tab('s1', 'C:\\a\\Uno.rdlc');

    expect(created).toMatchObject({
      sessionId: 's1',
      path: 'C:\\a\\Uno.rdlc',
      dirty: false,
      conflict: null,
      fileMissing: null,
      error: null,
      reloads: 0,
      hasClipboard: false,
      status: IDLE_STATUS,
    });
    expect(created.ui).toEqual({
      selectedId: null,
      selectedIds: [],
      selectedCell: null,
      zoom: 0.6,
      showVariables: false,
      showHierarchy: false,
    });
  });

  it('la UI por defecto sin pestañas es la misma referencia congelada', () => {
    expect(EMPTY_TAB_UI).toEqual(createTabUiState());
    expect(Object.isFrozen(EMPTY_TAB_UI)).toBe(true);
  });
});

describe('updateTabUi (persistencia del ui por pestaña, bloque D)', () => {
  const base = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

  it('aplica el parche a la pestaña indicada y fusiona con el ui existente', () => {
    const next = updateTabUi(base, 's1', { selectedIds: ['Textbox1', 'Textbox2'], selectedId: 'Textbox2' });

    const s1 = next.tabs.get('s1')!;
    expect(s1.ui.selectedIds).toEqual(['Textbox1', 'Textbox2']);
    expect(s1.ui.selectedId).toBe('Textbox2');
    expect(s1.ui.zoom).toBe(0.6);
    expect(next.tabs.get('s2')?.ui.selectedIds).toEqual([]);
  });

  it('la selección de una pestaña no toca la de otra (ui independiente)', () => {
    const withS1 = updateTabUi(base, 's1', { selectedCell: { id: 'Tablix1', row: 2, col: 3 } });
    const withBoth = updateTabUi(withS1, 's2', { zoom: 1.25, showVariables: true });

    expect(withBoth.tabs.get('s1')?.ui.selectedCell).toEqual({ id: 'Tablix1', row: 2, col: 3 });
    expect(withBoth.tabs.get('s1')?.ui.zoom).toBe(0.6);
    expect(withBoth.tabs.get('s2')?.ui.selectedCell).toBeNull();
    expect(withBoth.tabs.get('s2')?.ui.zoom).toBe(1.25);
    expect(withBoth.tabs.get('s2')?.ui.showVariables).toBe(true);
  });

  it('un parche que no cambia nada devuelve el mismo estado (sin re-render)', () => {
    const state = updateTabUi(base, 's1', { selectedIds: ['Textbox1'], selectedId: 'Textbox1' });
    const again = updateTabUi(state, 's1', { selectedIds: ['Textbox1'], selectedId: 'Textbox1' });

    expect(again).toBe(state);
  });

  it('compara la celda por valor (incluidos rango y celdas extra)', () => {
    const cell = { id: 'Tablix1', row: 0, col: 0, endRow: 2, endCol: 1, extra: [{ row: 4, col: 4 }] };
    const state = updateTabUi(base, 's1', { selectedCell: cell });
    const again = updateTabUi(state, 's1', {
      selectedCell: { ...cell, extra: [{ row: 4, col: 4 }] },
    });
    expect(again).toBe(state);

    const extended = updateTabUi(state, 's1', {
      selectedCell: { ...cell, endCol: 5 },
    });
    expect(extended).not.toBe(state);
    expect(extended.tabs.get('s1')?.ui.selectedCell?.endCol).toBe(5);
  });

  it('una sesión desconocida no cambia nada (idempotente)', () => {
    expect(updateTabUi(base, 's9', { zoom: 2 })).toBe(base);
  });
});

describe('resolveTabUiPatch (parches funcionales del ui)', () => {
  it('un objeto pasa tal cual; una función se deriva del ui actual', () => {
    const ui = createTabUiState();

    expect(resolveTabUiPatch(ui, { zoom: 1 })).toEqual({ zoom: 1 });

    const derived = resolveTabUiPatch(ui, (current) => ({
      selectedId: 'Textbox1',
      selectedIds: [...current.selectedIds, 'Textbox1'],
    }));
    expect(derived).toEqual({ selectedId: 'Textbox1', selectedIds: ['Textbox1'] });
  });

  it('dos parches funcionales en cola se aplican sin pisarse', () => {
    // El store resuelve cada función contra el ui **más reciente**: alternar la
    // selección de dos items seguidos no pierde el primero (a diferencia de una
    // instantánea capturada al renderizar).
    let state = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'));
    const toggle = (id: string) => (ui: { selectedIds: string[] }) => ({
      selectedIds: ui.selectedIds.includes(id)
        ? ui.selectedIds.filter((candidate) => candidate !== id)
        : [...ui.selectedIds, id],
    });

    for (const patch of [toggle('a'), toggle('b')]) {
      const tab = state.tabs.get('s1')!;
      state = updateTabUi(state, 's1', resolveTabUiPatch(tab.ui, patch));
    }

    expect(state.tabs.get('s1')?.ui.selectedIds).toEqual(['a', 'b']);
  });
});

describe('markClipboard (portapapeles por sesión)', () => {
  const base = withTabs(tab('s1', 'C:\\a\\Uno.rdlc'), tab('s2', 'C:\\a\\Dos.rdlc'));

  it('copiar en una pestaña no habilita pegar en la otra', () => {
    const next = markClipboard(base, 's1');

    expect(next.tabs.get('s1')?.hasClipboard).toBe(true);
    expect(next.tabs.get('s2')?.hasClipboard).toBe(false);
  });

  it('la recarga externa de esa pestaña descarta su portapapeles', () => {
    const withClip = markClipboard(base, 's1');

    const next = applyDocumentChanged(withClip, {
      sessionId: 's1',
      projection: projection(6),
      reason: 'external',
    });

    expect(next.tabs.get('s1')?.hasClipboard).toBe(false);
  });

  it('una sesión desconocida no cambia nada', () => {
    expect(markClipboard(base, 's9')).toBe(base);
  });
});
