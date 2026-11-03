/**
 * Problemas (lint de BC): indicador del pie, panel inferior y mensajes por regla (ES).
 * Una regla sin clave aquí se muestra por su código (`rule`), nunca rompe el panel.
 */
export const lint = {
  title: 'Problemas',
  empty: 'Sin problemas',
  toggle: 'Mostrar problemas',
  hide: 'Ocultar problemas',
  summary:
    '{errors, plural, one {# error} other {# errores}}, {warnings, plural, one {# aviso} other {# avisos}}, {hints, plural, one {# sugerencia} other {# sugerencias}}',
  severity: {
    error: 'Error',
    warning: 'Aviso',
    hint: 'Sugerencia',
  },
  rule: {
    unbalancedBracket: 'Paréntesis «{char}» sin pareja en la posición {index}.',
    unknownField: 'El campo «{field}» no existe en el dataset.',
    reportItemMissing: 'Referencia a un elemento del informe que no existe: «{name}».',
  },
} as const;
