/**
 * Tipos y utilidades sobre los catálogos de mensajes.
 *
 * El catálogo EN es la **fuente**: sus hojas (`as const`) definen el tipo de
 * claves. Los demás catálogos se asignan a `CatalogShape<EnCatalog>` (hojas
 * `string`), de modo que una clave que falte o sobre falla en `tsc`.
 */
import type { EnCatalog } from './catalogs/en/index.js';

/** Forma ensanchada de un catálogo `as const`: hojas `string`, misma estructura. */
export type CatalogShape<T> = {
  [K in keyof T]: T[K] extends string ? string : CatalogShape<T[K]>;
};

/** Claves punteadas de un catálogo (`'common.cancel'`, `'status.reloads'`…). */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

/** Clave de mensaje válida del catálogo fuente. */
export type CatalogKey = MessageKey<EnCatalog>;

/** Recorre un catálogo y devuelve todas sus claves punteadas. */
export function walkKeys(catalog: CatalogShape<object>): string[] {
  const keys: string[] = [];
  const visit = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') keys.push(path);
      else if (value && typeof value === 'object') visit(value as Record<string, unknown>, path);
    }
  };
  visit(catalog as Record<string, unknown>, '');
  return keys;
}

/** Busca una clave punteada; `undefined` si no existe (o no es una hoja). */
export function lookup(catalog: CatalogShape<object>, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}
