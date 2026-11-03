import { useT } from '@rdlc-designer/i18n/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { setExpressionInserter } from '@/lib/expressionEditor';
import type { ExpressionEditorHandles, FocusCaret } from '@/lib/monacoSetup';

export interface ExpressionEditorProps {
  value: string;
  /**
   * `expression`: un **valor** (texto o `=Fields!X.Value`), altura corta y sin
   * números de línea; el texto no se colorea ni sugiere hasta el `=`. `code`:
   * bloque VB completo (`<Code>`).
   */
  mode: 'expression' | 'code';
  /** Se llama al perder el foco, con Enter (expresión) o Ctrl+Enter (código). */
  onCommit: (value: string) => void;
  /**
   * Sustituye a `onCommit` en Enter/Ctrl+Enter y recibe el valor vivo del
   * editor: es el «confirmar el diálogo» (Enter aplica y cierra), sin depender
   * de estados de React que aún no se han re-renderizado.
   */
  onSubmit?: (value: string) => void;
  /**
   * Cada tecla, para los borradores que se leen antes del commit (validar o
   * reflejar el texto en otro campo). Los valores externos no lo disparan.
   */
  onChange?: (value: string) => void;
  /**
   * Escape descarta lo tecleado (vuelve al último valor) y avisa. Se lee **al
   * montar**: sin él, Escape sigue su camino (p. ej. cerrar el diálogo).
   */
  onCancel?: () => void;
  /** Etiqueta accesible del editor. */
  ariaLabel: string;
  /** Texto de hueco con el editor vacío. */
  placeholder?: string;
  /** Alto en px (por defecto: 2 líneas en expresión, 380 en código). */
  height?: number;
}

/** Acciones del editor para quien lo monta (p. ej. dar el foco desde un selector). */
export interface ExpressionEditorHandle {
  /** Pone el foco; si Monaco aún carga, en cuanto termina. */
  focus(caret?: FocusCaret): void;
}

/**
 * Editor Monaco con el lenguaje `rdlc-expr`: resaltado VB-like y autocompletado
 * (campos, parámetros, funciones de `<Code>`, Globals!, User! y funciones RDL).
 * Al recibir foco se registra para insertar variables en la posición del cursor.
 *
 * Edita **cualquier** valor, texto o expresión: el `=` no cambia de editor (ni
 * se pierde el foco), solo enciende el resaltado y las sugerencias.
 *
 * Monaco se carga **en diferido** (import dinámico del host): la librería solo
 * se descarga cuando aparece un panel con una expresión.
 */
export const ExpressionEditor = forwardRef<ExpressionEditorHandle, ExpressionEditorProps>(
  function ExpressionEditor(
    { value, mode, onCommit, onSubmit, onChange, onCancel, ariaLabel, placeholder, height },
    ref,
  ): ReactNode {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<ExpressionEditorHandles | null>(null);
    /** Foco pedido antes de que Monaco termine de cargar. */
    const pendingFocusRef = useRef<{ caret?: FocusCaret } | null>(null);
    // Valor y etiqueta vigentes al terminar la carga (no los del montaje): si
    // cambian mientras Monaco carga, el editor nace con los de ahora.
    const valueRef = useRef(value);
    const ariaLabelRef = useRef(ariaLabel);
    const commitRef = useRef(onCommit);
    const submitRef = useRef(onSubmit);
    const changeRef = useRef(onChange);
    const cancelRef = useRef(onCancel);

    useEffect(() => {
      valueRef.current = value;
      ariaLabelRef.current = ariaLabel;
      commitRef.current = onCommit;
      submitRef.current = onSubmit;
      changeRef.current = onChange;
      cancelRef.current = onCancel;
    });

    useImperativeHandle(
      ref,
      () => ({
        focus: (caret) => {
          if (editorRef.current) editorRef.current.focus(caret);
          else pendingFocusRef.current = { caret };
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let cancelled = false;
      let disposed = false;
      let handles: ExpressionEditorHandles | null = null;
      void (async () => {
        const host = await import('@/lib/monacoSetup');
        if (cancelled) return;

        handles = host.createExpressionEditor(
          container,
          { value: valueRef.current ?? '', mode, ariaLabel: ariaLabelRef.current, placeholder, t },
          {
            onCommit: () => {
              if (disposed) return;
              const current = handles?.getValue();
              if (current !== undefined) commitRef.current(current);
            },
            onSubmit: () => {
              if (disposed) return;
              // Primero el commit (los borradores quedan al día) y después el
              // envío, con el valor recién leído del editor.
              const current = handles?.getValue();
              if (current === undefined) return;
              commitRef.current(current);
              submitRef.current?.(current);
            },
            onChange: () => {
              if (disposed) return;
              const current = handles?.getValue();
              if (current !== undefined) changeRef.current?.(current);
            },
            ...(cancelRef.current
              ? {
                  onCancel: () => {
                    if (!disposed) cancelRef.current?.();
                  },
                }
              : {}),
            onFocus: () => {
              if (disposed) return;
              setExpressionInserter((expression) => handles?.insertAtCursor(expression));
            },
          },
        );
        editorRef.current = handles;
        const pending = pendingFocusRef.current;
        pendingFocusRef.current = null;
        if (pending) handles.focus(pending.caret);
      })();

      return () => {
        cancelled = true;
        disposed = true;
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

    // La etiqueta sigue al valor (texto ↔ expresión) sin volver a montar Monaco.
    useEffect(() => {
      editorRef.current?.setAriaLabel(ariaLabel);
    }, [ariaLabel]);

    return (
      <div
        ref={containerRef}
        aria-label={ariaLabel}
        className="overflow-hidden rounded-md border bg-white dark:bg-[#1e1e1e]"
        style={{ height: height ?? (mode === 'code' ? 380 : 58) }}
      />
    );
  },
);
