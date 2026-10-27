/**
 * Utilidades de front con texto visible (ES).
 *
 * Los valores deben ser **byte a byte** los que la app mostraba con los textos
 * hardcodeados (fase 1 de `docs/features/0005-i18n.md`).
 */
export const lib = {
  app: {
    skipToCanvas: 'Saltar al lienzo',
    dropOverlay: 'Suelta el fichero .rdlc o .rdl para abrirlo',
    insertedInEditor: '{name} insertada en el editor',
    copiedToClipboard: '{name} copiada al portapapeles: {expression}',
  },
  bench: {
    title: 'Benchmark de lienzo — {count} textboxes',
    repeat: 'Repetir',
    stats:
      'p50 {p50} fps · p95 {p95} fps · min {min} fps · {frames} frames · montaje {mount} ms · heap {heap}',
    notAvailable: 'n/d',
    mounting: 'Montando…',
    measuring: 'Midiendo drag simulado (3 s)…',
    hint: 'Abre esta página en Electron/Chromium para medir el coste real del lienzo.',
  },
  command: {
    // Defaults en inglés de la primitiva shadcn; la paleta pasa las suyas.
    dialogTitle: 'Command Palette',
    dialogDescription: 'Search for a command to run...',
  },
  dialog: {
    resizeAria: 'Redimensionar el diálogo',
    resizeTitle: 'Arrastra para redimensionar (doble clic: tamaño original)',
  },
  numberInput: {
    increaseAria: '{label}: aumentar',
    decreaseAria: '{label}: reducir',
    increaseTitle: 'Aumentar (↑)',
    decreaseTitle: 'Reducir (↓)',
  },
  expression: {
    builtinDetail: 'función RDL',
  },
  monaco: {
    languageAlias: 'Expresión RDL',
    apply: 'Aplicar',
    applyEnter: 'Aplicar (Enter)',
    discard: 'Descartar cambios (Escape)',
  },
  ruler: {
    printable: 'Área imprimible',
    header: 'Encabezado',
    footer: 'Pie',
  },
} as const;
