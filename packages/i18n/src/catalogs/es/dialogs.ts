/**
 * Diálogos del documento y del workspace (ES).
 *
 * Valores **byte a byte** los del barrido (fase 1); los botones destructivos no
 * se recortan (guía de microcopy §6: texto protegido).
 */
export const dialogs = {
  unsavedChanges: {
    title: 'Cambios sin guardar',
    close: '«{name}» tiene cambios sin guardar y vas a cerrar su pestaña.',
    windowClose: 'Vas a salir de la aplicación y «{name}» tiene cambios sin guardar.',
    saveAndClose: 'Guardar y cerrar',
    saveAndLeave: 'Guardar y salir',
  },
  conflict: {
    title: 'El fichero cambió en disco',
    /** Continúa la frase tras la ruta (el nombre del fichero va aparte, en mono). */
    description:
      'se modificó por fuera (otra app o una sincronización) y tienes cambios sin guardar. Nada se ha perdido todavía: elige qué versión conservar.',
    saveAs: 'Guardar como…',
    overwrite: 'Guardar y sobrescribir el fichero',
    reload: 'Recargar desde disco (descartar mis cambios)',
    later: 'Ahora no',
  },
  saveAll: {
    tabs: 'Vas a cerrar pestañas y hay {count, plural, one {# informe} other {# informes}} con cambios sin guardar. Si alguno no se puede guardar, no se cierra nada y su error queda a la vista.',
    window:
      'Vas a salir de la aplicación y hay {count, plural, one {# informe} other {# informes}} con cambios sin guardar. Si alguno no se puede guardar, no se cierra nada y su error queda a la vista.',
    discardAll: 'Descartar todas',
    saveAll: 'Guardar todas',
  },
} as const;
