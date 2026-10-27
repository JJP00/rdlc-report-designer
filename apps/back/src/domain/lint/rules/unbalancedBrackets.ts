import type { RdlcNode } from '../../document/tree/RdlcNode.js';
import { collectExpressions } from '../expressions.js';
import type { LintFinding } from '../types.js';

/**
 * Regla `unbalancedBracket`: paréntesis, corchetes y llaves desemparejados
 * en expresiones VB de RDL (`=…`) y en el bloque `<Code>` del informe.
 *
 * Solo lectura y pura: no toca el documento. Un `"` abre un literal de
 * cadena (`""` es una comilla escapada) y un `'` abre un comentario hasta
 * el final de la línea; ninguno de los dos cuenta como par.
 */

export interface UnbalancedBracket {
  kind: 'unclosed' | 'unexpected';
  char: string;
  index: number;
}

/** Cierre → apertura que le corresponde. */
const PAIR = new Map<string, string>([
  [')', '('],
  [']', '['],
  ['}', '{'],
]);
const OPENERS = new Set(['(', '[', '{']);

/**
 * Recorre `source` como VB. Un literal de cadena que no cierra antes del
 * salto de línea (VB no admite cadenas multilínea) se reporta como
 * `unclosed` `"`, y el análisis continúa en la línea siguiente.
 */
function scanVb(source: string): UnbalancedBracket[] {
  const findings: UnbalancedBracket[] = [];
  const stack: { char: string; index: number }[] = [];

  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);

    if (ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < source.length && source.charAt(j) !== '\n' && source.charAt(j) !== '\r') {
        if (source.charAt(j) === '"') {
          if (source.charAt(j + 1) === '"') {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) findings.push({ kind: 'unclosed', char: '"', index: i });
      // Tras la cadena (cerrada o no) seguimos en `j`, sin consumir el salto.
      i = closed ? j + 1 : j;
      continue;
    }

    if (ch === "'") {
      // Comentario VB: se salta hasta el final de la línea.
      const eol = source.slice(i).search(/[\r\n]/);
      if (eol === -1) break;
      i += eol;
      continue;
    }

    if (OPENERS.has(ch)) {
      stack.push({ char: ch, index: i });
    } else if (PAIR.has(ch)) {
      const top = stack.at(-1);
      if (top !== undefined && top.char === PAIR.get(ch)) {
        stack.pop();
      } else {
        // Cierre sin apertura o con orden incorrecto: no desapila nada.
        findings.push({ kind: 'unexpected', char: ch, index: i });
      }
    }

    i++;
  }

  for (const open of stack) {
    findings.push({ kind: 'unclosed', char: open.char, index: open.index });
  }

  return findings.sort((a, b) => a.index - b.index);
}

/**
 * Analiza `source` como una expresión VB y devuelve los desemparejados.
 * No aplica la condición de «es una expresión»: eso es cosa de
 * `lintBracketsInExpression`.
 */
export function findUnbalancedBrackets(source: string): UnbalancedBracket[] {
  return scanVb(source);
}

/**
 * Analiza el bloque `<Code>` completo del informe como VB (varias líneas,
 * comentarios `'` por línea).
 */
export function findUnbalancedBracketsInCode(source: string): UnbalancedBracket[] {
  return scanVb(source);
}

/**
 * Convierte los desemparejados de una expresión en hallazgos de lint.
 * Un valor que no empieza por `=` (tras `trimStart`) es texto plano y no
 * produce ninguno.
 */
export function lintBracketsInExpression(
  source: string,
  ctx: { itemId?: string; location: string },
): LintFinding[] {
  if (!source.trimStart().startsWith('=')) return [];

  return findUnbalancedBrackets(source).map((b) => ({
    rule: 'unbalancedBracket',
    severity: 'error',
    ...(ctx.itemId !== undefined ? { itemId: ctx.itemId } : {}),
    location: ctx.location,
    params: { char: b.char, index: b.index },
  }));
}

/**
 * Pasada completa del informe: cada expresión `=…` (valores de texto, `Hidden`,
 * `Format`, filtros, orden y grupos…) y el bloque `<Code>`. Solo lee.
 */
export function lintUnbalancedBrackets(root: RdlcNode): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const site of collectExpressions(root)) {
    findings.push(
      ...lintBracketsInExpression(site.source, {
        ...(site.itemId !== undefined ? { itemId: site.itemId } : {}),
        location: site.location,
      }),
    );
  }

  const code = root.child('Code')?.text() ?? '';
  for (const bracket of findUnbalancedBracketsInCode(code)) {
    findings.push({
      rule: 'unbalancedBracket',
      severity: 'error',
      location: 'Code',
      params: { char: bracket.char, index: bracket.index },
    });
  }

  return findings;
}
