/**
 * Cadenas compartidas por varias superficies (ES).
 *
 * Los valores deben ser **byte a byte** los que la app mostraba con los textos
 * hardcodeados (fase 1 de `docs/features/0005-i18n.md`).
 */
export const common = {
  cancel: 'Cancelar',
  close: 'Cerrar',
  undo: 'Deshacer',
  redo: 'Rehacer',
  top: 'Superior',
  left: 'Izquierdo',
  bottom: 'Inferior',
  right: 'Derecho',
  leaveWithoutSaving: 'Salir sin guardar',
  closeWithoutSaving: 'Cerrar sin guardar',
  reloadInterface: 'Recargar la interfaz',
  language: 'Idioma',
  file: 'Fichero',
} as const;
