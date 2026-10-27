import { useT } from '@rdlc-designer/i18n/react';
import { CircleCheck, Info, OctagonX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LintCounts } from '@/lib/lint';

export interface StatusBarProps {
  status: string;
  /** Ruta del fichero abierto (null si no hay documento). */
  path: string | null;
  dirty: boolean;
  /** Ej. «10 elementos · 1 tablix, 6 textbox». */
  stats: string | null;
  reloads: number;
  /** Conteo de hallazgos del lint (null si no se han pedido). */
  problems?: LintCounts | null;
  problemsOpen?: boolean;
  /** Abre o cierra el panel «Problemas» (el indicador del pie es el botón). */
  onToggleProblems?: () => void;
}

/** Pie: mensaje de estado + info del documento (ruta, dirty, recargas, conteo). */
export function StatusBar({
  status,
  path,
  dirty,
  stats,
  reloads,
  problems,
  problemsOpen = false,
  onToggleProblems,
}: StatusBarProps): ReactNode {
  const t = useT();
  const total = problems ? problems.error + problems.warning + problems.hint : 0;

  return (
    <footer className="flex items-center gap-3 border-t bg-chrome px-3 py-1 text-xs text-muted-foreground">
      <span className="truncate" role="status">
        {status}
      </span>
      {path ? (
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {problems && onToggleProblems ? (
            <button
              type="button"
              className="flex items-center gap-2 rounded px-1 hover:bg-muted hover:text-foreground"
              aria-expanded={problemsOpen}
              aria-label={t('lint.summary', {
                errors: problems.error,
                warnings: problems.warning,
                hints: problems.hint,
              })}
              title={problemsOpen ? t('lint.hide') : t('lint.toggle')}
              onClick={onToggleProblems}
            >
              {total === 0 ? (
                <span className="flex items-center gap-1">
                  <CircleCheck aria-hidden className="size-3.5" />
                  {t('lint.empty')}
                </span>
              ) : (
                <>
                  {problems.error > 0 ? (
                    <span className="flex items-center gap-1 text-destructive">
                      <OctagonX aria-hidden className="size-3.5" />
                      {problems.error}
                    </span>
                  ) : null}
                  {problems.warning > 0 ? (
                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <TriangleAlert aria-hidden className="size-3.5" />
                      {problems.warning}
                    </span>
                  ) : null}
                  {problems.hint > 0 ? (
                    <span className="flex items-center gap-1">
                      <Info aria-hidden className="size-3.5" />
                      {problems.hint}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          ) : null}
          <span className="max-w-[340px] truncate font-medium text-foreground" title={path}>
            {path}
            {dirty ? <span className="text-amber-700 dark:text-amber-400"> *</span> : null}
          </span>
          {stats ? <span>{stats}</span> : null}
          {reloads > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {t('status.reloads', { count: reloads })}
            </span>
          ) : null}
        </span>
      ) : null}
    </footer>
  );
}
