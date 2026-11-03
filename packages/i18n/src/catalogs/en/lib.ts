/**
 * Utilidades de front con texto visible: shell de `App`, primitivas de UI
 * (`components/ui/*`), utilidades puras con etiquetas (reglas de página,
 * autocompletado de expresiones) y la página de benchmark
 * (barrido i18n: módulo «libs»).
 *
 * No se traducen: nombres de comandos/inserts internos, `Fields!` y funciones
 * VB del catálogo, rutas `RDLC_*`, `data-testid`, clases CSS ni unidades
 * (`cm`, `pt`, `MB`).
 */
export const lib = {
  /** Shell (`App.tsx`): salto al lienzo, arrastre de ficheros y estados de inserción. */
  app: {
    skipToCanvas: 'Skip to canvas',
    dropOverlay: 'Drop the .rdlc or .rdl file to open it',
    insertedInEditor: '{name} inserted in the editor',
    copiedToClipboard: '{name} copied to the clipboard: {expression}',
  },
  /** Página de benchmark del lienzo (`?bench=972`; dev/QA). */
  bench: {
    title: 'Canvas benchmark — {count} textboxes',
    repeat: 'Run again',
    stats:
      'p50 {p50} fps · p95 {p95} fps · min {min} fps · {frames} frames · mount {mount} ms · heap {heap}',
    notAvailable: 'n/a',
    mounting: 'Mounting…',
    measuring: 'Measuring simulated drag (3 s)…',
    hint: 'Open this page in Electron/Chromium to measure the real cost of the canvas.',
  },
  /**
   * Primitivas shadcn: son los *defaults* del componente. La paleta de comandos
   * pasa sus propias cadenas (`palette.dialog.*`) y el resto de diálogos, su
   * título; aquí solo viven los genéricos de la primitiva.
   */
  command: {
    dialogTitle: 'Command Palette',
    dialogDescription: 'Search for a command to run...',
  },
  /** Primitiva de diálogo: cierre y agarradera de redimensionado. */
  dialog: {
    resizeAria: 'Resize dialog',
    resizeTitle: 'Drag to resize (double-click: original size)',
  },
  /** Campo numérico: flechas ↑/↓ (el nombre del campo lo pone el panel). */
  numberInput: {
    increaseAria: '{label}: increase',
    decreaseAria: '{label}: decrease',
    increaseTitle: 'Increase (↑)',
    decreaseTitle: 'Decrease (↓)',
  },
  /** Autocompletado del editor de expresiones (Monaco). */
  expression: {
    builtinDetail: 'RDL function',
  },
  /** Acciones del editor de expresiones (Monaco). */
  monaco: {
    languageAlias: 'RDL expression',
    apply: 'Apply',
    applyEnter: 'Apply (Enter)',
    discard: 'Discard changes (Escape)',
  },
  /** Reglas de página: tramos resaltados (área imprimible y bandas). */
  ruler: {
    printable: 'Printable area',
    header: 'Page header',
    footer: 'Page footer',
  },
} as const;
