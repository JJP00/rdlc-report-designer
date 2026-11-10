import type { ParagraphDto, TextboxDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Sigma,
  TextCursorInput,
  Trash2,
  Type,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResizableDialogContent,
} from '@/components/ui/dialog';
import { useAvailableFonts } from '@/hooks/useAvailableFonts';
import {
  commit,
  createHistory,
  mapCaret,
  redo as redoHistory,
  undo as undoHistory,
  type DraftHistory,
} from '@/lib/draftHistory';
import {
  EXPRESSION_CLOSE,
  EXPRESSION_OPEN,
  addRun,
  duplicateParagraph,
  duplicateRun,
  insertionPointAt,
  markerRunAt,
  markerSpanAt,
  moveParagraph,
  moveRun,
  paragraphIndexAt,
  paragraphsToText,
  protectMarkers,
  removeParagraph,
  removeRun,
  setParagraphStyle,
  setRunStyle,
  splitMarkers,
  textToParagraphs,
  toggleRunKind,
  updateRun,
} from '@/lib/textEditor';
import { cn } from '@/lib/utils';
import type { ExpressionEditorHandle } from './ExpressionEditor';
import { RunEditor } from './RunEditor';

export interface TextEditorDialogProps {
  /** Textbox a editar; `undefined` = diálogo cerrado. */
  item: TextboxDto | undefined;
  onOpenChange: (open: boolean) => void;
  /** Aplica los párrafos en un solo comando (`setParagraphs`). */
  onApply: (id: string, paragraphs: ParagraphDto[]) => void;
}

/**
 * Editor de texto del Textbox: un **textarea** con el documento (un párrafo por
 * línea y las expresiones entre marcadores `⟨=…⟩`, resaltados) y, debajo, el
 * bloque del párrafo en el que está el cursor: su alineación, sus acciones y
 * sus runs con su formato. El borrador se monta **al abrir** y se aplica de una
 * vez (`setParagraphs`, un solo undo).
 *
 * El marco es el estándar redimensionable (BUG-63): `ResizableDialogContent` +
 * `DialogBody`, con la cabecera y el pie fijos y el scroll en el cuerpo.
 */
export function TextEditorDialog({
  item,
  onOpenChange,
  onApply,
}: TextEditorDialogProps): ReactNode {
  return (
    <Dialog open={item !== undefined} onOpenChange={onOpenChange}>
      <ResizableDialogContent
        className="max-h-[90vh] w-full max-w-4xl gap-0 p-0 sm:max-w-4xl"
        // El foco entra en el texto (no en el primer botón): es lo que se viene
        // a editar. El caret queda al inicio, en el párrafo 1 (el activo).
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget instanceof HTMLElement ? event.currentTarget : document;
          const area = root.querySelector<HTMLTextAreaElement>('textarea[data-rdlc-text-document]');
          if (!area) return;
          event.preventDefault();
          area.focus();
        }}
      >
        {item ? (
          <TextEditorBody
            key={item.id}
            item={item}
            onCancel={() => onOpenChange(false)}
            onApply={(paragraphs) => {
              onApply(item.id, paragraphs);
              onOpenChange(false);
            }}
          />
        ) : null}
      </ResizableDialogContent>
    </Dialog>
  );
}

