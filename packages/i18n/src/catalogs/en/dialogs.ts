/**
 * Diálogos del documento y del workspace: cambios sin guardar, conflicto,
 * guardar todos, cerrar pestañas y diálogos de fichero
 * (barrido i18n: módulo «shell»).
 *
 * Los botones destructivos conservan todo su contexto (guía de microcopy §6:
 * texto protegido): nombran exactamente qué se pierde.
 */
export const dialogs = {
  unsavedChanges: {
    title: 'Unsaved changes',
    close: '“{name}” has unsaved changes and you are about to close its tab.',
    windowClose: 'You are about to exit the app and “{name}” has unsaved changes.',
    saveAndClose: 'Save and close',
    saveAndLeave: 'Save and exit',
  },
  conflict: {
    title: 'The file changed on disk',
    /** Continúa la frase tras la ruta (el nombre del fichero va aparte, en mono). */
    description:
      'was modified outside the app (another app or a sync) and you have unsaved changes. Nothing is lost yet: choose which version to keep.',
    saveAs: 'Save as…',
    overwrite: 'Save and overwrite the file',
    reload: 'Reload from disk (discard my changes)',
    later: 'Not now',
  },
  saveAll: {
    tabs: 'You are about to close tabs and {count, plural, one {there is # report} other {there are # reports}} with unsaved changes. If any report cannot be saved, nothing is closed and its error stays visible.',
    window:
      'You are about to exit the app and {count, plural, one {there is # report} other {there are # reports}} with unsaved changes. If any report cannot be saved, nothing is closed and its error stays visible.',
    discardAll: 'Discard all',
    saveAll: 'Save all',
  },
} as const;
