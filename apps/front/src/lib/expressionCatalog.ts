import type { ReportMetaDto } from '@rdlc-designer/contracts';
import { VARIABLE_GROUPS, variableEntries } from './variables';

/**
 * Catálogo del lenguaje de expresiones RDL (VB-like) para el editor Monaco:
 * lista de funciones del estándar y traducción de las variables del informe a
 * entradas de autocompletado.
 *
 * El tokenizador (Monarch) vive en `monacoSetup.ts`; aquí está la parte pura
 * (qué se ofrece y con qué texto), que es la testeable.
 */

/** Funciones del estándar RDL/VB que se ofrecen en el autocompletado. */
export const RDL_BUILTINS = [
  // Lógicas y de flujo
  'IIf',
  'Choose',
  'Switch',
  'InScope',
  'IsNothing',
  'IsNumeric',
  'IsDate',
  // Agregados
  'Sum',
  'Avg',
  'Min',
  'Max',
  'Count',
  'CountDistinct',
  'CountRows',
  'First',
  'Last',
  'Previous',
  'RunningValue',
  'RowNumber',
  'StDev',
  'Var',
  // Búsquedas
  'Lookup',
  'LookupSet',
  'MultiLookup',
  'Join',
  // Formato
  'Format',
  'FormatCurrency',
  'FormatDateTime',
  'FormatNumber',
  'FormatPercent',
  // Texto
  'Len',
  'Left',
  'Right',
  'Mid',
  'Replace',
  'Trim',
  'LTrim',
  'RTrim',
  'LCase',
  'UCase',
  'InStr',
  'Split',
  'StrDup',
  'StrReverse',
  'Asc',
  'Chr',
  'Space',
  'Str',
  'Val',
  'CStr',
  // Conversión y fechas
  'CInt',
  'CDbl',
  'CDec',
  'CLng',
  'CBool',
  'CDate',
  'DateAdd',
  'DateDiff',
  'DatePart',
  'DateSerial',
  'DateValue',
  'Day',
  'Month',
  'Year',
  'Hour',
  'Minute',
  'Second',
  'Now',
  'Today',
  'TimeOfDay',
  // Matemáticas
  'Abs',
  'Ceiling',
  'Floor',
  'Round',
  'Int',
  'Fix',
  'Exp',
  'Log',
  'Sqrt',
  'Sgn',
  'Rnd',
  // Colecciones
  'Array',
  'IsArray',
  'UBound',
  'LBound',
  'Filter',
  'Nothing',
];

/** Palabras clave de VB.NET (bloque `<Code>`), para el resaltado. */
export const VB_KEYWORDS = [
  'AddHandler',
  'And',
  'As',
  'Boolean',
  'ByRef',
  'ByVal',
  'Case',
  'Catch',
  'Class',
  'Const',
  'Date',
  'Decimal',
  'Delegate',
  'Dim',
  'Do',
  'Double',
  'Each',
  'Else',
  'ElseIf',
  'End',
  'Enum',
  'Event',
  'Exit',
  'False',
  'Finally',
  'For',
  'Friend',
  'Function',
  'Get',
  'Handles',
  'If',
  'Implements',
  'In',
  'Inherits',
  'Integer',
  'Is',
  'Long',
  'Loop',
  'Me',
  'Mod',
  'Module',
  'New',
  'Next',
  'Not',
  'Nothing',
  'Object',
  'Or',
  'Overloads',
  'Overrides',
  'Private',
  'Property',
  'Protected',
  'Public',
  'RaiseEvent',
  'ReadOnly',
  'ReDim',
  'Return',
  'Select',
  'Set',
  'Shared',
  'Single',
  'Static',
  'Step',
  'String',
  'Structure',
  'Sub',
  'Then',
  'Throw',
  'To',
  'True',
  'Try',
  'TypeOf',
  'Until',
  'Variant',
  'Wend',
  'While',
  'With',
  'Xor',
];

export type CompletionKind =
  | 'field'
  | 'parameter'
  | 'function'
  | 'global'
  | 'user'
  | 'code'
  | 'builtin';

export interface CompletionEntry {
  /** Texto que se muestra en la lista. */
  label: string
  /** Texto que se inserta (sin el `=` inicial: es un fragmento de expresión). */
  insertText: string;
  kind: CompletionKind;
  detail?: string;
}

const GROUP_KINDS: Record<string, CompletionKind> = {
  [VARIABLE_GROUPS.fields]: 'field',
  [VARIABLE_GROUPS.parameters]: 'parameter',
  [VARIABLE_GROUPS.functions]: 'code',
  [VARIABLE_GROUPS.globals]: 'global',
  [VARIABLE_GROUPS.user]: 'user',
};

/**
 * Entradas del autocompletado: variables del informe (sin el `=` inicial, que
 * solo tiene sentido al empezar la expresión) + funciones del estándar.
 */
export function expressionCompletions(meta: ReportMetaDto): CompletionEntry[] {
  const variables: CompletionEntry[] = variableEntries(meta).map((entry) => ({
    label: entry.name,
    insertText: entry.expression.replace(/^=/, ''),
    kind: GROUP_KINDS[entry.group] ?? 'function',
    ...(entry.detail ? { detail: entry.detail } : {}),
  }));

  const builtins: CompletionEntry[] = RDL_BUILTINS.map((name) => ({
    label: name,
    insertText: `${name}(`,
    kind: 'builtin',
    detail: 'función RDL',
  }));

  return [...variables, ...builtins];
}
