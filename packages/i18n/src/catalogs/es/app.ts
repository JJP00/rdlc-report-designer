/**
 * Shell de la aplicación: banners, pestañas, pie de estado del documento,
 * mensajes de estado de apertura/guardado/cierre y avisos de workspace (ES).
 *
 * Valores **byte a byte** los del barrido (fase 1); los plurales son reales
 * (ICU) y el par singular/plural de copiar/cortar/pegar son mensajes distintos
 * porque el singular interpola el nombre del elemento y el plural su conteo.
 */
export const app = {
  fatal: {
    title: 'La interfaz ha fallado',
    hint: 'Tus cambios sin guardar siguen en memoria del editor: «Recargar la interfaz» reconecta con ellos.',
  },
  banner: {
    dismiss: 'Cerrar el aviso',
    copyError: 'Copiar el error',
    conflict: 'El fichero cambió por fuera y hay cambios sin guardar: no se ha recargado.',
    fileMissing: 'El fichero ya no existe en disco: guardar lo recreará, o usa «Guardar como…».',
    resolve: 'Resolver…',
    noBackend: 'Modo navegador: sin backend IPC. Arranca la aplicación con {command}.',
  },
  tabs: {
    listLabel: 'Informes abiertos',
    stateDirty: 'con cambios sin guardar',
    stateConflict: 'conflicto: el fichero cambió en disco',
    closeTab: 'Cerrar {name}',
    moveAnnouncement: '«{name}», posición {position} de {count}',
    overflowLabel: 'Todas las pestañas ({count})',
    menuItemLabelActive: '{label}, activa',
    closeSaved: 'Cerrar las que no tienen cambios',
    closeOthers: 'Cerrar otras',
    closeRight: 'Cerrar a la derecha',
    closeAll: 'Cerrar todas',
  },
  status: {
    idle: 'Listo. Abre un informe .rdlc de Business Central o un .rdl 2016.',
    closed: 'Informe cerrado.',
    conflict: 'El fichero cambió en disco. Tus cambios siguen en el editor.',
    reloaded: 'Recargado desde disco',
    reloadUnsupportedSchema: 'El fichero cambió en disco a un RDL anterior a 2016; no se recargó.',
    reloadUnreadable:
      'El fichero cambió en disco, pero no se pudo leer (puede estar a medias). Se mantiene la copia en memoria.',
    opened: 'Abierto: {path}',
    created: 'Nuevo informe: {path}',
    recovered: 'Sesión recuperada: {path}',
    savedPrefix: 'Guardado',
    saved: 'Guardado: {path}',
    savedIdentical: 'Guardado — bytes idénticos al original ✓ ({path})',
    savedAs: 'Guardado como: {path}',
    savedWithWarning: 'Guardado: {path} — {warning}',
    savedIdenticalWithWarning: 'Guardado — bytes idénticos al original ✓ ({path}) — {warning}',
    savedAsWithWarning: 'Guardado como: {path} — {warning}',
    opening: 'Abriendo…',
    creating: 'Creando…',
    saving: 'Guardando…',
    queued: 'Ya hay una operación en curso… se hará a continuación.',
    undone: 'Deshecho',
    redone: 'Rehecho',
    cellLocked: 'La celda fija el contenido: no se puede mover',
    inserted: '«{name}» insertado en {destination}',
    copied: 'Copiado: {name}',
    copiedMany: 'Copiados {count} elementos',
    cut: 'Cortado: {name}',
    cutMany: 'Cortados {count} elementos',
    pasted: 'Pegado: {name}',
    pastedMany: 'Pegados {count} elementos',
    copiedCells: '{count, plural, one {Copiada # celda} other {Copiadas # celdas}}',
    cutCellsCopied:
      '{count, plural, one {Cortar no está disponible para celdas: se ha copiado # celda} other {Cortar no está disponible para celdas: se han copiado # celdas}}',
    pastedCells: '{count, plural, one {Pegada # celda} other {Pegadas # celdas}}',
    pastedCellsPartial: '{done} de {total} celdas pegadas: el resto queda fuera de la tabla',
    pastedFirstItem: 'Pegado 1 de {total} elementos: una celda admite un solo elemento',
    stats: '{count, plural, one {# elemento} other {# elementos}} · {kinds}',
  },
  file: {
    newReportName: 'Nuevo informe.rdlc',
  },
  fileDrop: {
    invalid: 'Solo se pueden abrir ficheros .rdlc o .rdl',
  },
  /** Último recurso de `apiErrorMessage` cuando el motivo no tiene traducción. */
  error: {
    open: 'error al abrir',
    create: 'no se pudo crear el informe',
    save: 'error al guardar',
    reload: 'no se pudo recargar',
    close: 'no se pudo cerrar',
    command: 'comando rechazado',
    undo: 'no se pudo deshacer',
    redo: 'no se pudo rehacer',
    copy: 'no se pudo copiar',
    cut: 'no se pudo cortar',
    paste: 'no se pudo pegar',
    pathAlreadyOpen: 'Esa ruta ya está abierta en otra pestaña: {path}',
  },
} as const;
