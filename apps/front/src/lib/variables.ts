import type { ReportMetaDto } from '@rdlc-designer/contracts';

/**
 * Entradas de la lista de variables del informe (panel y paleta Ctrl+K):
 * campos del dataset, parámetros, funciones del bloque `<Code>`, `Globals!` y
 * `User!`. La expresión es lo que se copia/inserta al elegir una entrada.
 */

export interface VariableEntry {
  group: string;
  name: string;
  expression: string;
  detail?: string;
}

export const VARIABLE_GROUPS = {
  fields: 'Campos (Fields!)',
  parameters: 'Parámetros',
  functions: 'Funciones Code.',
  globals: 'Globals!',
  user: 'User!',
} as const;

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

export function variableEntries(meta: ReportMetaDto): VariableEntry[] {
  const fields: VariableEntry[] = meta.fields.map((field) => ({
    group: VARIABLE_GROUPS.fields,
    name: field.name,
    expression: `=Fields!${field.name}.Value`,
    ...(field.dataType ? { detail: field.dataType } : {}),
  }));

  const parameters: VariableEntry[] = meta.parameters.map((parameter) => ({
    group: VARIABLE_GROUPS.parameters,
    name: parameter.name,
    expression: `=Parameters!${parameter.name}.Value`,
    ...(parameter.dataType ? { detail: parameter.dataType } : {}),
  }));

  const functions: VariableEntry[] = meta.code.functions.map((fn) => ({
    group: VARIABLE_GROUPS.functions,
    name: fn.name,
    expression: `=Code.${fn.name}(`,
    ...(fn.parameters?.length ? { detail: fn.parameters.join(', ') } : {}),
  }));

  const globals: VariableEntry[] = GLOBALS.map((name) => ({
    group: VARIABLE_GROUPS.globals,
    name,
    expression: `=Globals!${name}.Value`,
  }));

  const user: VariableEntry[] = USER_FIELDS.map((name) => ({
    group: VARIABLE_GROUPS.user,
    name,
    expression: `=User!${name}`,
  }));

  return [...fields, ...parameters, ...functions, ...globals, ...user];
}
