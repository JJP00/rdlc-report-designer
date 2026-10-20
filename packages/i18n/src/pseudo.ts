/**
 * Pseudo-idioma (`qps-ploc`, herramienta de desarrollo): deriva un catálogo del
 * EN sustituyendo cada letra por una variante acentuada y expandiendo el texto
 * ~150 %. Sirve para cazar textos hardcodeados, concatenaciones, truncados y
 * roturas de layout **antes** de traducir nada.
 *
 * Solo se transforman los tramos *literales* del mensaje ICU (los argumentos,
 * plurales y `#` se conservan intactos): el pseudo-catálogo sigue siendo ICU
 * válido y formatea igual que el EN.
 */
import {
  parse,
  TYPE,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from '@formatjs/icu-messageformat-parser';
import type { CatalogShape } from './catalog.js';

const ACCENTS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ď',
  e: 'é',
  f: 'ƒ',
  g: 'ǧ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'ƥ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ď',
  E: 'É',
  F: 'Ƒ',
  G: 'Ǧ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ľ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ó',
  P: 'Ƥ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ú',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/** Sustituye letras por acentos y expande ~50 % (un `·` cada dos letras). */
function pseudoText(text: string): string {
  let out = '';
  let letters = 0;
  for (const char of text) {
    const accented = ACCENTS[char];
    if (accented === undefined) {
      out += char;
      continue;
    }
    out += accented;
    letters += 1;
    if (letters % 2 === 0) out += '·';
  }
  return out;
}

/** Serializa el AST de vuelta a patrón ICU (escapando lo que haga falta). */
function printElements(elements: readonly MessageFormatElement[], inPlural = false): string {
  return elements.map((element) => printElement(element, inPlural)).join('');
}

function printOptions(
  options: PluralElement['options'] | SelectElement['options'],
  inPlural: boolean,
): string {
  return Object.entries(options)
    .map(([key, option]) => `${key} {${printElements(option.value, inPlural)}}`)
    .join(' ');
}

function printElement(element: MessageFormatElement, inPlural: boolean): string {
  switch (element.type) {
    case TYPE.literal:
      return escapeLiteral(pseudoText(element.value), inPlural);
    case TYPE.pound:
      return '#';
    case TYPE.argument:
      return `{${element.value}}`;
    case TYPE.number:
      return `{${element.value}, number}`;
    case TYPE.date:
      return `{${element.value}, date}`;
    case TYPE.time:
      return `{${element.value}, time}`;
    case TYPE.select:
      return `{${element.value}, select, ${printOptions(element.options, inPlural)}}`;
    case TYPE.plural:
      return `{${element.value}, plural, offset:${element.offset} ${printOptions(element.options, true)}}`;
    case TYPE.tag:
      // Los catálogos no usan tags (`ignoreTag` al formatear).
      return `{${element.value}>${printElements(element.children, inPlural)}<${element.value}>}`;
    default:
      return '';
  }
}

/** Re-escapa un literal para que `parse` lo lea igual. */
function escapeLiteral(value: string, inPlural: boolean): string {
  return value
    .replace(/'/g, "''")
    .replace(/\{/g, "'{'")
    .replace(/\}/g, "'}'")
    .replace(/#/g, inPlural ? "'#'" : '#');
}

/** Transforma un patrón ICU: literales acentuados, argumentos intactos. */
export function pseudoMessage(source: string): string {
  if (!source.includes('{') && !source.includes("'")) {
    return `⟦${pseudoText(source)}⟧`;
  }
  try {
    const ast = parse(source, { ignoreTag: true });
    return `⟦${printElements(ast)}⟧`;
  } catch (error) {
    console.error(`[i18n] pseudo: mensaje no parseable: ${source}`, error);
    return `⟦${pseudoText(source.replace(/[{}'#]/g, ''))}⟧`;
  }
}

/** Deriva el catálogo pseudo de un catálogo (estructuralmente idéntico). */
export function pseudoCatalog<T extends CatalogShape<object>>(catalog: T): CatalogShape<T> {
  const visit = (node: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        typeof value === 'string' ? pseudoMessage(value) : visit(value as Record<string, unknown>);
    }
    return out;
  };
  return visit(catalog as unknown as Record<string, unknown>) as CatalogShape<T>;
}
