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
  'field' | 'parameter' | 'function' | 'global' | 'user' | 'code' | 'builtin';

export interface CompletionEntry {
  /** Texto que se muestra en la lista. */
  label: string;
  /** Texto que se inserta (sin el `=` inicial: es un fragmento de expresión). */
  insertText: string;
  kind: CompletionKind;
  detail?: string;
}

/** Entrada ya preparada para pintar en la lista del editor. */
export interface CompletionSuggestion {
  label: string;
  /** Sufijo gris junto al nombre (los parámetros de una función). */
  labelDetail?: string;
  insertText: string;
  kind: CompletionKind;
  detail?: string;
  /** true si `insertText` lleva `$0` y hay que insertarlo como snippet. */
  snippet: boolean;
  /** Agrupa y ordena la lista: campos → parámetros → Code. → Globals/User → RDL. */
  sortText: string;
}

const GROUP_KINDS: Record<string, CompletionKind> = {
  [VARIABLE_GROUPS.fields]: 'field',
  [VARIABLE_GROUPS.parameters]: 'parameter',
  [VARIABLE_GROUPS.functions]: 'code',
  [VARIABLE_GROUPS.globals]: 'global',
  [VARIABLE_GROUPS.user]: 'user',
};

/** Orden de los grupos en la lista (menor = antes). */
const GROUP_ORDER: CompletionKind[] = ['field', 'parameter', 'code', 'global', 'user', 'builtin'];

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

/**
 * Sugerencias listas para la lista del editor: las funciones se ofrecen con su
 * firma al lado (`BlankNeg (v)`) y se insertan **con el paréntesis cerrado**
 * dejando el cursor dentro (`Code.BlankNeg($0)`).
 */
export function completionSuggestions(meta: ReportMetaDto): CompletionSuggestion[] {
  return expressionCompletions(meta).map((entry) => {
    const isCallable = entry.kind === 'builtin' || entry.kind === 'code';
    const order = GROUP_ORDER.indexOf(entry.kind);

    return {
      label: entry.label,
      // La firma junto al nombre solo para funciones del `<Code>` (sus
      // parámetros); las RDL llevan el detalle a la derecha.
      ...(entry.kind === 'code' && entry.detail ? { labelDetail: `(${entry.detail})` } : {}),
      insertText: isCallable ? `${entry.insertText}$0)` : entry.insertText,
      kind: entry.kind,
      ...(entry.detail ? { detail: entry.detail } : {}),
      snippet: isCallable,
      sortText: `${order < 0 ? GROUP_ORDER.length : order}-${entry.label.toLowerCase()}`,
    };
  });
}
