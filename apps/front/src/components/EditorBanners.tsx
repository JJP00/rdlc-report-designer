import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EditorBannersProps {
  error: string | null;
  conflict: string | null;
  hasBackend: boolean;
  /** Cierra el aviso de error a mano (además del cierre automático). */
  onDismissError?: () => void;
  /** Reabre el diálogo para resolver el conflicto de fichero. */
  onResolveConflict?: () => void;
}

/** Avisos del editor: error del último comando, conflicto de fichero y modo navegador. */
export function EditorBanners({
  error,
  conflict,
  hasBackend,
  onDismissError,
  onResolveConflict,
}: EditorBannersProps): ReactNode {
  return (
    <>
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            aria-label="Cerrar el aviso"
            className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/15"
            onClick={onDismissError}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {conflict ? (
        <div className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-700">
          <span className="min-w-0 flex-1">
            El fichero <span className="font-mono">{conflict}</span> cambió por fuera y hay cambios
            sin guardar: no se ha recargado para no perderlos.
          </span>
          <button
            type="button"
            className="shrink-0 rounded border border-amber-600/40 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-amber-500/20"
            onClick={onResolveConflict}
          >
            Resolver…
          </button>
        </div>
      ) : null}
      {!hasBackend ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
          Modo navegador: sin backend IPC. Arranca la aplicación con{' '}
          <code>pnpm --filter @rdlc-designer/back dev</code>.
        </div>
      ) : null}
    </>
  );
}
