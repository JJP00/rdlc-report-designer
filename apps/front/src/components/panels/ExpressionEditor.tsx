import * as monaco from 'monaco-editor';
import { useEffect, useRef, type ReactNode } from 'react';
import { setExpressionInserter } from '@/lib/expressionEditor';
import { RDLC_LANGUAGE_ID, registerRdlcLanguage } from '@/lib/monacoSetup';

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
 */
export function ExpressionEditor({
  value,
  mode,
  onCommit,
  ariaLabel,
  height,
}: ExpressionEditorProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    registerRdlcLanguage();

    const editor = monaco.editor.create(container, {
      value,
      language: RDLC_LANGUAGE_ID,
      theme: 'rdlc-light',
      automaticLayout: true,
      fontSize: 12,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      lineNumbers: mode === 'code' ? 'on' : 'off',
      lineDecorationsWidth: 6,
      glyphMargin: false,
      folding: mode === 'code',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      renderLineHighlight: 'none',
      wordWrap: 'on',
      tabSize: 4,
      padding: { top: 6, bottom: 6 },
      scrollbar: {
        vertical: mode === 'code' ? 'auto' : 'hidden',
        horizontal: 'hidden',
        alwaysConsumeMouseWheel: false,
      },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      fixedOverflowWidgets: true,
      ariaLabel,
    });
    editorRef.current = editor;

    // Commits: blur, Enter (solo expresión) y Ctrl+Enter.
    const blurSubscription = editor.onDidBlurEditorText(() => {
      commitRef.current(editor.getValue());
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      commitRef.current(editor.getValue());
    });
    if (mode === 'expression') {
      editor.addCommand(monaco.KeyCode.Enter, () => {
        commitRef.current(editor.getValue());
      });
    }

    editor.onDidFocusEditorText(() => {
      setExpressionInserter((expression: string) => insertAtCursor(editor, expression));
    });
    // No se desregistra al perder el foco: al pulsar una variable de la lista el
    // editor ya no tiene el foco, pero es el destino natural de la inserción.
    // Se desregistra al desmontar (cerrar el panel/diálogo).

    return () => {
      setExpressionInserter(null);
      blurSubscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // El editor se crea una sola vez: `value`/`mode` se sincronizan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza cambios externos sin pisar lo que se está escribiendo.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.hasTextFocus()) return;
    if (editor.getValue() !== value) editor.setValue(value ?? '');
  }, [value]);

  return (
    <div
      ref={containerRef}
      role="textbox"
      aria-label={ariaLabel}
      className="overflow-hidden rounded-md border bg-white"
      style={{ height: height ?? (mode === 'code' ? 380 : 58) }}
    />
  );
}

/**
 * Inserta la expresión en la posición del cursor. Si el editor está vacío se
 * pega tal cual (con el `=`); si ya hay expresión se pega como fragmento.
 */
function insertAtCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  expression: string,
): void {
  const selection = editor.getSelection();
  if (!selection) return;

  const isEmpty = editor.getValue().trim().length === 0;
  const text = isEmpty ? expression : expression.replace(/^=/, '');

  editor.executeEdits('rdlc-insert', [
    { range: selection, text, forceMoveMarkers: true },
  ]);
  editor.focus();
}
