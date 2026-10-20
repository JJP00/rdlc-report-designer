import type { ReportMetaDto } from '@rdlc-designer/contracts';
import type { CatalogKey, Translator } from '@rdlc-designer/i18n';

/**
 * Entradas de la lista de variables del informe (panel y paleta Ctrl+K):
 * campos del dataset, parámetros, funciones del bloque `<Code>`, `Globals!` y
 * `User!`. La expresión es lo que se copia/inserta al elegir una entrada.
 *
 * Este fichero no es React: las etiquetas de grupo viven en el namespace
 * `report` del catálogo y aquí solo se expone su clave estable
 * (`VARIABLE_GROUPS`). El consumidor pasa su traductor
 * (`variableEntries(meta, t)`) y recibe `groupLabel` ya resuelta; sin él,
 * `group` es la clave (identidad estable entre idiomas).
 */

export interface VariableEntry {
  /**
   * Clave del grupo en el catálogo (`VARIABLE_GROUPS`, namespace `report`):
   * identidad estable entre idiomas, no una etiqueta para pintar.
   */
  group: string;
  /** Etiqueta del grupo ya traducida (solo si se pasó el traductor). */
  groupLabel?: string;
  name: string;
  expression: string;
  detail?: string;
}

/** Grupos de la lista de variables (en orden de aparición) → clave de catálogo. */
export const VARIABLE_GROUPS = {
  fields: 'report.variables.groupFields',
  parameters: 'report.variables.groupParameters',
  functions: 'report.variables.groupFunctions',
  globals: 'report.variables.groupGlobals',
  user: 'report.variables.groupUser',
} as const satisfies Record<string, CatalogKey>;

export type VariableGroup = (typeof VARIABLE_GROUPS)[keyof typeof VARIABLE_GROUPS];

/** Borrador interno: aquí el grupo sí es una clave tipada del catálogo. */
interface VariableDraft {
  group: VariableGroup;
  name: string;
  expression: string;
  detail?: string;
}

/** Globals y User son listas estáticas del estándar RDL. */
export const GLOBALS = [
  'PageNumber',
  'TotalPages',
  'ExecutionTime',
  'ReportName',
  'PageName',
  'RenderFormat',
];

export const USER_FIELDS = ['UserID', 'Language'];

export function variableEntries(meta: ReportMetaDto, t?: Translator['t']): VariableEntry[] {
  const fields: VariableDraft[] = meta.fields.map((field) => ({
    group: VARIABLE_GROUPS.fields,
    name: field.name,
    expression: `=Fields!${field.name}.Value`,
    ...(field.dataType ? { detail: field.dataType } : {}),
  }));

  const parameters: VariableDraft[] = meta.parameters.map((parameter) => ({
    group: VARIABLE_GROUPS.parameters,
    name: parameter.name,
    expression: `=Parameters!${parameter.name}.Value`,
    ...(parameter.dataType ? { detail: parameter.dataType } : {}),
  }));

  const functions: VariableDraft[] = meta.code.functions.map((fn) => ({
    group: VARIABLE_GROUPS.functions,
    name: fn.name,
    expression: `=Code.${fn.name}(`,
    ...(fn.parameters?.length ? { detail: fn.parameters.join(', ') } : {}),
  }));

  const globals: VariableDraft[] = GLOBALS.map((name) => ({
    group: VARIABLE_GROUPS.globals,
    name,
    expression: `=Globals!${name}.Value`,
  }));

  const user: VariableDraft[] = USER_FIELDS.map((name) => ({
    group: VARIABLE_GROUPS.user,
    name,
    expression: `=User!${name}`,
  }));

  const drafts: VariableDraft[] = [...fields, ...parameters, ...functions, ...globals, ...user];
  // Con traductor, cada entrada lleva además la etiqueta del grupo resuelta: el
  // panel y la paleta pintan `groupLabel` sin volver a traducir por entrada.
  return t ? drafts.map((draft) => ({ ...draft, groupLabel: t(draft.group) })) : drafts;
}
