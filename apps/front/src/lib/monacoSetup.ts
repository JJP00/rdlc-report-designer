import type { ReportMetaDto } from '@rdlc-designer/contracts';
import * as monaco from 'monaco-editor';
// monaco 0.56 mapea `monaco-editor/*` → `esm/vs/*.js` (no hay que poner `esm/vs`).
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { expressionCompletions, VB_KEYWORDS } from './expressionCatalog';

/**
 * Configuración de Monaco (una sola vez por renderer):
 *
 * - El worker del editor se empaqueta con Vite (`?worker`); sin él Monaco avisa
 *   y algunas features (sugerencias, plegado) no funcionan.
 * - Se registra el lenguaje `rdlc-expr` (VB-like) con tokenizador Monarch y un
 *   proveedor de autocompletado que se alimenta de la proyección del informe.
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
/** Metadatos del informe abierto (alimentan el autocompletado). */
let currentMeta: ReportMetaDto | null = null;

/** El documento activo actualiza esto (lo usa el proveedor de sugerencias). */
export function setCompletionMeta(meta: ReportMetaDto | null): void {
  currentMeta = meta;
}

/** Registra lenguaje y autocompletado una sola vez (importar ya configura el worker). */
export function registerRdlcLanguage(): void {
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

  registerRdlcCompletions();

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
}

/**
 * Proveedor de autocompletado alimentado por la proyección (campos, parámetros,
 * funciones del bloque `<Code>`, Globals!, User! y funciones del estándar).
 */
export function registerRdlcCompletions(): void {
  monaco.languages.registerCompletionItemProvider(RDLC_LANGUAGE_ID, {
    triggerCharacters: ['!', '.'],
    provideCompletionItems: (model, position) => {
      const meta = currentMeta;
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
