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
 * 4. Cualquier otra expresión: `[exp]`.
 */
export function runDisplayText(run: Pick<TextRunDto, 'value' | 'label'>): string {
  if (!run.value.trimStart().startsWith('=')) return run.value;
  if (run.label !== undefined && run.label !== '') return `[${run.label}]`;

  const field = SIMPLE_FIELD.exec(run.value);
  if (field) return field[1]!;

  return '[exp]';
}

/** `=Fields!Nombre.Value` (espacios opcionales y `.Value` opcional). */
const SIMPLE_FIELD = /^=\s*Fields!([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.Value)?\s*$/;
