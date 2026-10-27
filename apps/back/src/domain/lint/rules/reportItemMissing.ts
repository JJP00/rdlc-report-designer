import { DocumentIndex } from '../../document/index/DocumentIndex.js';
import type { RdlcNode } from '../../document/tree/RdlcNode.js';
import { collectExpressions, expressionRefs } from '../expressions.js';
import type { LintFinding } from '../types.js';

/**
 * Regla `reportItemMissing`: `ReportItems!X` en una expresión cuando no existe
 * ningún item de informe llamado `X`. Comparación sin distinguir mayúsculas
 * (igual que el índice del documento y el motor VB).
 *
 * Solo lectura: no toca el documento.
 */
export function lintReportItemMissing(root: RdlcNode): LintFinding[] {
  const index = DocumentIndex.build(root);
  const findings: LintFinding[] = [];

  for (const site of collectExpressions(root)) {
    const reported = new Set<string>();
    for (const ref of expressionRefs(site.source)) {
      if (ref.kind !== 'reportItem') continue;
      const key = ref.name.toLowerCase();
      if (index.has(ref.name) || reported.has(key)) continue;
      reported.add(key);
      findings.push({
        rule: 'reportItemMissing',
        severity: 'error',
        ...(site.itemId !== undefined ? { itemId: site.itemId } : {}),
        location: site.location,
        params: { name: ref.name },
      });
    }
  }

  return findings;
}
