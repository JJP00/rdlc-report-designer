import type { TextRunDto } from '@rdlc-designer/contracts';

/**
 * Texto que el diseñador pinta en el lienzo para cada run (tiempo de diseño:
 * las expresiones **no se evalúan**, como en Report Builder):
 *
 * 1. Texto plano: tal cual.
 * 2. Expresión con etiqueta de diseñador (`<Label>` de BC): la **etiqueta**
 *    entre corchetes (`[BTCMyCompanyName]`), como el diseñador de BC/RB.
 * 3. Expresión **simple de campo** (`=Fields!BTCDescriptionLbl.Value`): el
 *    nombre del campo (`BTCDescriptionLbl`).
 * 4. **Agregado simple** sobre un campo (`=First(Fields!X.Value, "ds")`,
 *    `=Sum(Fields!Y.Value)`): `Función(Campo)` (`First(X)`, `Sum(Y)`); el
 *    ámbito (`"DataSet_Result"`) no se pinta.
 * 5. Cualquier otra expresión: `[exp]`.
 */
export function runDisplayText(run: Pick<TextRunDto, 'value' | 'label'>): string {
  if (!run.value.trimStart().startsWith('=')) return run.value;
  if (run.label !== undefined && run.label !== '') return `[${run.label}]`;

  const field = SIMPLE_FIELD.exec(run.value);
  if (field) return field[1]!;

  const aggregate = SIMPLE_AGGREGATE.exec(run.value);
  if (aggregate) return `${aggregate[1]}(${aggregate[2]})`;

  return '[exp]';
}

/** `=Fields!Nombre.Value` (espacios opcionales y `.Value` opcional). */
const SIMPLE_FIELD = /^=\s*Fields!([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.Value)?\s*$/;

/** Agregados habituales de BC/SSRS (la comparación no distingue mayúsculas). */
const AGGREGATE = 'CountDistinct|StDevP|StDev|VarP|Var|First|Last|Sum|Avg|Min|Max|Count';

/**
 * Agregado simple: **una única** llamada a un agregado con el campo como
 * primer argumento directo y, como mucho, dos argumentos literales de ámbito
 * (`"DataSet_Result"`, `True`/`False`, un número). Todo lo demás — anidamiento
 * (`=Sum(CDec(...))`), combinación de expresiones (`=Sum(...) + Sum(...)`),
 * otras funciones — cae en `[exp]`.
 */
const SIMPLE_AGGREGATE = new RegExp(
  `^=\\s*(${AGGREGATE})\\s*\\(\\s*Fields!([A-Za-z_][A-Za-z0-9_]*)\\s*(?:\\.Value)?\\s*` +
    '(?:,\\s*(?:"(?:[^"]|"")*"|[-+]?\\d+(?:\\.\\d+)?|True|False)\\s*){0,2}\\)\\s*$',
  'i',
);
