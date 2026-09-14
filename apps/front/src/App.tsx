import type { ItemDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

  // Sin preload (p. ej. abriendo el renderer en un navegador) no hay backend IPC.
  const hasBackend = typeof window !== 'undefined' && window.api !== undefined;

  useEffect(() => {
    if (!hasBackend) return;
    return window.api.onDocumentChanged((event) => {
      setDoc((current) =>
        current && current.sessionId === event.sessionId
          ? { ...current, projection: event.projection }
          : current,
      );
      setReloads((count) => count + 1);
      setStatus(`Recargado desde disco (versión ${event.projection.version})`);
    });
  }, []);

  const stats = useMemo(() => (doc ? countItems(doc.projection) : null), [doc]);

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
        <span className="spacer" />
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
              <span className="file">{doc.path}</span>
              {stats ? (
                <span className="stats">
                  {stats.total} elementos · {formatKinds(stats.byKind)}
                </span>
              ) : null}
              {reloads > 0 ? <span className="reload">{reloads} recarga(s) externa(s)</span> : null}
            </div>
            <CanvasPreview projection={doc.projection} zoom={zoom} />
          </>
        ) : (
          <div className="empty">
            <p>Sin documento abierto.</p>
            <p className="hint">
              Prueba el flujo F0: abre un .rdlc, guárdalo (debe ser byte a byte idéntico) y edita
              el XML por fuera para ver la recarga en vivo.
            </p>
          </div>
        )}
      </main>

      <footer className="statusbar">{status}</footer>
    </div>
  );
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
