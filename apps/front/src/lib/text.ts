import type { TextRunDto } from '@rdlc-designer/contracts';

/**
 * Texto visible de un run en el lienzo (como el diseñador de Report Builder /
 * BC, que no renderiza datos):
 *
 * 1. Si el run trae `<Label>`, manda la etiqueta: `[MiEtiqueta]`.
 * 2. Si la expresión es una referencia simple a un campo
 *    (`=Fields!BTCDescriptionLbl.Value`) se muestra el **nombre del campo**.
 * 3. Cualquier otra expresión (agregados, `IIf`, concatenaciones, parámetros…)
 *    se resume como `[exp]`.
 * 4. Texto plano: tal cual.
 *
 * El valor real sigue intacto en el panel de texto, que es donde se edita.
 */
export function runDisplayText(run: Pick<TextRunDto, 'value' | 'label'>): string {
  if (run.label !== undefined) return `[${run.label}]`;

  const field = SIMPLE_FIELD.exec(run.value);
  if (field) return field[1]!;

  if (run.value.trimStart().startsWith('=')) return '[exp]';

  return run.value;
}

/** `=Fields!Nombre.Value` (espacios opcionales y `.Value` opcional). */
const SIMPLE_FIELD = /^=\s*Fields!([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.Value)?\s*$/;
