import { useEffect, useEffectEvent } from 'react';
import { NUDGE_PT_CM } from './useItemEditing';

/**
 * Atajos globales del editor. Los handlers ven siempre el estado actual
 * (`useEffectEvent`) sin re-suscribir los listeners en cada render.
 *
 * Ctrl+K y Ctrl+S son globales también mientras se escribe en un panel (no
 * tienen sentido «dentro» de un campo); con un diálogo abierto se ignoran: sus
 * teclas son suyas (el foco vive en el diálogo). El resto se ignora cuando el
 * foco está en un campo o editor de texto.
 */
export interface GlobalKeysOptions {
  /** Hay documento abierto (sin él solo funciona la paleta). */
  hasDocument: boolean;
  /** Hay item seleccionado (flechas, Supr, Ctrl+D/C/X). */
  hasSelection: boolean;
  /** Posición de pegado al final del cuerpo (Ctrl+V). */
  bodyIndex: number;
  onTogglePalette: () => void;
  onSave: () => void;
  /** Ctrl+Shift+S: guardar como. */
  onSaveAs: () => void;
  /** Ctrl+N: informe nuevo. */
  onNew: () => void;
  /** Ctrl+O: abrir. */
  onOpen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Ctrl+1: ajusta el zoom al ancho del lienzo. */
  onZoomFitWidth: () => void;
  /** Ctrl+0: zoom al 100 % (tamaño real). */
  onZoomReset: () => void;
  onNudge: (dxCm: number, dyCm: number) => void;
  onFlushNudge: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPasteAtBody: (index: number) => void;
  /** Z-order con Ctrl+Shift+] / Ctrl+Shift+[. */
  onBringToFront: () => void;
  onSendToBack: () => void;
  /** Esc: sube al contenedor del item seleccionado. */
  onSelectParent: () => void;
}

export function useGlobalKeys(options: GlobalKeysOptions): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    // El evento ya estaba manejado (p. ej. un slider que consume las flechas):
    // no se actúa dos veces sobre él.
    if (event.defaultPrevented) return;

    const key = event.key.toLowerCase();
    const accel = event.ctrlKey || event.metaKey;
    const target = event.target as HTMLElement | null;
    const isTextField = Boolean(
      target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable),
    );
    /**
     * Controles que usan las flechas/Supr para sí mismos (botones, pestañas,
     * sliders, checkboxes, radios…): con el foco en ellos, las flechas navegan
     * el control y no mueven el item seleccionado del lienzo (BUG-41).
     */
    const isInteractiveControl = Boolean(
      target?.closest(
        'button, [role="slider"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"], [role="spinbutton"], [role="menuitem"], [role="option"]',
      ),
    );
    // Con un diálogo o menú **abierto**, sus teclas son suyas (Escape cierra el
    // diálogo y no debe además cambiar la selección del lienzo; Ctrl+S no debe
    // guardar por debajo). Durante la animación de cierre ya no bloquea.
    const dialogOpen = Boolean(
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
      ),
    );

    // Ctrl+K: la paleta, también mientras se escribe en un panel (nunca encima
    // de un diálogo, que mantiene el foco y la trampa de Radix).
    if (accel && key === 'k') {
      if (dialogOpen) return;
      event.preventDefault();
      options.onTogglePalette();
      return;
    }

    // Ctrl+S: guardar, también desde un campo del panel (promesa de la paleta).
    // Ctrl+Shift+S: guardar como.
    if (accel && key === 's') {
      if (dialogOpen || !options.hasDocument) return;
      event.preventDefault();
      if (event.shiftKey) options.onSaveAs();
      else options.onSave();
      return;
    }

    // Ctrl+O / Ctrl+N: órdenes de aplicación, valen sin documento abierto.
    if (accel && key === 'o') {
      if (dialogOpen) return;
      event.preventDefault();
      options.onOpen();
      return;
    }
    if (accel && key === 'n') {
      if (dialogOpen) return;
      event.preventDefault();
      options.onNew();
      return;
    }

    // Zoom de un toque: 100 % (tamaño real) y ajustar al ancho. Como Ctrl+K/S,
    // son órdenes de vista: valen también con el foco en un campo del panel.
    if (accel && key === '0') {
      if (dialogOpen || !options.hasDocument) return;
      event.preventDefault();
      options.onZoomReset();
      return;
    }
    if (accel && key === '1') {
      if (dialogOpen || !options.hasDocument) return;
      event.preventDefault();
      options.onZoomFitWidth();
      return;
    }

    if (dialogOpen || isTextField) return;
    if (!options.hasDocument) return;

    // Con el foco en un control (toolbar, pestaña, slider…), Supr/Flechas son
    // del control: no borran ni mueven el item seleccionado (BUG-41).
    if (
      isInteractiveControl &&
      !accel &&
      (event.key.startsWith('Arrow') || event.key === 'Delete')
    ) {
      return;
    }

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
    // Z-order: Ctrl+Shift+] trae al frente y Ctrl+Shift+[ envía atrás.
    if (accel && event.shiftKey && (key === ']' || key === '}') && options.hasSelection) {
      event.preventDefault();
      options.onBringToFront();
      return;
    }
    if (accel && event.shiftKey && (key === '[' || key === '{') && options.hasSelection) {
      event.preventDefault();
      options.onSendToBack();
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
