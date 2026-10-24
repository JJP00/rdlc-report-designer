/**
 * Shell de la aplicación: banners, pestañas, pie de estado del documento,
 * mensajes de estado de apertura/guardado/cierre y avisos de workspace
 * (barrido i18n: módulo «shell»).
 *
 * `status.copied`/`status.copiedMany` (y las parejas de cortar/pegar) son dos
 * mensajes: el singular interpola el **nombre** del elemento y el plural el
 * **conteo**, así que un único plural CLDR no puede cubrir ambos sin imprimir
 * un parámetro que no toca (el auditor de paridad exige que todo parámetro de
 * texto aparezca en la rama `other`).
 */
export const app = {
  fatal: {
    title: 'The interface crashed',
    hint: 'Your unsaved changes are still in the editor memory: “Reload interface” reconnects to them.',
  },
  banner: {
    dismiss: 'Dismiss alert',
    copyError: 'Copy error',
    conflict:
      'The file changed outside the app and there are unsaved changes: it has not been reloaded.',
    fileMissing: 'The file no longer exists on disk: saving will recreate it, or use “Save As…”.',
    resolve: 'Resolve…',
    noBackend: 'Browser mode: no IPC backend. Start the app with {command}.',
  },
  tabs: {
    listLabel: 'Open reports',
    stateDirty: 'unsaved changes',
    stateConflict: 'conflict: the file changed on disk',
    closeTab: 'Close {name}',
    moveAnnouncement: '{name}, position {position} of {count}',
    overflowLabel: 'All tabs ({count})',
    menuItemLabelActive: '{label}, active',
    closeSaved: 'Close tabs without changes',
    closeOthers: 'Close other tabs',
    closeRight: 'Close tabs to the right',
    closeAll: 'Close all tabs',
  },
  status: {
    idle: 'Ready. Open a .rdlc report from Business Central or a 2016 .rdl.',
    closed: 'Report closed.',
    conflict: 'The file changed on disk. Your changes are still in the editor.',
    reloaded: 'Reloaded from disk',
    reloadUnsupportedSchema:
      'The file changed on disk to an RDL older than 2016; it was not reloaded.',
    reloadUnreadable:
      'The file changed on disk but could not be read (it may be half-written). The in-memory copy is kept.',
    opened: 'Opened: {path}',
    created: 'New report: {path}',
    recovered: 'Recovered session: {path}',
    savedPrefix: 'Saved',
    saved: 'Saved: {path}',
    savedIdentical: 'Saved — bytes identical to the original ✓ ({path})',
    savedAs: 'Saved as: {path}',
    savedWithWarning: 'Saved: {path} — {warning}',
    savedIdenticalWithWarning: 'Saved — bytes identical to the original ✓ ({path}) — {warning}',
    savedAsWithWarning: 'Saved as: {path} — {warning}',
    opening: 'Opening…',
    creating: 'Creating…',
    saving: 'Saving…',
    queued: 'Another operation is in progress… it will run next.',
    undone: 'Undone',
    redone: 'Redone',
    cellLocked: 'The cell locks the content: it cannot be moved',
    inserted: '{name} inserted in {destination}',
    copied: 'Copied: {name}',
    copiedMany: 'Copied {count} items',
    cut: 'Cut: {name}',
    cutMany: 'Cut {count} items',
    pasted: 'Pasted: {name}',
    pastedMany: 'Pasted {count} items',
    copiedCells: '{count, plural, one {Copied # cell} other {Copied # cells}}',
    cutCellsCopied:
      '{count, plural, one {Cut is not available for cells: # cell copied instead} other {Cut is not available for cells: # cells copied instead}}',
    pastedCells: '{count, plural, one {Pasted # cell} other {Pasted # cells}}',
    pastedCellsPartial: '{done} of {total} cells pasted: the rest falls outside the table',
    pastedFirstItem: 'Pasted 1 of {total} items: a cell holds a single item',
    stats: '{count, plural, one {# item} other {# items}} · {kinds}',
  },
  file: {
    newReportName: 'New report.rdlc',
  },
  fileDrop: {
    invalid: 'Only .rdlc or .rdl files can be opened',
  },
  /** Último recurso de `apiErrorMessage` cuando el motivo no tiene traducción. */
  error: {
    open: 'could not open',
    create: 'could not create the report',
    save: 'could not save',
    reload: 'could not reload',
    close: 'could not close',
    command: 'command rejected',
    undo: 'could not undo',
    redo: 'could not redo',
    copy: 'could not copy',
    cut: 'could not cut',
    paste: 'could not paste',
    pathAlreadyOpen: 'That path is already open in another tab: {path}',
  },
} as const;
