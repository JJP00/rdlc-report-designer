/**
 * Paridad EN ↔ ES e integridad ICU de los catálogos.
 *
 * Estas comprobaciones son la red de seguridad del barrido por módulos:
 * - toda clave del catálogo fuente existe en ES (además del `satisfies` de
 *   `es/index.ts`) y no hay claves sobrantes ni valores vacíos;
 * - **toda interpolación se sustituye de verdad**: un `'{id}'` sin escapar
 *   (comilla simple en ICU) renderizaría `{id}` literal y aquí falla;
 * - las comillas simples de los literales se escriben `''` (paridad de
 *   apóstrofos), la convención del paquete.
 */
import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { lookup, walkKeys, type CatalogShape } from './catalog.js';
import { en } from './catalogs/en/index.js';
import { es } from './catalogs/es/index.js';
import { createTranslator, type MessageParams } from './translate.js';
import type { Locale } from './locale.js';

interface ArgumentSpec {
  name: string;
  kind: 'string' | 'number' | 'select' | 'plural';
}

function collectArguments(
  elements: readonly MessageFormatElement[],
  into: Map<string, ArgumentSpec>,
): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        into.set(element.value, { name: element.value, kind: 'string' });
        break;
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        into.set(element.value, { name: element.value, kind: 'number' });
        break;
      case TYPE.select:
        into.set(element.value, { name: element.value, kind: 'select' });
        for (const option of Object.values(element.options)) collectArguments(option.value, into);
        break;
      case TYPE.plural:
        into.set(element.value, { name: element.value, kind: 'plural' });
        for (const option of Object.values(element.options)) collectArguments(option.value, into);
        break;
      case TYPE.tag:
        collectArguments(element.children, into);
        break;
      default:
        break;
    }
  }
}

/** Valor de prueba distintivo por argumento (para verificar sustitución). */
function dummyParams(specs: Map<string, ArgumentSpec>): MessageParams {
  const params: MessageParams = {};
  for (const spec of specs.values()) {
    params[spec.name] =
      spec.kind === 'string' ? `«${spec.name}»` : spec.kind === 'number' ? 2 : 'other';
  }
  return params;
}

function auditCatalog(locale: Locale, catalog: CatalogShape<typeof en>): void {
  const translator = createTranslator(locale);

  it(`${locale}: toda clave formatea (ICU válido, sin placeholders sin sustituir)`, () => {
    const failures: string[] = [];

    for (const key of walkKeys(catalog)) {
      const message = lookup(catalog, key);
      if (message === undefined) continue;

      if (message.trim() === '') {
        failures.push(`${key}: valor vacío`);
        continue;
      }
      if ((message.match(/'/g) ?? []).length % 2 !== 0) {
        failures.push(`${key}: apóstrofos impares; escríbelos como '' (convención ICU)`);
        continue;
      }
      if (!message.includes('{') && !message.includes("'")) continue;

      let ast: MessageFormatElement[];
      try {
        ast = parse(message, { ignoreTag: true });
      } catch (error) {
        failures.push(`${key}: ICU no parseable (${(error as Error).message})`);
        continue;
      }

      const specs = new Map<string, ArgumentSpec>();
      collectArguments(ast, specs);
      const params = dummyParams(specs);
      const rendered = translator.tUnsafe(key, params);

      if (rendered === undefined) {
        failures.push(`${key}: sin traducción`);
        continue;
      }
      if (rendered.includes('{') || rendered.includes('}')) {
        failures.push(`${key}: quedan llaves sin sustituir → "${rendered}"`);
        continue;
      }
      for (const spec of specs.values()) {
        if (spec.kind === 'string' && !rendered.includes(params[spec.name] as string)) {
          failures.push(
            `${key}: el argumento {${spec.name}} no se sustituyó (¿comillas simples sin escapar?) → "${rendered}"`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
}

describe('paridad de catálogos', () => {
  it('ES tiene exactamente las claves de EN', () => {
    expect(walkKeys(es).sort()).toEqual(walkKeys(en).sort());
  });

  it('no hay valores vacíos ni solo-espacios', () => {
    const empty = [
      ...walkKeys(en).map((key) => ({ key, value: lookup(en, key) })),
      ...walkKeys(es).map((key) => ({ key, value: lookup(es, key) })),
    ]
      .filter(({ value }) => typeof value !== 'string' || value.trim() === '')
      .map(({ key }) => key);
    expect(empty).toEqual([]);
  });

  auditCatalog('en', en);
  auditCatalog('es', es);
});
