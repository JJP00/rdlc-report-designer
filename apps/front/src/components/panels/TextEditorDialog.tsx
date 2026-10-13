import type { ParagraphDto, TextboxDto } from '@rdlc-designer/contracts';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Sigma,
  Trash2,
  Type,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
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
  EXPRESSION_CLOSE,
  EXPRESSION_OPEN,
  addRun,
  duplicateParagraph,
  duplicateRun,
  moveParagraph,
  moveRun,
  paragraphIndexAt,
  paragraphsToText,
  removeParagraph,
  removeRun,
  setParagraphStyle,
  setRunStyle,
  textToParagraphs,
  toggleRunKind,
  updateRun,
} from '@/lib/textEditor';
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
 * línea y las expresiones entre marcadores `⟨=…⟩`) y, debajo, el bloque del
 * párrafo en el que está el cursor (runs con su formato). El borrador se monta
 * **al abrir** y se aplica de una vez (`setParagraphs`, un solo undo).
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
      <ResizableDialogContent className="max-h-[90vh] w-full max-w-4xl gap-0 p-0 sm:max-w-4xl">
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
  // Borrador propio: se monta con el textbox abierto (nada de resincronizar).
  const [paragraphs, setParagraphs] = useState<ParagraphDto[]>(() => clone(item.paragraphs));
  const [text, setText] = useState<string>(() => paragraphsToText(item.paragraphs));
  /** Párrafo en el que está el cursor (el bloque de abajo). */
  const [active, setActive] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fonts = useAvailableFonts();

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

  /** El textarea manda: reconstruye los párrafos conservando formato/etiqueta. */
  const changeText = (next: string): void => {
    setText(next);
    setParagraphs((current) => textToParagraphs(next, current));
  };

  /** Un cambio del bloque inferior se refleja en el textarea. */
  const changeParagraphs = (update: (current: ParagraphDto[]) => ParagraphDto[]): void => {
    const next = update(paragraphs);
    setParagraphs(next);
    setText(paragraphsToText(next));
    setActive((current) => Math.max(0, Math.min(current, next.length - 1)));
  };

  /** Cursor del textarea → párrafo activo. */
  const syncActive = (): void => {
    const area = textareaRef.current;
    if (area) setActive(paragraphIndexAt(text, area.selectionStart));
  };

  /** Inserta un marcador de expresión vacío en la posición del cursor. */
  const insertExpression = (): void => {
    const area = textareaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const marker = `${EXPRESSION_OPEN}=${EXPRESSION_CLOSE}`;
    const next = text.slice(0, start) + marker + text.slice(end);
    changeText(next);
    const caret = start + EXPRESSION_OPEN.length + 1;
    setActive(paragraphIndexAt(next, caret));
    focusCaret(caret);
  };

  const addParagraph = (): void => {
    const next = [...paragraphs, { runs: [{ value: '' }] }];
    const nextText = paragraphsToText(next);
    setParagraphs(next);
    setText(nextText);
    setActive(next.length - 1);
    focusCaret(nextText.length);
  };

  return (
    <>
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>Texto de {item.id}</DialogTitle>
          <Badge variant="outline">
            {paragraphs.length} párr. · {runCount} fragmento(s)
          </Badge>
        </div>
        <DialogDescription>
          Escribe el texto (Enter = párrafo nuevo) y las expresiones como{' '}
          <code>
            {EXPRESSION_OPEN}=Fields!X.Value{EXPRESSION_CLOSE}
          </code>
          . El bloque de abajo edita los fragmentos del párrafo donde tienes el cursor.
        </DialogDescription>
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
        {/* Formato del párrafo activo + insertar expresión en el cursor. */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 px-2 py-1.5">
          <span className="mr-1 text-xs font-semibold">Párrafo {active + 1}</span>
          {(
            [
              ['Left', <AlignLeft key="l" />, 'Alinear izquierda'],
              ['Center', <AlignCenter key="c" />, 'Centrar'],
              ['Right', <AlignRight key="r" />, 'Alinear derecha'],
            ] as const
          ).map(([align, icon, title]) => (
            <Button
              key={align}
              variant={activeParagraph?.style?.textAlign === align ? 'secondary' : 'ghost'}
              size="icon-xs"
              title={title}
              aria-label={`${title} (párrafo ${active + 1})`}
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
              title="Duplicar párrafo"
              aria-label={`Duplicar párrafo ${active + 1}`}
              onClick={() => changeParagraphs((current) => duplicateParagraph(current, active))}
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Subir párrafo"
              aria-label={`Subir párrafo ${active + 1}`}
              disabled={active === 0}
              onClick={() => changeParagraphs((current) => moveParagraph(current, active, -1))}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Bajar párrafo"
              aria-label={`Bajar párrafo ${active + 1}`}
              disabled={active === paragraphs.length - 1}
              onClick={() => changeParagraphs((current) => moveParagraph(current, active, 1))}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Eliminar párrafo"
              aria-label={`Eliminar párrafo ${active + 1}`}
              disabled={paragraphs.length <= 1}
              onClick={() => changeParagraphs((current) => removeParagraph(current, active))}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          aria-label="Texto del textbox"
          spellCheck={false}
          className="min-h-[180px] w-full resize-y rounded-md border bg-background p-2 font-mono text-xs leading-5"
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onClick={syncActive}
          onKeyUp={syncActive}
          onSelect={syncActive}
        />

        {/* Bloque del párrafo activo: sus runs y su formato. */}
        <section className="rounded-lg border bg-muted/20 p-2">
          <header className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-semibold">
              Párrafo {active + 1} · {activeParagraph?.runs.length ?? 0} fragmento(s)
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => changeParagraphs((current) => addRun(current, active, 'text'))}
              >
                <Type /> Añadir texto
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => changeParagraphs((current) => addRun(current, active, 'expression'))}
              >
                <Sigma /> Añadir expresión
              </Button>
              <Button variant="outline" size="xs" onClick={insertExpression}>
                <Sigma /> Insertar en el cursor
              </Button>
            </div>
          </header>

          <div className="mt-2 flex flex-col gap-2">
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
                  changeParagraphs((current) => updateRun(current, active, r, { value }))
                }
                onLabel={(label) =>
                  changeParagraphs((current) =>
                    updateRun(current, active, r, { label: label === '' ? undefined : label }),
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
              />
            ))}
          </div>
        </section>

        <Button variant="outline" size="xs" className="self-start" onClick={addParagraph}>
          <Plus /> Añadir párrafo
        </Button>
      </DialogBody>

      <DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-transparent p-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button title="Aplicar (Ctrl+Intro)" onClick={() => onApply(paragraphs)}>
          Aplicar
        </Button>
      </DialogFooter>
    </>
  );
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
