import * as monaco from 'monaco-editor';
// monaco 0.56 mapea `monaco-editor/*` → `esm/vs/*.js` (no hay que poner `esm/vs`).
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { getCompletionMeta } from './completionMeta';
import { completionSuggestions, expressionCompletions, VB_KEYWORDS } from './expressionCatalog';

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

/* ------------------------------ tema ------------------------------------- */

/** Tema de Monaco que toca según la clase `dark` de `<html>`. */
function currentThemeName(): 'rdlc-light' | 'rdlc-dark' {
  return document.documentElement.classList.contains('dark') ? 'rdlc-dark' : 'rdlc-light';
}

let themeObserver: MutationObserver | null = null;

/** Un único observador: al alternar el tema, Monaco cambia en caliente. */
function watchDocumentTheme(): void {
  if (themeObserver) return;
  themeObserver = new MutationObserver(() => monaco.editor.setTheme(currentThemeName()));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Host de los widgets que desbordan el editor (sugerencias, hover, firmas).
 *
 * Monaco los cuelga de aquí con `position: fixed`, y **todo el CSS de Monaco
 * está scopeado bajo `.monaco-editor`**: el host necesita esa clase o el
 * desplegable sale sin estilos (invisible; el proveedor sigue funcionando y
 * Tab inserta). Va en el `body` para escapar del `transform` y del `overflow`
 * de los diálogos; `pointer-events: auto` lo hace clicable aunque Radix
 * bloquee el resto de la página (modal) y el z-index lo pone por encima de los
 * diálogos (z-50).
 */
function overflowWidgetsHost(): HTMLElement {
  let host = document.querySelector<HTMLElement>('[data-rdlc-overflow-widgets]');
  if (!host) {
    host = document.createElement('div');
    host.className = 'monaco-editor';
    host.setAttribute('data-rdlc-overflow-widgets', '');
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '9999',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(host);
  }
  return host;
}

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

  // Tema oscuro («blanco y negro» invertido): contraste alto sobre casi negro.
  monaco.editor.defineTheme('rdlc-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'namespace', foreground: 'c4b5fd', fontStyle: 'bold' },
      { token: 'predefined', foreground: '5eead4' },
      { token: 'keyword', foreground: '93c5fd' },
      { token: 'string', foreground: 'fcd34d' },
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'number', foreground: 'fdba74' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
    },
  });

  watchDocumentTheme();

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
        suggestions: completionSuggestions(meta).map((entry) => ({
          label: entry.labelDetail
            ? { label: entry.label, detail: ` ${entry.labelDetail}` }
            : entry.label,
          kind: completionKind(entry.kind),
          insertText: entry.insertText,
          insertTextRules: entry.snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: entry.detail,
          sortText: entry.sortText,
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
  /** Pone el foco en el editor (transición desde un campo literal). */
  focus(): void;
  dispose(): void;
}

/**
 * Crea el editor sobre `container`. Los commits (blur, Enter en expresión y
 * Ctrl+Enter en código) se avisan por `onCommit`; el foco por `onFocus`.
 * `onSubmit` (opcional) sustituye a `onCommit` en esos atajos: es el «confirmar
 * el diálogo» de los diálogos de expresión (Enter/Ctrl+Intro = Aplicar).
 */
export function createExpressionEditor(
  container: HTMLElement,
  options: ExpressionEditorOptions,
  callbacks: { onCommit(): void; onFocus(): void; onSubmit?(): void },
): ExpressionEditorHandles {
  registerRdlcLanguage();
  watchDocumentTheme();

  const mode = options.mode;
  const editor = monaco.editor.create(container, {
    value: options.value,
    language: RDLC_LANGUAGE_ID,
    theme: currentThemeName(),
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
    // Las sugerencias/hover viven fuera del editor (los diálogos tienen
    // `transform` y `overflow-hidden`): en el host de body, con la clase
    // `monaco-editor` para que el CSS de Monaco les aplique.
    overflowWidgetsDomNode: overflowWidgetsHost(),
    ariaLabel: options.ariaLabel,
  });

  const submit = callbacks.onSubmit ?? callbacks.onCommit;
  // `addAction` (no `addCommand`): las acciones viven en su editor; un
  // `addCommand` dinámico con varios editores montados enruta al último
  // registrado (monaco#2947) y puede secuestrar sus atajos (BUG-45).
  editor.addAction({
    id: 'rdlc-submit',
    label: 'Aplicar',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => submit(),
  });
  if (mode === 'expression') {
    editor.addAction({
      id: 'rdlc-submit-enter',
      label: 'Aplicar (Enter)',
      keybindings: [monaco.KeyCode.Enter],
      // Con el desplegable de sugerencias abierto, Enter la acepta.
      precondition: '!suggestWidgetVisible',
      run: () => submit(),
    });
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
    focus: () => editor.focus(),
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
