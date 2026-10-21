/**
 * Lienzo (Konva): etiquetas accesibles, anuncios aria-live, reglas y marco de
 * selección (barrido i18n: módulo «canvas»).
 *
 * Voz: directa (Microsoft/VS Code); los anuncios son la voz de la app para
 * lectores de pantalla y van con ICU real (plurales incluidos). Las unidades
 * (`cm`, `mm`, `pt`) y las medidas formateadas por utilidades no se traducen.
 */
export const canvas = {
  a11y: {
    selection: '{id}, x {x}, y {y}',
    pageLabel: 'Report page, {count, plural, one {1 element} other {# elements}}',
    emptyPage: 'The page has no elements',
    keyboardHelp:
      'Use Tab to move through the elements, the arrow keys to move the selection, F2 to edit its text, and Esc to leave the canvas.',
  },
  ruler: {
    dragHint: '{label} (drag on the ruler)',
  },
  margins: {
    left: 'Left margin',
    right: 'Right margin',
    top: 'Top margin',
    bottom: 'Bottom margin',
  },
  image: {
    placeholder: 'Image',
  },
  insert: {
    body: 'the body',
    pageHeader: 'the page header',
    pageFooter: 'the page footer',
    tablixCell: 'Cell {row},{col}',
    rectangle: 'the rectangle {id}',
    tablixHeader: 'the header of {id}',
    tablixCorner: 'the corner of {id}',
  },
} as const;
