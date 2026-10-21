/**
 * Panel de imagen (ES).
 *
 * Valores **byte a byte** los que la app mostraba con los textos hardcodeados,
 * salvo el recorte del barrido de microcopy (`canvasNote`, guía 0006 §inventario).
 */
export const image = {
  title: 'Imagen',
  noSource: 'sin origen',
  source: {
    label: 'Origen de la imagen',
    database: 'Database (campo del dataset)',
    external: 'External (URL)',
    embedded: 'Embedded (incrustada)',
  },
  sizing: {
    label: 'Tamaño de visualización',
    autoSize: {
      label: 'Tamaño original',
      help: 'El item se ajusta al tamaño de la imagen',
    },
    fit: {
      label: 'Ajustar al tamaño',
      help: 'La imagen se escala para llenar el item',
    },
    fitProportional: {
      label: 'Ajustar proporcional',
      help: 'Escala manteniendo la relación de aspecto',
    },
    clip: {
      label: 'Recortar',
      help: 'La imagen se recorta al tamaño del item',
    },
  },
  canvasNote: 'En el lienzo se dibuja un placeholder; el contenido se resuelve al renderizar.',
  fx: {
    isExpression: 'Es una expresión (=)',
    convert: 'Convertir en expresión (=)',
  },
  embedded: {
    label: 'Imagen incrustada',
    choose: '(elige una imagen)',
    option: '{name} · {mimeType}',
  },
  value: {
    fieldLabel: 'Campo / expresión',
    expressionAria: 'Expresión del valor de la imagen',
    aria: 'Valor de la imagen',
  },
  mime: {
    label: 'Tipo MIME',
    expressionAria: 'Tipo MIME (expresión)',
  },
} as const;
