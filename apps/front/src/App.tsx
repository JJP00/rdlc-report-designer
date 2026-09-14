import type {
  CommandResult,
  ItemDto,
  Length,
  ProjectionDto,
  RdlcCommand,
  TextboxDto,
} from '@rdlc-designer/contracts';
import { FolderOpen, Minus, Plus, Redo2, Save, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { TextPanel } from '@/components/panels/TextPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { countItems, findItem, formatKinds, patchItem } from '@/lib/projection';

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

    let cancelled = false;
    void (async () => {
      try {
        // Guarda para preloads antiguos en dev (requiere reinicio al cambiar el preload).
        if (typeof window.api.consumePendingOpen !== 'function') return;
        const pending = await window.api.consumePendingOpen();
        if (cancelled || !pending.path) return;
        const result = await window.api.openFile(pending.path);
        if (cancelled) return;
        if (!result.ok) {
          setError(`${result.code}: ${result.message ?? 'error al abrir'}`);
          return;
        }
        setDoc({ sessionId: result.sessionId, path: pending.path, projection: result.projection });
        setStatus(`Abierto: ${pending.path}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasBackend]);

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
  const selectedItem = useMemo(
    () => (doc && selectedId ? findItem(doc.projection, selectedId) : undefined),
    [doc, selectedId],
  );

  const sendCommand = useCallback(
    async (command: RdlcCommand): Promise<CommandResult | undefined> => {
      if (!doc) return undefined;
      const result = await window.api.executeCommand(doc.sessionId, command);
      if (!result.ok) {
        setError(`${result.code}: ${result.message ?? 'comando rechazado'}`);
        return result;
      }
      setStatus(`Comando '${command.cmd}' aplicado (v${result.version ?? '?'})`);
      return result;
    },
    [doc],
  );

  /** Reconcilia el optimismo con los valores normalizados por el dominio. */
  const reconcile = useCallback((id: string, applied: Partial<ItemDto> | undefined): void => {
    if (!applied || Object.keys(applied).length === 0) return;
    setDoc((current) =>
      current ? { ...current, projection: patchItem(current.projection, id, applied) } : current,
    );
  }, []);

  const moveItem = useCallback(
    (id: string, top: Length, left: Length): void => {
      // Optimista: el lienzo ya movió el nodo; aquí se refleja en la proyección.
      setDoc((current) =>
        current ? { ...current, projection: patchItem(current.projection, id, { top, left }) } : current,
      );
      void sendCommand({ cmd: 'setLocation', id, top, left }).then((result) =>
        reconcile(id, result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, sendCommand],
  );

  const setItemLocation = useCallback(
    (top: Length, left: Length): void => {
      if (!selectedItem) return;
      moveItem(selectedItem.id, top, left);
    },
    [moveItem, selectedItem],
  );

  const setItemSize = useCallback(
    (width: Length, height: Length): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;
      setDoc((current) =>
        current
          ? { ...current, projection: patchItem(current.projection, id, { width, height }) }
          : current,
      );
      void sendCommand({ cmd: 'setSize', id, width, height }).then((result) =>
        reconcile(id, result?.ok ? result.applied : undefined),
      );
    },
    [reconcile, selectedItem, sendCommand],
  );

  const setRunText = useCallback(
    (p: number, r: number, value: string): void => {
      if (!selectedItem || selectedItem.kind !== 'textbox') return;
      const updated: TextboxDto = {
        ...selectedItem,
        paragraphs: selectedItem.paragraphs.map((paragraph, paragraphIndex) =>
          paragraphIndex === p
            ? {
                ...paragraph,
                runs: paragraph.runs.map((run, runIndex) =>
                  runIndex === r ? { ...run, value } : run,
                ),
              }
            : paragraph,
        ),
      };
      setDoc((current) =>
        current
          ? { ...current, projection: patchItem(current.projection, selectedItem.id, updated) }
          : current,
      );
      void sendCommand({ cmd: 'setText', id: selectedItem.id, p, r, value });
    },
    [selectedItem, sendCommand],
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
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        <header className="flex items-center gap-1.5 border-b bg-background px-3 py-1.5">
          <span className="mr-2 text-sm font-semibold">RDLC Report Designer</span>

          <Button variant="outline" size="sm" onClick={() => void open()}>
            <FolderOpen data-icon="inline-start" />
            Abrir…
          </Button>
          <Button variant="outline" size="sm" onClick={() => void save()} disabled={!doc}>
            <Save data-icon="inline-start" />
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void close()} disabled={!doc}>
            <X data-icon="inline-start" />
            Cerrar
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => void undo()} disabled={!doc}>
                <Undo2 data-icon="inline-start" />
                Deshacer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ctrl+Z</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => void redo()} disabled={!doc}>
                <Redo2 data-icon="inline-start" />
                Rehacer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ctrl+Shift+Z o Ctrl+Y</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {selectedId ? (
            <Badge variant="secondary" className="font-mono">
              {selectedId}
            </Badge>
          ) : null}

          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
            >
              <Minus />
            </Button>
            <span className="w-10 text-center text-xs tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            >
              <Plus />
            </Button>
          </div>
        </header>

        {error ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
            {error}
          </div>
        ) : null}
        {!hasBackend ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
            Modo navegador: sin backend IPC. Arranca la aplicación con{' '}
            <code>pnpm --filter @rdlc-designer/back dev</code>.
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            {doc ? (
              <>
                <div className="flex items-center gap-4 border-b bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {doc.path}
                    {dirty ? <span className="text-amber-600"> *</span> : null}
                  </span>
                  {stats ? (
                    <span>
                      {stats.total} elementos · {formatKinds(stats.byKind)}
                    </span>
                  ) : null}
                  {reloads > 0 ? (
                    <span className="text-amber-600">{reloads} recarga(s) externa(s)</span>
                  ) : null}
                </div>
                <CanvasPreview
                  projection={doc.projection}
                  zoom={zoom}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMoveItem={moveItem}
                  onZoomChange={setZoom}
                />
              </>
            ) : (
              <div className="m-auto max-w-lg text-center text-sm text-muted-foreground">
                <p>Sin documento abierto.</p>
                <p className="mt-2">
                  Flujo F1: abre un .rdlc, selecciona un elemento y arrástralo (imán de 0,1 cm;
                  Shift lo ignora), edita su texto o expresión en el panel derecho, deshaz con
                  Ctrl+Z y guarda: solo cambian los valores editados.
                </p>
              </div>
            )}
          </div>

          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-background">
            {selectedItem ? (
              <>
                <PropertiesPanel
                  item={selectedItem}
                  onSetLocation={setItemLocation}
                  onSetSize={setItemSize}
                />
                {selectedItem.kind === 'textbox' ? (
                  <TextPanel item={selectedItem} onSetText={setRunText} />
                ) : null}
              </>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                Selecciona un elemento en el lienzo para editar sus propiedades.
              </p>
            )}
          </aside>
        </main>

        <footer className="border-t bg-background px-3 py-1 text-xs text-muted-foreground">
          {status}
        </footer>
      </div>
    </TooltipProvider>
  );
}
