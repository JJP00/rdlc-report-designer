import type { RdlcNode } from '../../document/tree/RdlcNode.js';
import { collectExpressions, datasetFieldNames, expressionRefs } from '../expressions.js';
import type { LintFinding } from '../types.js';

/**
 * Regla `unknownField`: `Fields!X` en una expresión cuando `X` no es campo de
 * ningún DataSet del informe. Comparación sin distinguir mayúsculas (como el
 * motor VB). Un mismo campo se reporta una vez por expresión.
 *
 * Solo lectura: no toca el documento.
 */
export function lintUnknownFields(root: RdlcNode): LintFinding[] {
  const known = datasetFieldNames(root);
  const findings: LintFinding[] = [];

  for (const site of collectExpressions(root)) {
    const reported = new Set<string>();
    for (const ref of expressionRefs(site.source)) {
      if (ref.kind !== 'field') continue;
      const key = ref.name.toLowerCase();
      if (known.has(key) || reported.has(key)) continue;
      reported.add(key);
      findings.push({
        rule: 'unknownField',
        severity: 'error',
        ...(site.itemId !== undefined ? { itemId: site.itemId } : {}),
        location: site.location,
        params: { field: ref.name },
      });
    }
  }

  return findings;
}
