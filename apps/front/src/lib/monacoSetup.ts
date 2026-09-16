import type { ReportMetaDto } from '@rdlc-designer/contracts';
import * as monaco from 'monaco-editor';
// monaco 0.56 mapea `monaco-editor/*` → `esm/vs/*.js` (no hay que poner `esm/vs`).
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { getCompletionMeta } from './completionMeta';
import { expressionCompletions, VB_KEYWORDS } from './expressionCatalog';

/**
 * Host de Monaco: aquí vive **todo** lo que depende de `monaco-editor`.
 *
 * Este módulo se importa de forma **dinámica** desde `ExpressionEditor`, así el
 * editor (una librería pesada) solo se descarga cuando aparece un panel con una
 * expresión, no al arrancar la aplicación.
 */

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export const RDLC_LANGUAGE_ID = 'rdlc-expr';

const KEYWORD_SET = new Set(VB_KEYWORDS.map((keyword) => keyword.toLowerCase()));
const BUILTIN_SET = new Set(
  expressionCompletions({ code: { text: '', functions: [] }, fields: [], parameters: [] })
    .filter((entry) => entry.kind === 'builtin')
    .map((entry) => entry.label.toLowerCase()),
);

let registered = false;

/* ------------------------------- lenguaje -------------------------------- */

function registerRdlcLanguage(): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: RDLC_LANGUAGE_ID,
    extensions: ['.vbexpr'],
    aliases: ['Expresión RDL', 'rdlc'],
  });

  monaco.languages.setMonarchTokensProvider(RDLC_LANGUAGE_ID, {
    defaultToken: '',
    ignoreCase: true,
    tokenizer: {
      root: [
        // Comentario VB
        [/'[^\n]*/, 'comment'],
        // Texto entre comillas (con "" como escape)
        [/"([^"]|"")*"/, 'string'],
        // Referencias del informe: Fields!X.Value, Code.Fn, Parameters!…
        [/\b(Fields|Parameters|Globals|User|ReportItems)!/, 'namespace'],
        [/\bCode(?=\s*[.!])/, 'namespace'],
        // Palabras y funciones
        [
          /[A-Za-z_][A-Za-z0-9_]*/,
          {
            cases: {
              '@builtins': 'predefined',
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
        // Números (con separador decimal)
        [/\d+(\.\d+)?([eE][-+]?\d+)?/, 'number'],
        // Operadores
        [/[<>]=?|[=+\-*/\\&^]/, 'operator'],
        [/[(),.]/, 'delimiter'],
      ],
    },
    builtins: [...BUILTIN_SET],
    keywords: [...KEYWORD_SET],
  } as monaco.languages.IMonarchLanguage);

  monaco.editor.defineTheme('rdlc-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'namespace', foreground: '7c3aed', fontStyle: 'bold' },
      { token: 'predefined', foreground: '0f766e' },
      { token: 'keyword', foreground: '1d4ed8' },
      { token: 'string', foreground: 'b45309' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'number', foreground: '9a3412' },
    ],
    colors: {
      'editor.background': '#ffffff',
    },
  });

  monaco.languages.registerCompletionItemProvider(RDLC_LANGUAGE_ID, {
    triggerCharacters: ['!', '.'],
    provideCompletionItems: (model, position) => {
      const meta = getCompletionMeta();
      if (!meta) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );

      return {
        suggestions: expressionCompletions(meta).map((entry) => ({
          label: entry.label,
          kind: completionKind(entry.kind),
          insertText: entry.insertText,
          detail: entry.detail,
          range,
        })),
      };
    },
  });
}

function completionKind(kind: string): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'field':
      return monaco.languages.CompletionItemKind.Field;
    case 'parameter':
      return monaco.languages.CompletionItemKind.Variable;
    case 'code':
      return monaco.languages.CompletionItemKind.Function;
    case 'user':
      return monaco.languages.CompletionItemKind.Value;
    case 'global':
      return monaco.languages.CompletionItemKind.Constant;
    default:
      return monaco.languages.CompletionItemKind.Method;
  }
}

/* ------------------------------ instancia -------------------------------- */

export interface ExpressionEditorOptions {
  value: string;
  /** `expression`: una línea, sin números ni plegado. `code`: bloque VB. */
  mode: 'expression' | 'code';
  ariaLabel: string;
}

export interface ExpressionEditorHandles {
  getValue(): string;
  /** Solo escribe si el valor cambió (evita pisar lo que se está tecleando). */
  updateValue(value: string): void;
  hasTextFocus(): boolean;
  insertAtCursor(text: string): void;
  dispose(): void;
}

/**
 * Crea el editor sobre `container`. Los commits (blur, Enter en expresión y
 * Ctrl+Enter en código) se avisan por `onCommit`; el foco por `onFocus`.
 */
export function createExpressionEditor(
  container: HTMLElement,
  options: ExpressionEditorOptions,
  callbacks: { onCommit(): void; onFocus(): void },
): ExpressionEditorHandles {
  registerRdlcLanguage();

  const mode = options.mode;
  const editor = monaco.editor.create(container, {
    value: options.value,
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
    ariaLabel: options.ariaLabel,
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.onCommit());
  if (mode === 'expression') {
    editor.addCommand(monaco.KeyCode.Enter, () => callbacks.onCommit());
  }

  const blurSubscription = editor.onDidBlurEditorText(() => callbacks.onCommit());
  editor.onDidFocusEditorText(() => callbacks.onFocus());

  return {
    getValue: () => editor.getValue(),
    updateValue: (value: string) => {
      if (editor.hasTextFocus()) return;
      if (editor.getValue() !== value) editor.setValue(value);
    },
    hasTextFocus: () => editor.hasTextFocus(),
    insertAtCursor: (expression: string) => insertAtCursor(editor, expression),
    dispose: () => {
      blurSubscription.dispose();
      editor.dispose();
    },
  };
}

/**
 * Inserta la expresión en la posición del cursor. Si el editor está vacío se
 * pega tal cual (con el `=`); si ya hay expresión se pega como fragmento.
 */
function insertAtCursor(editor: monaco.editor.IStandaloneCodeEditor, expression: string): void {
  const selection = editor.getSelection();
  if (!selection) return;

  const isEmpty = editor.getValue().trim().length === 0;
  const text = isEmpty ? expression : expression.replace(/^=/, '');

  editor.executeEdits('rdlc-insert', [{ range: selection, text, forceMoveMarkers: true }]);
  editor.focus();
}
