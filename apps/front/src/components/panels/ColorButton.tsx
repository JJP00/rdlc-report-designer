import type { ReactNode } from 'react';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { contrastColor } from '@/lib/style';
import { cn } from '@/lib/utils';

/**
 * Selector de color de **texto** y de **resaltado** (barra de formato y editor
 * de runs). La letra «A» de color de texto va en el color del tema (siempre
 * legible, también en modo oscuro) y el color elegido se ve en la **barra**
 * inferior; el resaltado pinta la «A» **dentro de una tesela** del color, con
 * la letra en el color de contraste. El `<input type="color">` real cubre el
 * botón en invisible (toda el área es zona de acierto) y el commit es diferido
 * (arrastrar la paleta no lanza un comando por paso).
 */
export function ColorButton({
  title,
  value,
  fallback,
  highlight,
  size = 'md',
  ariaLabel,
  onChange,
}: {
  title: string;
  /** Color declarado (hex, expresión o vacío: se resuelve con `fallback`). */
  value?: string;
  fallback: string;
  /** Resaltado: la «A» sobre una tesela del color (y no la barra inferior). */
  highlight?: boolean;
  /** `md` = barra de formato (28 px); `sm` = editor de runs (24 px). */
  size?: 'sm' | 'md';
  /** Etiqueta accesible propia (p. ej. «Color del run 1»); por defecto, `title`. */
  ariaLabel?: string;
  onChange: (color: string) => void;
}): ReactNode {
  const { color, change } = useDeferredColor(value, fallback, onChange);

  return (
    <label
      title={title}
      className={cn(
        'relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border bg-background hover:bg-muted',
        size === 'sm' ? 'h-6 w-8' : 'h-7 w-8',
      )}
    >
      {highlight ? (
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[11px] font-bold leading-none ring-1 ring-black/15 ring-inset dark:ring-white/25"
          style={{ backgroundColor: color, color: contrastColor(color) }}
        >
          A
        </span>
      ) : (
        <>
          <span aria-hidden className="text-[11px] font-bold leading-none">
            A
          </span>
          <span
            aria-hidden
            className="h-[3px] w-4 rounded-full ring-1 ring-black/15 ring-inset dark:ring-white/25"
            style={{ backgroundColor: color }}
          />
        </>
      )}
      <input
        type="color"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        value={color}
        aria-label={ariaLabel ?? title}
        onChange={(event) => change(event.target.value)}
      />
    </label>
  );
}
