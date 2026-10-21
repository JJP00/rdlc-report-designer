/**
 * Proceso main: diálogos nativos y avisos que el main compone para el front.
 * Los textos son byte a byte los actuales salvo los detalles de los diálogos
 * de ciclo de vida, recortados por la guía de microcopy (§6).
 */
export const native = {
  notResponding: 'La interfaz no responde.',
  renderGone: 'La interfaz se ha cerrado de forma inesperada.',
  unsavedWorkInMemory: 'El trabajo sin guardar sigue en memoria del editor.',
  wait: 'Esperar',
  log: {
    closeDialogFailed: 'No se pudo mostrar el diálogo de cierre',
    renderGoneDialogFailed: 'No se pudo mostrar el diálogo de render caído',
    unresponsiveDialogFailed: 'No se pudo mostrar el diálogo de aplicación bloqueada',
  },
  saveWarnings: {
    watchUnsupported: 'Guardado, pero no se vigilan cambios externos en el fichero nuevo.',
  },
  openDialog: {
    title: 'Abrir informe RDL/RDLC',
    filter: 'Informes RDL/RDLC',
  },
  saveDialog: {
    title: 'Guardar informe RDL/RDLC',
    filter: 'Informes RDL/RDLC',
  },
} as const;