function TextEditorBody({
  item,
  onCancel,
  onApply,
}: {
  item: TextboxDto;
  onCancel: () => void;
  onApply: (paragraphs: ParagraphDto[]) => void;
}): ReactNode {
  const t = useT();
  // Borrador propio: se monta con el textbox abierto (nada de resincronizar). El
  // textarea y los bloques son dos vistas del mismo documento y comparten **un**
  // historial de deshacer/rehacer (Ctrl+Z / Ctrl+Mayús+Z / Ctrl+Y, ver `onUndoRedoKey`).
  const [history, setHistory] = useState<DraftHistory>(() =>
    createHistory({
      paragraphs: clone(item.paragraphs),
      text: paragraphsToText(item.paragraphs),
    }),
  );
  const { paragraphs, text } = history.present;
  /** Párrafo en el que está el cursor (el bloque de abajo). */
  const [active, setActive] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Cursor que el textarea recupera tras un deshacer/rehacer (React reescribe el valor y lo manda al final). */
  const pendingCaretRef = useRef<number | null>(null);
  const fonts = useAvailableFonts();
  /** Capa de resaltado detrás del textarea (marcadores y párrafo activo). */
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const documentId = useId();
  const paragraphHeadingId = useId();
  const emptyMarker = `${EXPRESSION_OPEN}=${EXPRESSION_CLOSE}`;
  /** Último caret del textarea: da el sentido del movimiento al saltar una expresión. */
  const lastCaretRef = useRef(0);
  /** Editores del valor de los runs del párrafo activo, por índice de run. */
  const valueEditorsRef = useRef(new Map<number, ExpressionEditorHandle>());
  /** Foco pedido para el valor de un run (`seq` repite la petición del mismo run). */
  const [runFocus, setRunFocus] = useState<{ run: number; seq: number } | null>(null);
  const runListRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    textareaRef.current?.setSelectionRange(caret, caret);
  }, [history]);

  // Tras el render que monta los runs del párrafo pedido: a la vista y foco
  // (si Monaco aún carga, el editor lo toma al terminar).
  useEffect(() => {
    if (!runFocus) return;
    runListRef.current
      ?.querySelector(`[data-rdlc-run-index="${runFocus.run}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    valueEditorsRef.current.get(runFocus.run)?.focus('end');
  }, [runFocus]);

  const runCount = paragraphs.reduce((acc, paragraph) => acc + paragraph.runs.length, 0);
  const activeParagraph = paragraphs[active];

  const focusCaret = (caret: number): void => {
    requestAnimationFrame(() => {
      const area = textareaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  };

  /**
   * El textarea manda: reconstruye los párrafos conservando formato/etiqueta.
   * Las expresiones no se editan aquí (`protectMarkers`): tocar un trozo de una
   * la quita entera, en un paso de deshacer propio, y escribir dentro va detrás.
   */
  const changeText = (next: string): void => {
    const area = textareaRef.current;
    const guarded = protectMarkers(text, next, area?.selectionEnd ?? next.length);
    if (guarded.changed) pendingCaretRef.current = guarded.caret;
    lastCaretRef.current = guarded.caret;
    const now = Date.now();
    setHistory((current) =>
      commit(
        current,
        {
          text: guarded.text,
          paragraphs: textToParagraphs(guarded.text, current.present.paragraphs),
        },
        guarded.changed ? { now } : { key: 'textarea', now },
      ),
    );
  };

  /**
   * Un cambio del bloque inferior se refleja en el textarea. `key` agrupa las
   * teclas seguidas de un mismo campo en un solo paso de deshacer; sin ella
   * (botones) cada cambio es un paso.
   */
  const changeParagraphs = (
    update: (current: ParagraphDto[]) => ParagraphDto[],
    key?: string,
  ): void => {
    const next = update(paragraphs);
    const now = Date.now();
    setHistory((current) =>
      commit(
        current,
        { text: paragraphsToText(next), paragraphs: next },
        key === undefined ? { now } : { key, now },
      ),
    );
    setActive((current) => Math.max(0, Math.min(current, next.length - 1)));
  };

  /** Deshacer/rehacer del borrador completo: el cursor del textarea sigue al cambio. */
  const stepHistory = (direction: 'undo' | 'redo'): void => {
    const next = direction === 'undo' ? undoHistory(history) : redoHistory(history);
    if (next === history) return;
    const area = textareaRef.current;
    setHistory(next);
    if (area && document.activeElement === area) {
      const mapped = mapCaret(text, next.present.text, area.selectionStart);
      // Nunca dentro de una expresión: a su final.
      const caret = markerSpanAt(next.present.text, mapped)?.end ?? mapped;
      pendingCaretRef.current = caret;
      lastCaretRef.current = caret;
      setActive(paragraphIndexAt(next.present.text, caret));
    } else {
      setActive((current) => Math.max(0, Math.min(current, next.present.paragraphs.length - 1)));
    }
  };

  /**
   * Ctrl+Z deshace, Ctrl+Mayús+Z / Ctrl+Y rehacen, estés donde estés del
   * diálogo (textarea, Monaco, botones). En **captura**: Monaco y el textarea
   * tienen su propio historial y, si manejaran la tecla, deshacerían solo lo
   * suyo y en otro orden. El buscador de Monaco conserva el suyo.
   */
  const onUndoRedoKey = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
    if (!isUndo && !isRedo) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.find-widget')) return;
    event.preventDefault();
    event.stopPropagation();
    stepHistory(isUndo ? 'undo' : 'redo');
  };

  /** Lleva el foco al valor del run `run` del párrafo `paragraph` (el bloque de abajo). */
  const focusRun = (paragraph: number, run: number): void => {
    setActive(paragraph);
    setRunFocus((current) => ({ run, seq: (current?.seq ?? 0) + 1 }));
  };

  /**
   * Cursor del textarea → párrafo activo. El caret no se queda dentro de una
   * expresión: salta a su borde en el sentido en que se movía (una flecha la
   * cruza entera).
   */
  const syncActive = (): void => {
    const area = textareaRef.current;
    if (!area) return;
    let caret = area.selectionStart;
    if (area.selectionStart === area.selectionEnd) {
      const span = markerSpanAt(text, caret);
      if (span) {
        caret = caret >= lastCaretRef.current ? span.end : span.start;
        area.setSelectionRange(caret, caret);
      }
    }
    lastCaretRef.current = caret;
    setActive(paragraphIndexAt(text, caret));
  };

  /** Un clic en una expresión la edita en su fragmento, abajo: aquí no se edita. */
  const onDocumentMouseUp = (): void => {
    const area = textareaRef.current;
    if (!area) return;
    const hit =
      area.selectionStart === area.selectionEnd
        ? markerRunAt(text, area.selectionStart, paragraphs)
        : null;
    if (!hit) {
      syncActive();
      return;
    }
    // Al volver al textarea, el caret queda detrás de la expresión.
    area.setSelectionRange(hit.span.end, hit.span.end);
    lastCaretRef.current = hit.span.end;
    focusRun(hit.paragraph, hit.run);
  };

  /**
   * Inserta una expresión vacía en la posición del cursor y lleva el foco a su
   * fragmento, abajo, para escribirla (en el textarea no se edita).
   */
  const insertExpression = (): void => {
    const area = textareaRef.current;
    if (!area) return;
    // Sin selección y dentro de un `⟨…⟩`, va detrás: partirlo rompería su run.
    const collapsed = area.selectionStart === area.selectionEnd;
    const start = collapsed ? insertionPointAt(text, area.selectionStart) : area.selectionStart;
    const end = collapsed ? start : area.selectionEnd;
    const guarded = protectMarkers(
      text,
      text.slice(0, start) + emptyMarker + text.slice(end),
      start + emptyMarker.length,
    );
    const nextParagraphs = textToParagraphs(guarded.text, paragraphs);
    // Sin clave de ráfaga: insertar una expresión es un paso propio.
    const now = Date.now();
    setHistory((current) =>
      commit(current, { text: guarded.text, paragraphs: nextParagraphs }, { now }),
    );
    const caret = guarded.caret;
    pendingCaretRef.current = caret;
    lastCaretRef.current = caret;
    const hit = markerRunAt(guarded.text, caret - 1, nextParagraphs);
    if (hit) focusRun(hit.paragraph, hit.run);
    else {
      setActive(paragraphIndexAt(guarded.text, caret));
      focusCaret(caret);
    }
  };

  const addParagraph = (): void => {
    const next = [...paragraphs, { runs: [{ value: '' }] }];
    const nextText = paragraphsToText(next);
    const now = Date.now();
    setHistory((current) => commit(current, { text: nextText, paragraphs: next }, { now }));
    setActive(next.length - 1);
    focusCaret(nextText.length);
  };

  return (
    // `contents`: el contenedor no existe para el layout (cabecera, cuerpo y pie
    // siguen siendo hijos directos del marco flex); solo recoge las teclas.
    <div className="contents" onKeyDownCapture={onUndoRedoKey}>
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{t('text.editor.title', { id: item.id })}</DialogTitle>
          <Badge variant="outline">
            {t('text.document.mixedBadge', { paragraphs: paragraphs.length, runs: runCount })}
          </Badge>
        </div>
        <DialogDescription>{t('text.editor.description')}</DialogDescription>
      </DialogHeader>

      <datalist id="rdlc-font-families">
        {fonts.map((family) => (
          <option key={family} value={family} />
        ))}
      </datalist>

      <DialogBody
        className="flex flex-col gap-3 p-4"
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar, como en el diálogo de expresiones (el textarea
          // necesita Enter para párrafos). Dentro de un editor Monaco manda su
          // commit: aplicar aquí usaría un borrador de párrafos aún sin él.
          if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
          const target = event.target;
          if (target instanceof Element && target.closest('.monaco-editor')) return;
          event.preventDefault();
          onApply(paragraphs);
        }}
      >
        {/* Documento: un párrafo por línea y las expresiones entre marcadores. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor={documentId} className="text-xs font-semibold">
              {t('text.editor.textLabel')}
            </label>
            <Button
              variant="outline"
              size="xs"
              className="ml-auto"
              title={t('text.editor.insertAtCursorTitle')}
              onClick={insertExpression}
            >
              <TextCursorInput /> {t('text.editor.insertAtCursor')}
            </Button>
          </div>
          {/* El textarea (texto transparente: caret, selección e historial) va
              sobre una copia que pinta lo que se ve: las expresiones como chips
              **sin** los `⟨ ⟩` (siguen en el valor, invisibles, delimitando el
              run) y, con varios párrafos, la línea del párrafo activo (el del
              bloque de abajo). Misma caja, fuente y ajuste de línea: la copia
              nunca desplaza un carácter respecto al caret. */}
          <div className="relative rounded-md bg-background">
            <div
              ref={mirrorRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent p-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground select-none [scrollbar-gutter:stable]"
            >
              <DocumentHighlights text={text} activeLine={paragraphs.length > 1 ? active : null} />
            </div>
            <textarea
              ref={textareaRef}
              id={documentId}
              data-rdlc-text-document=""
              aria-label={t('text.editor.textareaAria')}
              spellCheck={false}
              className="relative block max-h-[45vh] min-h-[78px] w-full resize-y overflow-y-auto rounded-md border bg-transparent p-2 font-mono text-xs leading-5 text-transparent caret-foreground field-sizing-content selection:bg-ring/25 selection:text-transparent [scrollbar-gutter:stable]"
              value={text}
              onChange={(event) => changeText(event.target.value)}
              onMouseUp={onDocumentMouseUp}
              onKeyUp={syncActive}
              onSelect={syncActive}
              onScroll={(event) => {
                if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
            />
          </div>
        </div>

        {/* Bloque del párrafo activo: su alineación, sus acciones y sus runs. */}
        <section aria-labelledby={paragraphHeadingId} className="rounded-lg border bg-muted/20 p-2">
          <header className="flex flex-wrap items-center gap-1">
            <h3 id={paragraphHeadingId} className="mr-1 text-xs font-semibold">
              {t('text.editor.paragraphRuns', {
                index: active + 1,
                runs: activeParagraph?.runs.length ?? 0,
              })}
            </h3>
            {(
              [
                [
                  'Left',
                  <AlignLeft key="l" />,
                  'text.editor.alignLeft',
                  'text.editor.alignLeftAria',
                ],
                [
                  'Center',
                  <AlignCenter key="c" />,
                  'text.editor.alignCenter',
                  'text.editor.alignCenterAria',
                ],
                [
                  'Right',
                  <AlignRight key="r" />,
                  'text.editor.alignRight',
                  'text.editor.alignRightAria',
                ],
              ] as const
            ).map(([align, icon, titleKey, ariaKey]) => (
              <Button
                key={align}
                variant={activeParagraph?.style?.textAlign === align ? 'secondary' : 'ghost'}
                size="icon-xs"
                title={t(titleKey)}
                aria-label={t(ariaKey, { index: active + 1 })}
                aria-pressed={activeParagraph?.style?.textAlign === align}
                onClick={() =>
                  changeParagraphs((current) =>
                    setParagraphStyle(current, active, { textAlign: align }),
                  )
                }
              >
                {icon}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                title={t('text.editor.duplicateParagraph')}
                aria-label={t('text.editor.duplicateParagraphAria', { index: active + 1 })}
                onClick={() => changeParagraphs((current) => duplicateParagraph(current, active))}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t('text.editor.moveParagraphUp')}
                aria-label={t('text.editor.moveParagraphUpAria', { index: active + 1 })}
                disabled={active === 0}
                onClick={() => changeParagraphs((current) => moveParagraph(current, active, -1))}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t('text.editor.moveParagraphDown')}
                aria-label={t('text.editor.moveParagraphDownAria', { index: active + 1 })}
                disabled={active === paragraphs.length - 1}
                onClick={() => changeParagraphs((current) => moveParagraph(current, active, 1))}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t('text.editor.removeParagraph')}
                aria-label={t('text.editor.removeParagraphAria', { index: active + 1 })}
                disabled={paragraphs.length <= 1}
                onClick={() => changeParagraphs((current) => removeParagraph(current, active))}
              >
                <Trash2 />
              </Button>
            </div>
          </header>

          <div ref={runListRef} className="mt-2 flex flex-col gap-2">
            {(activeParagraph?.runs ?? []).map((run, r) => (
              <RunEditor
                key={r}
                position={r + 1}
                run={run}
                fontListId="rdlc-font-families"
                canRemove={(activeParagraph?.runs.length ?? 0) > 1}
                canMoveUp={r > 0}
                canMoveDown={r < (activeParagraph?.runs.length ?? 0) - 1}
                onValue={(value) =>
                  changeParagraphs(
                    (current) => updateRun(current, active, r, { value }),
                    `run:${active}:${r}:value`,
                  )
                }
                onLabel={(label) =>
                  changeParagraphs(
                    (current) =>
                      updateRun(current, active, r, { label: label === '' ? undefined : label }),
                    `run:${active}:${r}:label`,
                  )
                }
                onStyle={(patch) =>
                  changeParagraphs((current) => setRunStyle(current, active, r, patch))
                }
                onToggleKind={() =>
                  changeParagraphs((current) => toggleRunKind(current, active, r))
                }
                onDuplicate={() => changeParagraphs((current) => duplicateRun(current, active, r))}
                onMove={(delta) =>
                  changeParagraphs((current) => moveRun(current, active, r, delta))
                }
                onRemove={() => changeParagraphs((current) => removeRun(current, active, r))}
                valueRef={(handle) => {
                  if (handle) valueEditorsRef.current.set(r, handle);
                  else valueEditorsRef.current.delete(r);
                }}
              />
            ))}
          </div>

          {/* Al final de la lista: el run nuevo aparece justo encima. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              onClick={() => changeParagraphs((current) => addRun(current, active, 'text'))}
            >
              <Type /> {t('text.editor.addText')}
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => changeParagraphs((current) => addRun(current, active, 'expression'))}
            >
              <Sigma /> {t('text.editor.addExpression')}
            </Button>
          </div>
        </section>

        <Button variant="outline" size="xs" className="self-start" onClick={addParagraph}>
          <Plus /> {t('text.editor.addParagraph')}
        </Button>
      </DialogBody>

      <DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-transparent p-4">
        <span className="text-xs text-muted-foreground sm:mr-auto sm:self-center">
          {t('text.editor.applyHint')}
        </span>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button title={t('text.editor.applyTitle')} onClick={() => onApply(paragraphs)}>
          {t('text.dialog.apply')}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Lo que se ve del textarea (su propio texto es transparente): un bloque por
 * línea, como el textarea parte las líneas, y los marcadores `⟨…⟩` que serán
 * runs como chips con los `⟨ ⟩` transparentes (ocupan su ancho: el caret no se
 * desfasa). `activeLine` tiñe la línea del párrafo activo; `null` = sin tinte
 * (con un solo párrafo no aporta nada).
 */
function DocumentHighlights({
  text,
  activeLine,
}: {
  text: string;
  activeLine: number | null;
}): ReactNode {
  return text.split('\n').map((line, index) => (
    <div key={index} className={cn(index === activeLine && '-mx-2 bg-muted px-2')}>
      {line === ''
        ? // Una línea vacía también ocupa su alto en el textarea.
          '​'
        : splitMarkers(line).map((segment, s) =>
            segment.marker ? (
              <mark
                key={s}
                className="rounded-[3px] bg-ring/15 text-foreground ring-1 ring-ring/40 box-decoration-clone"
              >
                <span className="text-transparent">{EXPRESSION_OPEN}</span>
                {segment.text.slice(EXPRESSION_OPEN.length, -EXPRESSION_CLOSE.length)}
                <span className="text-transparent">{EXPRESSION_CLOSE}</span>
              </mark>
            ) : (
              <span key={s}>{segment.text}</span>
            ),
          )}
    </div>
  ));
}

/** Copia profunda de los párrafos (el borrador no comparte referencias). */
function clone(paragraphs: ParagraphDto[]): ParagraphDto[] {
  return paragraphs.map((paragraph) => ({
    runs: paragraph.runs.map((run) => ({
      ...run,
      style: run.style ? { ...run.style } : undefined,
    })),
    style: paragraph.style ? { ...paragraph.style } : undefined,
  }));
}
