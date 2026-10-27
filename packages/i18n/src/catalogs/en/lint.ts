/**
 * Problemas (lint de BC): indicador del pie, panel inferior y mensajes por regla.
 * Una regla sin clave aquí se muestra por su código (`rule`), nunca rompe el panel.
 */
export const lint = {
  title: 'Problems',
  empty: 'No problems',
  toggle: 'Show problems',
  hide: 'Hide problems',
  summary:
    '{errors, plural, one {# error} other {# errors}}, {warnings, plural, one {# warning} other {# warnings}}, {hints, plural, one {# hint} other {# hints}}',
  severity: {
    error: 'Error',
    warning: 'Warning',
    hint: 'Hint',
  },
  rule: {
    unbalancedBracket: 'Unbalanced bracket “{char}” at position {index}.',
    unknownField: 'Field “{field}” does not exist in the dataset.',
    reportItemMissing: 'Reference to a report item that does not exist: “{name}”.',
  },
} as const;
