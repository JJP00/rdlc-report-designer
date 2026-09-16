/**
 * Inserción en el editor de expresiones activo (Monaco).
 *
 * El panel de variables y la paleta Ctrl+K no conocen el editor: preguntan a
 * este registro. Si hay un editor con foco, la expresión se inserta en la
 * posición del cursor; si no, quien pregunta cae al portapapeles.
 */

type InsertionHandler = (expression: string) => void;

let activeHandler: InsertionHandler | null = null;

/** El editor llama al recibir foco (y con `null` al desmontarse). */
export function setExpressionInserter(handler: InsertionHandler | null): void {
  activeHandler = handler;
  if (import.meta.env.DEV) {
    console.log(`[debug] editor de expresiones ${handler ? 'registrado' : 'liberado'}`);
  }
}

/** true si la expresión se insertó en un editor. */
export function insertIntoExpressionEditor(expression: string): boolean {
  if (import.meta.env.DEV) {
    console.log(`[debug] insertar en editor: ${activeHandler ? 'con destino' : 'sin destino'}`);
  }
  if (!activeHandler) return false;
  activeHandler(expression);
  return true;
}

/** Solo para tests: saber si hay editor registrado. */
export function hasExpressionInserter(): boolean {
  return activeHandler !== null;
}
