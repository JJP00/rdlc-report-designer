import { useT } from '@rdlc-designer/i18n/react';
import { Check, Copy, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export interface EditorBannersProps {
  error: string | null;
  conflict: string | null;
  /** Ruta de la sesión que ya no existe en disco (BUG-55). */
  fileMissing: string | null;
  hasBackend: boolean;
  /** Cierra el aviso de error a mano (además del cierre automático). */
  onDismissError?: () => void;
  /** Reabre el diálogo para resolver el conflicto de fichero. */
  onResolveConflict?: () => void;
}

/**
 * Avisos del editor: error del último comando, conflicto de fichero, fichero
 * desaparecido y modo navegador.
 */
export function EditorBanners({
  error,
  conflict,
  fileMissing,
  hasBackend,
  onDismissError,
  onResolveConflict,
}: EditorBannersProps): ReactNode {
  const t = useT();

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive"
        >
          <span className="max-h-40 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-xs">
            {error}
          </span>
          <CopyErrorButton error={error} />
          <button
            type="button"
            aria-label={t('app.banner.dismiss')}
            title={t('app.banner.dismiss')}
            className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/15"
            onClick={onDismissError}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {conflict || fileMissing ? (
        // Conflicto y «fichero desaparecido» pueden coincidir: un solo aviso
        // ámbar con las dos frases (antes se apilaban dos). El testid del
        // fichero desaparecido se conserva en el banner fusionado.
        <div
          data-testid={fileMissing ? 'file-missing-banner' : undefined}
          className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1 line-clamp-2 break-words">
            {conflict ? <>{t('app.banner.conflict')} </> : null}
            {fileMissing ? <>{t('app.banner.fileMissing')} </> : null}
            <span className="font-mono" title={conflict ?? fileMissing ?? undefined}>
              {conflict ?? fileMissing}
            </span>
          </span>
          {conflict ? (
            <button
              type="button"
              className="shrink-0 rounded border border-amber-600/40 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-amber-500/20"
              onClick={onResolveConflict}
            >
              {t('app.banner.resolve')}
            </button>
          ) : null}
        </div>
      ) : null}
      {!hasBackend ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
          {t('app.banner.noBackend', { command: 'pnpm --filter @rdlc-designer/back dev' })}
        </div>
      ) : null}
    </>
  );
}

/** Copia el error completo (con sus detalles de validación) al portapapeles. */
function CopyErrorButton({ error }: { error: string }): ReactNode {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(error).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      aria-label={t('app.banner.copyError')}
      title={t('app.banner.copyError')}
      className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/15"
      onClick={copy}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
