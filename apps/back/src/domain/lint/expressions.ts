import type { RdlcNode } from '../document/tree/RdlcNode.js';

/**
 * Utilidades de solo lectura compartidas por las reglas del lint: recorrido
 * del árbol, expresiones `=…` con su contexto y referencias `Fields!` /
 * `ReportItems!` extraídas con un tokenizador VB mínimo.
 *
 * Nada aquí muta el documento y todo tolera partes ausentes del informe.
 */

/** Elementos que son items de informe (mismo criterio que `DocumentIndex`). */
export const REPORT_ITEM_TAGS: ReadonlySet<string> = new Set([
  'Line',
  'Rectangle',
  'Textbox',
  'Image',
  'Subreport',
  'Chart',
  'GaugePanel',
  'Map',
  'Tablix',
  'CustomReportItem',
]);

/** Elemento y todos sus descendientes, en orden de documento. */
export function allElements(root: RdlcNode): RdlcNode[] {
  const out: RdlcNode[] = [];
  const visit = (node: RdlcNode): void => {
    out.push(node);
    for (const child of node.children()) visit(child);
  };
  visit(root);
  return out;
}

/** Name del item de informe más cercano que contiene el nodo (o `undefined`). */
export function nearestItemName(node: RdlcNode): string | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (!REPORT_ITEM_TAGS.has(current.tagName)) continue;
    const name = current.attribute('Name');
    if (name) return name;
  }
  return undefined;
}

/** Elemento cuyo texto es una expresión (`=…`), con su contexto. */
export interface ExpressionSite {
  node: RdlcNode;
  /** Tag del elemento que contiene la expresión (`Value`, `Hidden`, `Format`…). */
  location: string;
  /** `Name` del item de informe más cercano; ausente en el informe. */
  itemId?: string;
  /** Texto completo de la expresión, tal como lo devuelve `text()`. */
  source: string;
}

/**
 * Todas las expresiones del informe. El bloque `<Code>` es VB y no cuenta
 * como expresión (se analiza aparte).
 */
export function collectExpressions(root: RdlcNode): ExpressionSite[] {
  const sites: ExpressionSite[] = [];
  for (const node of allElements(root)) {
    if (node.tagName === 'Code') continue;
    const source = node.text();
    if (source === undefined || !source.trimStart().startsWith('=')) continue;
    const itemId = nearestItemName(node);
    sites.push({
      node,
      location: node.tagName,
      ...(itemId !== undefined ? { itemId } : {}),
      source,
    });
  }
  return sites;
}

/** Referencia `Fields!X` o `ReportItems!X` dentro de una expresión. */
export interface ExpressionRef {
  kind: 'field' | 'reportItem';
  name: string;
  /** Funciones que la envuelven, de fuera a dentro (en minúsculas). */
  enclosing: string[];
}

/**
 * Extrae las referencias de una expresión. Ignora lo que va dentro de
 * cadenas `"…"` (con `""` escapada) y reconoce `Fields!"Nombre con espacios"`.
 */
export function expressionRefs(source: string): ExpressionRef[] {
  const refs: ExpressionRef[] = [];
  const stack: string[] = [];
  let lastIdent = '';
  let i = 0;

  while (i < source.length) {
    const ch = source.charAt(i);

    if (ch === '"') {
      i++;
      while (i < source.length) {
        if (source.charAt(i) === '"') {
          if (source.charAt(i + 1) === '"') {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      lastIdent = '';
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let end = i;
      while (end < source.length && /\w/.test(source.charAt(end))) end++;
      const ident = source.slice(i, end);

      if (source.charAt(end) === '!' && (ident === 'Fields' || ident === 'ReportItems')) {
        let name = '';
        let next = end + 1;
        if (source.charAt(next) === '"') {
          const close = source.indexOf('"', next + 1);
          if (close !== -1) {
            name = source.slice(next + 1, close);
            next = close + 1;
          }
        } else {
          let stop = next;
          while (stop < source.length && /\w/.test(source.charAt(stop))) stop++;
          name = source.slice(next, stop);
          next = stop;
        }
        if (name) {
          refs.push({
            kind: ident === 'Fields' ? 'field' : 'reportItem',
            name,
            enclosing: stack.filter((f) => f !== ''),
          });
        }
        i = next;
        lastIdent = '';
        continue;
      }

      lastIdent = ident;
      i = end;
      continue;
    }

    if (ch === '(') {
      stack.push(lastIdent.toLowerCase());
      lastIdent = '';
    } else if (ch === ')') {
      stack.pop();
      lastIdent = '';
    } else if (!/\s/.test(ch)) {
      lastIdent = '';
    }
    i++;
  }

  return refs;
}

/** Nombres (en minúsculas) de los campos de todos los DataSet del informe. */
export function datasetFieldNames(root: RdlcNode): Set<string> {
  const names = new Set<string>();
  for (const dataSet of root.child('DataSets')?.children('DataSet') ?? []) {
    for (const field of dataSet.child('Fields')?.children('Field') ?? []) {
      const name = field.attribute('Name');
      if (name) names.add(name.toLowerCase());
    }
  }
  return names;
}
