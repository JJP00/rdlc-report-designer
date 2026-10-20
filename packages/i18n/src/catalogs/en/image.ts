/**
 * Panel de imagen (barrido i18n: módulo «panels-image-report»).
 *
 * Los valores del XSD (`Database`/`External`/`Embedded`), los MIME y las
 * expresiones (`=Fields!Picture.Value`) no se traducen: las etiquetas de origen
 * combinan el valor con su pista.
 */
export const image = {
  title: 'Image',
  noSource: 'No source',
  source: {
    label: 'Image source',
    database: 'Database (dataset field)',
    external: 'External (URL)',
    embedded: 'Embedded (in report)',
  },
  sizing: {
    label: 'Display size',
    autoSize: {
      label: 'Original size',
      help: 'The item grows to fit the image',
    },
    fit: {
      label: 'Fit',
      help: 'The image stretches to fill the item',
    },
    fitProportional: {
      label: 'Fit proportional',
      help: 'Scales while preserving the aspect ratio',
    },
    clip: {
      label: 'Clip',
      help: 'The image is cropped to the item size',
    },
  },
  canvasNote: 'The canvas draws a placeholder; the content resolves at render time.',
  fx: {
    isExpression: 'Expression (=)',
    convert: 'Convert to expression (=)',
  },
  embedded: {
    label: 'Embedded image',
    choose: '(choose an image)',
    option: '{name} · {mimeType}',
  },
  value: {
    fieldLabel: 'Field / expression',
    expressionAria: 'Image value expression',
    aria: 'Image value',
  },
  mime: {
    label: 'MIME type',
    expressionAria: 'MIME type (expression)',
  },
} as const;
