import type { LintFindingDto } from '@rdlc-designer/contracts';
import type { MessageParams } from '@rdlc-designer/i18n';

/**
 * Problemas (lint de BC): helpers puros del panel. Los hallazgos avisan, nunca
 * bloquean el guardado; la UI solo los ordena, cuenta y traduce.
 */

export type LintSeverity = LintFindingDto['severity'];

/** Orden de severidad: primero los errores, luego los avisos y las sugerencias. */
const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, warning: 1, hint: 2 };

/** Clave de la etiqueta de cada severidad (claves literales para el `t` tipado). */
export const LINT_SEVERITY_KEYS = {
  error: 'lint.severity.error',
  warning: 'lint.severity.warning',
  hint: 'lint.severity.hint',
} as const satisfies Record<LintSeverity, string>;

/** Ordena por severidad sin alterar el orden relativo dentro de cada una. */
export function sortLintFindings(findings: readonly LintFindingDto[]): LintFindingDto[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.index - b.index,
    )
    .map(({ finding }) => finding);
}

export interface LintCounts {
  error: number;
  warning: number;
  hint: number;
}

export function countLintSeverities(findings: readonly LintFindingDto[]): LintCounts {
  const counts: LintCounts = { error: 0, warning: 0, hint: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/**
 * Texto de un hallazgo: `lint.rule.<rule>` con sus parámetros. Una regla sin
 * clave (o un fallo al formatear) devuelve el código de la regla, sin lanzar.
 */
export function lintMessage(
  finding: LintFindingDto,
  translate: (key: string, params?: MessageParams) => string | undefined,
): string {
  try {
    return translate(`lint.rule.${finding.rule}`, finding.params) ?? finding.rule;
  } catch {
    return finding.rule;
  }
}
