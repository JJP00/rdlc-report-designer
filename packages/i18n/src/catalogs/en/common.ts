/**
 * Cadenas compartidas por varias superficies.
 *
 * **Congelado durante el barrido por módulos**: no se añaden claves aquí sin
 * consolidar antes; si un módulo necesita una cadena compartida que no está,
 * vive temporalmente en el namespace de ese módulo.
 */
export const common = {
  cancel: 'Cancel',
  close: 'Close',
  undo: 'Undo',
  redo: 'Redo',
  top: 'Top',
  left: 'Left',
  bottom: 'Bottom',
  right: 'Right',
  leaveWithoutSaving: 'Exit without saving',
  closeWithoutSaving: 'Close without saving',
  reloadInterface: 'Reload interface',
  language: 'Language',
  file: 'File',
  shortcuts: {
    saveAs: 'Ctrl+Shift+S',
    prevTab: 'Ctrl+Shift+Tab',
    pageUp: 'Ctrl+Shift+PageUp',
    pageDown: 'Ctrl+Shift+PageDown',
    delete: 'Del',
  },
} as const;
