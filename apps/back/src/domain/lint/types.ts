/** Gravedad de un hallazgo del lint de BC: avisa, nunca bloquea el guardado. */
export type LintSeverity = 'error' | 'warning' | 'hint';

/**
 * Un hallazgo de solo lectura. El texto visible no vive aquí: `rule` es el
 * código estable (`unbalancedBracket`, …) que la UI traduce con `params`.
 */
export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  /** `Name` del item afectado; ausente en hallazgos del `<Code>` o del informe. */
  itemId?: string;
  /** Dónde está dentro del item o del `<Code>` (p. ej. `Value`, `Code`). */
  location?: string;
  params?: Record<string, string | number>;
}
