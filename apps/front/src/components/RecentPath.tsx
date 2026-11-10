import type { ReactNode } from 'react';
import { splitRecentPath } from '@/lib/recentPath';

/**
 * Un informe reciente en una lista (menú Fichero, paleta): el nombre del
 * fichero y, atenuada, su carpeta **recortada por el principio** («…\Ventas»).
 * Cortada por el final, todas las rutas se veían iguales. Quien la monta pone
 * la ruta entera en el `title`.
 */
export function RecentPath({ path }: { path: string }): ReactNode {
  const { name, folder } = splitRecentPath(path);
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="min-w-0 shrink truncate">{name}</span>
      {folder ? (
        // `rtl` lleva la elipsis a la izquierda; `bdi` mantiene la ruta en su
        // orden (sin él, las barras y la unidad cambiarían de sitio).
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-muted-foreground [direction:rtl]">
          <bdi dir="ltr">{folder}</bdi>
        </span>
      ) : null}
    </span>
  );
}
