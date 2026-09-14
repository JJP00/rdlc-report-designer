import type { ItemDto, Length, ProjectionDto, RdlcCommand } from '@rdlc-designer/contracts';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CanvasPreview } from './CanvasPreview';

interface OpenDocument {
  sessionId: string;
  path: string;
  projection: ProjectionDto;
}

export function App(): ReactNode {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [status, setStatus] = useState('Listo. Abre un .rdlc exportado de Business Central.');
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [zoom, setZoom] = useState(0.6);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sin preload (p. ej. abriendo el renderer en un navegador) no hay backend IPC.
  const hasBackend = typeof window !== 'undefined' && window.api !== undefined;

  useEffect(() => {
    if (!hasBackend) return;

    const offDocument = window.api.onDocumentChanged((event) => {
      setDoc((current) =>
        current && current.sessionId === event.sessionId
          ? { ...current, projection: event.projection }
          : current,
      );
      setReloads((count) => count + 1);
      setStatus(`Snapshot actualizada (v${event.projection.version})`);
    });

    const offDirty = window.api.onDirtyChanged((event) => setDirty(event.dirty));

    return () => {
      offDocument();
      offDirty();
    };
  }, [hasBackend]);

  const stats = useMemo(() => (doc ? countItems(doc.projection) : null), [doc]);

  const sendCommand = useCallback(
    async (command: RdlcCommand): Promise<void> => {
      if (!doc) return;
      const result = await window.api.executeCommand(doc.sessionId, command);
      if (!result.ok) {
        setError(`${result.code}: ${result.message ?? 'comando rechazado'}`);
        return;
      }
      setStatus(`Comando '${command.cmd}' aplicado (v${result.version ?? '?'})`);
    },
    [doc],
  );

  const moveItem = useCallback(
    (id: string, top: Length, left: Length): void => {
      // Optimista: el lienzo ya movió el nodo; aquí se refleja en la proyección.
      setDoc((current) =>
        current
          ? { ...current, projection: moveItemInProjection(current.projection, id, top, left) }
          : current,
      );
      void sendCommand({ cmd: 'setLocation', id, top, left });
    },
    [sendCommand],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.undo(doc.sessionId);
    if (!result.ok) setError(`${result.code}: ${result.message ?? 'no se pudo deshacer'}`);
    else setStatus(`Deshecho (v${result.version ?? '?'})`);
  }, [doc]);

  const redo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.redo(doc.sessionId);
    if (!result.ok) setError(`${result.code}: ${result.message ?? 'no se pudo rehacer'}`);
    else setStatus(`Rehecho (v${result.version ?? '?'})`);
  }, [doc]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!doc || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) void redo();
        else void undo();
      } else if (key === 'y') {
        event.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doc, undo, redo]);

  const open = async (): Promise<void> => {
    setError(null);
    const picked = await window.api.pickFile();
    if (!picked.ok || !picked.path) return;

    const result = await window.api.openFile(picked.path);
    if (!result.ok) {
      setError(`${result.code}: ${result.message ?? 'error al abrir'}`);
      return;
    }
    setDoc({ sessionId: result.sessionId, path: picked.path, projection: result.projection });
    setSelectedId(null);
    setDirty(false);
    setStatus(`Abierto: ${picked.path}`);
  };

  const save = async (): Promise<void> => {
    if (!doc) return;
    setError(null);
    const result = await window.api.save(doc.sessionId);
    if (!result.ok) {
      setError(`${result.code}: ${result.message ?? 'error al guardar'}`);
      return;
    }
    setStatus(
      result.bytesIdentical
        ? `Guardado — bytes idénticos al original ✓ (${result.path})`
        : `Guardado: ${result.path}`,
    );
  };

  const close = async (): Promise<void> => {
    if (!doc) return;
    const result = await window.api.close(doc.sessionId);
    if (!result.ok) {
      if ('code' in result) {
        setError(`${result.code}: ${result.message ?? 'no se pudo cerrar'}`);
      } else {
        setError('El documento tiene cambios sin guardar.');
      }
      return;
    }
    setDoc(null);
    setSelectedId(null);
    setDirty(false);
    setStatus('Documento cerrado.');
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">RDLC Report Designer</strong>
        <button onClick={() => void open()}>Abrir…</button>
        <button onClick={() => void save()} disabled={!doc}>
          Guardar
        </button>
        <button onClick={() => void close()} disabled={!doc}>
          Cerrar
        </button>
        <span className="sep" />
        <button onClick={() => void undo()} disabled={!doc} title="Ctrl+Z">
          Deshacer
        </button>
        <button onClick={() => void redo()} disabled={!doc} title="Ctrl+Shift+Z / Ctrl+Y">
          Rehacer
        </button>
        <span className="spacer" />
        {selectedId ? <span className="selection">{selectedId}</span> : null}
        <span className="zoom">
          <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</button>
        </span>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {!hasBackend ? (
        <div className="error">
          Modo navegador: sin backend IPC. Arranca la aplicación con{' '}
          <code>pnpm --filter @rdlc-designer/back dev</code>.
        </div>
      ) : null}

      <main className="content">
        {doc ? (
          <>
            <div className="docinfo">
              <span className="file">
                {doc.path}
                {dirty ? <span className="dirty"> *</span> : null}
              </span>
              {stats ? (
                <span className="stats">
                  {stats.total} elementos · {formatKinds(stats.byKind)}
                </span>
              ) : null}
              {reloads > 0 ? <span className="reload">{reloads} recarga(s) externa(s)</span> : null}
            </div>
            <CanvasPreview
              projection={doc.projection}
              zoom={zoom}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveItem={moveItem}
            />
          </>
        ) : (
          <div className="empty">
            <p>Sin documento abierto.</p>
            <p className="hint">
              Flujo F1: abre un .rdlc, selecciona un elemento y arrástralo (imán de 0,1 cm; Shift
              lo ignora), deshaz con Ctrl+Z y guarda: solo cambian los valores editados.
            </p>
          </div>
        )}
      </main>

      <footer className="statusbar">{status}</footer>
    </div>
  );
}

function moveItemInProjection(
  projection: ProjectionDto,
  id: string,
  top: Length,
  left: Length,
): ProjectionDto {
  const move = (items: ItemDto[]): ItemDto[] =>
    items.map((item) => (item.id === id ? { ...item, top, left } : item));

  return {
    ...projection,
    page: {
      ...projection.page,
      header: { ...projection.page.header, items: move(projection.page.header.items) },
      body: { ...projection.page.body, items: move(projection.page.body.items) },
      footer: { ...projection.page.footer, items: move(projection.page.footer.items) },
    },
  };
}

function countItems(projection: ProjectionDto): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  let total = 0;

  const walk = (items: ItemDto[]): void => {
    for (const item of items) {
      total += 1;
      byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (cell?.content) walk([cell.content]);
          }
        }
      }
    }
  };

  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return { total, byKind };
}

function formatKinds(byKind: Record<string, number>): string {
  return Object.entries(byKind)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
}
