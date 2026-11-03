import type { RdlcNode } from '../document/tree/RdlcNode.js';
import { allElements, REPORT_ITEM_TAGS } from './expressions.js';
import { lintReportItemMissing } from './rules/reportItemMissing.js';
import { lintUnbalancedBrackets } from './rules/unbalancedBrackets.js';
import { lintUnknownFields } from './rules/unknownField.js';
import type { LintFinding, LintSeverity } from './types.js';

/**
 * Reglas que componen el lint, en el orden en que se ejecutan. Solo miran las
 * **expresiones** (qué dicen), no cómo está diseñado el informe.
 */
const RULES: readonly ((root: RdlcNode) => LintFinding[])[] = [
  lintUnbalancedBrackets,
  lintUnknownFields,
  lintReportItemMissing,
];

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, warning: 1, hint: 2 };

/**
 * Lint de BC: reglas de solo lectura sobre las expresiones del documento (nunca lo mutan ni
 * bloquean el guardado). Devuelve los hallazgos ordenados por gravedad
 * (`error` → `warning` → `hint`) y, dentro de cada una, en orden de documento.
 *
 * `root` es la raíz `<Report>`. Aquí se componen las reglas de `rules/`.
 */
export function lintDocument(root: RdlcNode): LintFinding[] {
  const position = documentPositions(root);
  const findings = RULES.flatMap((rule) => rule(root));

  return findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      positionOf(a, position) - positionOf(b, position),
  );
}

/**
 * Orden de documento de cada item (por su `Name`) y del bloque `Code`. Los
 * hallazgos sin item ni `Code` (raros) van al final.
 */
function documentPositions(root: RdlcNode): Map<string, number> {
  const position = new Map<string, number>();
  allElements(root).forEach((node, index) => {
    if (node.tagName === 'Code' && !position.has('Code')) position.set('Code', index);
    if (!REPORT_ITEM_TAGS.has(node.tagName)) return;
    const name = node.attribute('Name');
    if (name && !position.has(name)) position.set(name, index);
  });
  return position;
}

function positionOf(finding: LintFinding, position: Map<string, number>): number {
  const key = finding.itemId ?? finding.location;
  return (key !== undefined ? position.get(key) : undefined) ?? Number.MAX_SAFE_INTEGER;
}
