import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Paso por defecto de las flechas ↑/↓. */
const DEFAULT_STEP = 0.1;
/** Velocidad del arrastre por defecto: 10 px = 1 unidad. */
const DEFAULT_PER_PX = 0.1;

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined) value = Math.max(value, min);
  if (max !== undefined) value = Math.min(value, max);
  return value;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface NumberInputProps {
  /** Valor actual en la unidad que se muestra (`null` = sin valor, placeholder). */
  value: number | null;
  onCommit: (value: number) => void;
  /** Nombre accesible del campo (también prefijo de las flechas). */
  label: string;
  title?: string;
  disabled?: boolean;
  /**
   * Eje del arrastre: `x` (derecha aumenta) o `y` (eje vertical). En `y` el
   * arrastre hacia arriba aumenta salvo `invert: false` (p. ej. la posición Y,
   * donde arrastrar hacia abajo mueve el item hacia abajo y aumenta el valor).
   */
  axis?: 'x' | 'y';
  invert?: boolean;
  min?: number;
  max?: number;
  /** Paso de las flechas ↑/↓ (por defecto 0,1). */
  step?: number;
  /** Unidades por píxel de arrastre (por defecto 0,1). */
  perPx?: number;
  /** Texto tras las flechas (`cm`, `pt`…). */
  suffix?: string;
  placeholder?: string;
  /** Decimales mostrados (por defecto 2). */
  decimals?: number;
  /** Clases extra del input (tamaño/anchura de cada llamada). */
  className?: string;
}

/**
 * Campo numérico estándar del proyecto, con tres formas de cambiar el valor:
 *
 * - **Teclear**: borrador mientras se escribe; Enter o blur confirma, Escape
 *   cancela (coma decimal admitida).
 * - **Flechas ↑/↓**: subir aumenta y bajar reduce a pasos de `step`, con un
 *   commit por clic (como el spinner del grosor de borde).
 * - **Arrastrar sobre el valor**: con el input sin foco el cursor cambia a
 *   redimensionado y el movimiento ajusta el valor en vivo; al soltar se
 *   confirma una sola vez (un paso de undo). Escape cancela el arrastre y un
 *   clic sin arrastre coloca el cursor para teclear.
 *
 * Los límites (`min`/`max`) se aplican también al arrastre y a las flechas.
 */
export function NumberInput({
  value,
  onCommit,
  label,
  title,
  disabled = false,
  axis = 'y',
  invert = true,
  min,
  max,
  step = DEFAULT_STEP,
  perPx = DEFAULT_PER_PX,
  suffix,
  placeholder,
  decimals = 2,
  className,
}: NumberInputProps): ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const text = draft ?? (value === null ? '' : value.toFixed(decimals));

  const commitText = (): void => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      const next = round(clamp(parsed, min, max), 4);
      if (Math.abs(next - (value ?? 0)) > 1e-9) onCommit(next);
    }
    setDraft(null);
  };

  /** Flechas: ±step desde el borrador si lo hay (un commit por clic). */
  const stepBy = (direction: 1 | -1): void => {
    const parsed = draft !== null ? Number.parseFloat(draft.replace(',', '.')) : NaN;
    const base = Number.isFinite(parsed) ? parsed : (value ?? min ?? 0);
    const next = round(clamp(base + direction * step, min, max), 4);
    if (Math.abs(next - base) < 1e-9) return;
    setDraft(null);
    onCommit(next);
  };

  /** Arrastre sobre el valor (con el input sin foco): ajusta y confirma al soltar. */
  const startScrub = (event: ReactPointerEvent<HTMLInputElement>): void => {
    if (disabled || event.button !== 0 || focused || value === null) return;
    event.preventDefault();
    const originY = event.clientY;
    const originX = event.clientX;
    const start = value;
    let last = start;
    let done = false;
    setScrubbing(true);
    setDraft(start.toFixed(decimals));

    const finish = (apply: boolean): void => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onCancel);
      setScrubbing(false);
      // El borrador se limpia SIEMPRE: si el undo revierte el valor, el campo
      // debe volver a mostrar el de la proyección.
      if (apply && Math.abs(last - start) > 1e-9) onCommit(last);
      setDraft(null);
    };
    const onMove = (move: PointerEvent): void => {
      const delta =
        axis === 'x'
          ? move.clientX - originX
          : invert
            ? originY - move.clientY
            : move.clientY - originY;
      last = round(clamp(start + delta * perPx, min, max), 4);
      setDraft(last.toFixed(decimals));
    };
    const onUp = (up: PointerEvent): void => {
      const moved = Math.abs(up.clientX - originX) + Math.abs(up.clientY - originY) > 2;
      if (!moved) {
        // Clic sin arrastre: colocar el cursor para teclear.
        finish(false);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      finish(true);
    };
    const onCancel = (key: KeyboardEvent): void => {
      if (key.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onCancel);
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Input
        ref={inputRef}
        className={cn(
          'px-1.5 text-right font-mono text-[11px] tabular-nums',
          focused ? 'cursor-text' : axis === 'x' ? 'cursor-ew-resize' : 'cursor-ns-resize',
          scrubbing && 'select-none',
          className,
        )}
        value={text}
        placeholder={placeholder}
        inputMode="decimal"
        disabled={disabled}
        aria-label={label}
        title={title}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commitText();
        }}
        onPointerDown={startScrub}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitText();
          if (event.key === 'Escape') setDraft(null);
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            stepBy(1);
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            stepBy(-1);
          }
        }}
      />
      <span className={cn('flex shrink-0 flex-col', disabled && 'pointer-events-none opacity-40')}>
        <button
          type="button"
          aria-label={`${label}: aumentar`}
          title="Aumentar (↑)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(1)}
          className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronUp className="size-2.5" />
        </button>
        <button
          type="button"
          aria-label={`${label}: reducir`}
          title="Reducir (↓)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepBy(-1)}
          className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="size-2.5" />
        </button>
      </span>
      {suffix ? <span className="shrink-0 text-[10px] text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}
