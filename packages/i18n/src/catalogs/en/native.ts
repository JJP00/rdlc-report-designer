/**
 * Proceso main: diálogos nativos (ciclo de vida de la ventana y diálogos de
 * fichero) y mensajes que el main compone para el front (avisos de guardado).
 *
 * Los detalles de los diálogos de cierre se recortaron a un hecho no obvio
 * (guía de microcopy §6: no repetir lo que ya dicen los botones).
 */
export const native = {
  notResponding: 'The interface is not responding.',
  renderGone: 'The interface closed unexpectedly.',
  unsavedWorkInMemory: "Unsaved work is still in the editor''s memory.",
  wait: 'Wait',
  log: {
    closeDialogFailed: 'Could not show the close dialog',
    renderGoneDialogFailed: 'Could not show the render-gone dialog',
    unresponsiveDialogFailed: 'Could not show the unresponsive dialog',
  },
  saveWarnings: {
    watchUnsupported: 'Saved, but external changes to the new file are not watched.',
  },
  openDialog: {
    title: 'Open RDL/RDLC report',
    filter: 'RDL/RDLC reports',
  },
  saveDialog: {
    title: 'Save RDL/RDLC report',
    filter: 'RDL/RDLC reports',
  },
} as const;
