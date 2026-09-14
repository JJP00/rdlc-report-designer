import type {
  CommandResult,
  ItemDto,
  Length,
  ProjectionDto,
  RdlcCommand,
  TextboxDto,
} from '@rdlc-designer/contracts';
import { FolderOpen, Minus, Plus, Redo2, Save, Settings2, Undo2, Variable, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { TextPanel } from '@/components/panels/TextPanel';
import { VariablesPanel } from '@/components/panels/VariablesPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cm, countItems, findItem, formatKinds, patchItem, toCm } from '@/lib/projection';

/** Paso de las flechas: 1pt (Shift = 10pt). */
const NUDGE_PT_CM = 2.54 / 72;
/** Racha de flechas: se agrupa en UN comando (un paso de undo). */
const NUDGE_BURST_MS = 400;

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
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

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

  /* --------------------- mover con flechas (1pt / 10pt) ------------------ */

  const moveBurst = useRef<{
    id: string;
    topCm: number;
    leftCm: number;
    dx: number;
    dy: number;
    timer: number;
  } | null>(null);

  const flushMoveBurst = useCallback((): void => {
    const burst = moveBurst.current;
    moveBurst.current = null;
    if (!burst) return;
    void sendCommand({
      cmd: 'setLocation',
      id: burst.id,
      top: cm(burst.topCm + burst.dy),
      left: cm(burst.leftCm + burst.dx),
    }).then((result) => reconcile(burst.id, result?.ok ? result.applied : undefined));
  }, [reconcile, sendCommand]);

  const nudge = useCallback(
    (dxCm: number, dyCm: number): void => {
      if (!selectedItem) return;
      const id = selectedItem.id;
      const current = moveBurst.current;
      const burst =
        current && current.id === id
          ? current
          : {
              id,
              topCm: toCm(selectedItem.top),
              leftCm: toCm(selectedItem.left),
              dx: 0,
              dy: 0,
              timer: 0,
            };
      burst.dx += dxCm;
      burst.dy += dyCm;
      window.clearTimeout(burst.timer);
      burst.timer = window.setTimeout(() => flushMoveBurst(), NUDGE_BURST_MS);
      moveBurst.current = burst;

      const top = cm(burst.topCm + burst.dy);
      const left = cm(burst.leftCm + burst.dx);
      setDoc((cur) =>
        cur ? { ...cur, projection: patchItem(cur.projection, id, { top, left }) } : cur,
      );
    },
    [flushMoveBurst, selectedItem],
  );

  // Al cambiar de selección, cierra la racha pendiente.
  useEffect(() => () => flushMoveBurst(), [selectedId, flushMoveBurst]);

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

  /* ------------------- página y código (Propiedades del informe) ---------- */

  const setPageSize = useCallback(
    (width: Length, height: Length): void => {
      if (!doc) return;
      setDoc((current) =>
        current
          ? {
              ...current,
              projection: { ...current.projection, page: { ...current.projection.page, width, height } },
            }
          : current,
      );
      void sendCommand({ cmd: 'setPageSize', width, height });
    },
    [doc, sendCommand],
  );

  const setPageMargins = useCallback(
    (margins: { top: Length; bottom: Length; left: Length; right: Length }): void => {
      if (!doc) return;
      setDoc((current) =>
        current
          ? {
              ...current,
              projection: { ...current.projection, page: { ...current.projection.page, margins } },
            }
          : current,
      );
      void sendCommand({ cmd: 'setPageMargins', ...margins });
    },
    [doc, sendCommand],
  );

  const setReportCode = useCallback(
    (code: string): void => {
      if (!doc) return;
      setDoc((current) =>
        current
          ? {
              ...current,
              projection: {
                ...current.projection,
                meta: { ...current.projection.meta, code: { ...current.projection.meta.code, text: code } },
              },
            }
          : current,
      );
      void sendCommand({ cmd: 'setReportCode', code });
    },
    [doc, sendCommand],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    flushMoveBurst();
    const result = await window.api.undo(doc.sessionId);
    if (!result.ok) setError(`${result.code}: ${result.message ?? 'no se pudo deshacer'}`);
    else setStatus(`Deshecho (v${result.version ?? '?'})`);
  }, [doc, flushMoveBurst]);

  const redo = useCallback(async (): Promise<void> => {
    if (!doc) return;
    flushMoveBurst();
    const result = await window.api.redo(doc.sessionId);
    if (!result.ok) setError(`${result.code}: ${result.message ?? 'no se pudo rehacer'}`);
    else setStatus(`Rehecho (v${result.version ?? '?'})`);
  }, [doc, flushMoveBurst]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!doc) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) void redo();
        else void undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        void redo();
        return;
      }
      if (event.key.startsWith('Arrow') && selectedItem) {
        event.preventDefault();
        const step = NUDGE_PT_CM * (event.shiftKey ? 10 : 1);
        if (event.key === 'ArrowUp') nudge(0, -step);
        else if (event.key === 'ArrowDown') nudge(0, step);
        else if (event.key === 'ArrowLeft') nudge(-step, 0);
        else if (event.key === 'ArrowRight') nudge(step, 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doc, undo, redo, nudge, selectedItem]);

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

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPropertiesOpen(true)}
            disabled={!doc}
          >
            <Settings2 data-icon="inline-start" />
            Informe…
          </Button>
          <Button
            variant={showVariables ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowVariables((value) => !value)}
            disabled={!doc}
          >
            <Variable data-icon="inline-start" />
            Variables
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
          {showVariables && doc ? (
            <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r bg-background">
              <VariablesPanel
                meta={doc.projection.meta}
                onPick={(expression) => setStatus(`Copiada al portapapeles: ${expression}`)}
              />
            </aside>
          ) : null}

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

      {doc ? (
        <ReportPropertiesDialog
          projection={doc.projection}
          open={propertiesOpen}
          onOpenChange={setPropertiesOpen}
          onSetPageSize={setPageSize}
          onSetPageMargins={setPageMargins}
          onSetReportCode={setReportCode}
        />
      ) : null}
    </TooltipProvider>
  );
}
