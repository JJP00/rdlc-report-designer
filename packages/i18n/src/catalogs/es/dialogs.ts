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
  update: {
    title: 'Actualización de la aplicación',
    checking: 'Buscando actualizaciones…',
    upToDate: 'Tienes la última versión ({version}).',
    availableTitle: 'La versión {version} está disponible',
    availableDescription:
      'Estás usando la versión {current}. Actualiza para tener los últimos cambios; tus informes abiertos no se tocan.',
    notInstallable:
      'Esta copia no se instaló con el instalador, así que no puede actualizarse sola. Descarga la nueva versión desde la página de versiones.',
    notesHeading: 'Notas de la versión',
    noNotes: 'No hay notas disponibles para esta versión.',
    download: 'Actualizar ahora',
    later: 'Más tarde',
    skip: 'Omitir esta versión',
    openReleasePage: 'Abrir página de descarga',
    downloading: 'Descargando la versión {version}… {percent}%',
    readyTitle: 'La versión {version} está lista para instalar',
    readyDescription:
      'Reinicia para terminar de actualizar. Antes se te preguntará por los cambios sin guardar y Windows puede pedir permiso. Si eliges Más tarde, se instala la próxima vez que cierres la aplicación.',
    restart: 'Reiniciar e instalar',
    errorTitle: 'No se pudo buscar actualizaciones',
    errorDescription: 'Comprueba tu conexión a internet e inténtalo de nuevo.',
    retry: 'Reintentar',
  },
} as const;
