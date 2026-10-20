/**
 * Lienzo (Konva): etiquetas accesibles, anuncios aria-live y reglas (ES).
 *
 * Los valores son **byte a byte** los que la app mostraba con los textos
 * hardcodeados (fase 1 de `docs/features/0005-i18n.md`): `pageLabel` pasa a
 * plural ICU real sin cambiar lo que se lee (1 elemento / N elementos).
 */
export const canvas = {
  a11y: {
    selection: '{id}, x {x}, y {y}',
    pageLabel: 'Página del informe, {count, plural, one {1 elemento} other {# elementos}}',
    emptyPage: 'La página no tiene elementos',
    keyboardHelp:
      'Usa Tab para recorrer los elementos, las flechas para mover el seleccionado, F2 para editar su texto y Esc para salir del lienzo.',
  },
  ruler: {
    dragHint: '{label} (arrastra en la regla)',
  },
  margins: {
    left: 'Margen izquierdo',
    right: 'Margen derecho',
    top: 'Margen superior',
    bottom: 'Margen inferior',
  },
  image: {
    placeholder: 'Imagen',
  },
  insert: {
    body: 'el cuerpo',
    pageHeader: 'el encabezado de página',
    pageFooter: 'el pie de página',
    tablixCell: 'Celda {row},{col}',
    rectangle: 'el rectángulo {id}',
    tablixHeader: 'la cabecera de {id}',
    tablixCorner: 'la esquina de {id}',
  },
} as const;
