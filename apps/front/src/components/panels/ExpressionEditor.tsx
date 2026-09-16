import { useEffect, useRef, type ReactNode } from 'react';
import { setExpressionInserter } from '@/lib/expressionEditor';
import type { ExpressionEditorHandles } from '@/lib/monacoSetup';

export interface ExpressionEditorProps {
  value: string;
  /**
   * `expression`: una expresión RDL (`=Fields!X.Value`), altura corta y sin
   * números de línea. `code`: bloque VB completo (`<Code>`).
   */
  mode: 'expression' | 'code';
  /** Se llama al perder el foco, con Enter (expresión) o Ctrl+Enter (código). */
  onCommit: (value: string) => void;
  /** Etiqueta accesible del editor. */
  ariaLabel: string;
  /** Alto en px (por defecto: 2 líneas en expresión, 380 en código). */
  height?: number;
}

/**
 * Editor Monaco con el lenguaje `rdlc-expr`: resaltado VB-like y autocompletado
 * (campos, parámetros, funciones de `<Code>`, Globals!, User! y funciones RDL).
 * Al recibir foco se registra para insertar variables en la posición del cursor.
 *
 * Monaco se carga **en diferido** (import dinámico del host): la librería solo
 * se descarga cuando aparece un panel con una expresión.
 */
export function ExpressionEditor({
  value,
  mode,
  onCommit,
  ariaLabel,
  height,
}: ExpressionEditorProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ExpressionEditorHandles | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let handles: ExpressionEditorHandles | null = null;
    void (async () => {
      const host = await import('@/lib/monacoSetup');
      if (cancelled) return;

      handles = host.createExpressionEditor(
        container,
        { value, mode, ariaLabel },
        {
          onCommit: () => {
            const current = handles?.getValue();
            if (current !== undefined) commitRef.current(current);
          },
          onFocus: () => {
            setExpressionInserter((expression) => handles?.insertAtCursor(expression));
          },
        },
      );
      editorRef.current = handles;
    })();

    return () => {
      cancelled = true;
      setExpressionInserter(null);
      editorRef.current = null;
      handles?.dispose();
    };
    // Se crea una sola vez; `value` se sincroniza en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza cambios externos sin pisar lo que se está escribiendo.
  useEffect(() => {
    editorRef.current?.updateValue(value ?? '');
  }, [value]);

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      className="overflow-hidden rounded-md border bg-white"
      style={{ height: height ?? (mode === 'code' ? 380 : 58) }}
    />
  );
}
