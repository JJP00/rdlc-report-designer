import type { ReactNode } from 'react';

export interface StatusBarProps {
  status: string;
  /** Ruta del fichero abierto (null si no hay documento). */
  path: string | null;
  dirty: boolean;
  /** Ej. «10 elementos · 1 tablix, 6 textbox». */
  stats: string | null;
  reloads: number;
}

/** Pie: mensaje de estado + info del documento (ruta, dirty, recargas, conteo). */
export function StatusBar({ status, path, dirty, stats, reloads }: StatusBarProps): ReactNode {
  return (
    <footer className="flex items-center gap-3 border-t bg-background px-3 py-1 text-xs text-muted-foreground">
      <span className="truncate" role="status">
        {status}
      </span>
      {path ? (
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span className="max-w-[340px] truncate font-medium text-foreground" title={path}>
            {path}
            {dirty ? <span className="text-amber-600"> *</span> : null}
          </span>
          {stats ? <span>{stats}</span> : null}
          {reloads > 0 ? (
            <span className="text-amber-600">{reloads} recarga(s) externa(s)</span>
          ) : null}
        </span>
      ) : null}
    </footer>
  );
}
