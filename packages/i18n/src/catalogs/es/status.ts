/**
 * Pie de estado: conteos del documento y recargas externas (ES).
 *
 * Plural real (ICU) del barrido de microcopy: «1 recarga externa» /
 * «N recargas externas».
 */
export const status = {
  reloads: '{count, plural, one {# recarga externa} other {# recargas externas}}',
} as const;
