import { useEffect, useEffectEvent } from 'react';
import { NUDGE_PT_CM } from './useItemEditing';

/**
 * Atajos globales del editor. Los handlers ven siempre el estado actual
 * (`useEffectEvent`) sin re-suscribir los listeners en cada render.
 *
 * Ctrl+K es global incluso mientras se escribe en un panel; el resto se ignora
 * cuando el foco está en un campo o editor de texto.
 */
export interface GlobalKeysOptions {
  /** Hay documento abierto (sin él solo funciona la paleta). */
  hasDocument: boolean;
  /** Hay item seleccionado (flechas, Supr, Ctrl+D/C/X). */
  hasSelection: boolean;
  /** Posición de pegado al final del cuerpo (Ctrl+V). */
  bodyIndex: number;
  onTogglePalette: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNudge: (dxCm: number, dyCm: number) => void;
  onFlushNudge: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPasteAtBody: (index: number) => void;
  /** Esc: sube al contenedor del item seleccionado. */
  onSelectParent: () => void;
}

export function useGlobalKeys(options: GlobalKeysOptions): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const accel = event.ctrlKey || event.metaKey;

    // Ctrl+K es global (también mientras se escribe en un panel).
    if (accel && key === 'k') {
      event.preventDefault();
      options.onTogglePalette();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (!options.hasDocument) return;

    if (accel && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) options.onRedo();
      else options.onUndo();
      return;
    }
    if (accel && key === 'y') {
      event.preventDefault();
      options.onRedo();
      return;
    }
    if (event.key.startsWith('Arrow') && options.hasSelection) {
      event.preventDefault();
      const step = NUDGE_PT_CM * (event.shiftKey ? 10 : 1);
      if (event.key === 'ArrowUp') options.onNudge(0, -step);
      else if (event.key === 'ArrowDown') options.onNudge(0, step);
      else if (event.key === 'ArrowLeft') options.onNudge(-step, 0);
      else if (event.key === 'ArrowRight') options.onNudge(step, 0);
      return;
    }
    if (event.key === 'Delete' && options.hasSelection) {
      event.preventDefault();
      options.onDelete();
      return;
    }
    if (event.key === 'Escape' && options.hasSelection) {
      event.preventDefault();
      options.onSelectParent();
      return;
    }
    if (accel && key === 'd' && options.hasSelection) {
      event.preventDefault();
      options.onDuplicate();
      return;
    }
    if (accel && key === 'c' && options.hasSelection) {
      event.preventDefault();
      options.onCopy();
      return;
    }
    if (accel && key === 'x' && options.hasSelection) {
      event.preventDefault();
      options.onCut();
      return;
    }
    if (accel && key === 'v') {
      event.preventDefault();
      options.onPasteAtBody(options.bodyIndex);
    }
  });

  const onKeyUp = useEffectEvent((event: KeyboardEvent): void => {
    if (event.key.startsWith('Arrow')) options.onFlushNudge();
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
