import type { ParagraphDto, StyleDto, StylePatch, TextRunDto } from '@rdlc-designer/contracts';

/**
 * Helpers del editor de texto del Textbox (párrafos → runs). Todas las
 * operaciones son **inmutables** y devuelven la lista nueva; las que no tienen
 * efecto (p. ej. borrar el último run de un párrafo) devuelven la misma lista,
 * porque el XSD exige al menos un párrafo con un TextRun.
 */

/** Un textbox es "simple" cuando se edita inline: un párrafo con un run. */
export function isSimpleText(paragraphs: ParagraphDto[]): boolean {
  return paragraphs.length <= 1 && (paragraphs[0]?.runs.length ?? 0) <= 1;
}

export function isExpressionRun(run: TextRunDto): boolean {
  return run.value.trimStart().startsWith('=');
}

/** Run nuevo, heredando el formato del vecino para que nazca con su aspecto. */
export function newRun(kind: 'text' | 'expression', neighbor?: TextRunDto): TextRunDto {
  const run: TextRunDto = { value: kind === 'expression' ? '=' : '' };
  if (neighbor?.style) run.style = { ...neighbor.style };
  return run;
}

/* ------------------------------ runs ------------------------------------ */

export function updateRun(
  paragraphs: ParagraphDto[],
  p: number,
  r: number,
  patch: Partial<TextRunDto>,
): ParagraphDto[] {
  return paragraphs.map((paragraph, index) =>
    index !== p
      ? paragraph
      : {
          ...paragraph,
          runs: paragraph.runs.map((run, runIndex) =>
            runIndex !== r ? run : { ...run, ...patch },
          ),
        },
  );
}

/** Estilo por run, fusionado con el que ya tuviera (`''`/null = heredar). */
export function setRunStyle(
  paragraphs: ParagraphDto[],
  p: number,
  r: number,
  patch: StylePatch,
): ParagraphDto[] {
  const run = paragraphs[p]?.runs[r];
  if (!run) return paragraphs;
  return updateRun(paragraphs, p, r, { style: mergeStyle(run.style, patch) });
}

export function setParagraphStyle(
  paragraphs: ParagraphDto[],
  p: number,
  patch: StylePatch,
): ParagraphDto[] {
  return paragraphs.map((paragraph, index) =>
    index !== p ? paragraph : { ...paragraph, style: mergeStyle(paragraph.style, patch) },
  );
}

/**
 * Fusiona un parche en el estilo del nivel. Un valor `null` o cadena vacía
 * **quita** la propiedad (heredar del nivel superior): es lo que hace la opción
 * "(heredada)" de los controles de fuente.
 */
function mergeStyle(style: StyleDto | undefined, patch: StylePatch): StyleDto | undefined {
  const next: Record<string, unknown> = { ...style };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return Object.keys(next).length > 0 ? (next as StyleDto) : undefined;
}

export function addRun(
  paragraphs: ParagraphDto[],
  p: number,
  kind: 'text' | 'expression',
): ParagraphDto[] {
  const paragraph = paragraphs[p];
  if (!paragraph) return paragraphs;
  const last = paragraph.runs[paragraph.runs.length - 1];
  return paragraphs.map((item, index) =>
    index !== p ? item : { ...item, runs: [...item.runs, newRun(kind, last)] },
  );
}

export function duplicateRun(paragraphs: ParagraphDto[], p: number, r: number): ParagraphDto[] {
  const run = paragraphs[p]?.runs[r];
  if (!run) return paragraphs;
  return paragraphs.map((paragraph, index) =>
    index !== p
      ? paragraph
      : {
          ...paragraph,
          runs: [
            ...paragraph.runs.slice(0, r + 1),
            { ...run, style: run.style ? { ...run.style } : undefined },
            ...paragraph.runs.slice(r + 1),
          ],
        },
  );
}

export function removeRun(paragraphs: ParagraphDto[], p: number, r: number): ParagraphDto[] {
  const runs = paragraphs[p]?.runs ?? [];
  if (runs.length <= 1) return paragraphs;
  return paragraphs.map((paragraph, index) =>
    index !== p ? paragraph : { ...paragraph, runs: runs.filter((_, runIndex) => runIndex !== r) },
  );
}

/** Mueve el run una posición (`delta` ±1) dentro de su párrafo. */
export function moveRun(
  paragraphs: ParagraphDto[],
  p: number,
  r: number,
  delta: number,
): ParagraphDto[] {
  const runs = paragraphs[p]?.runs ?? [];
  const to = r + delta;
  if (to < 0 || to >= runs.length) return paragraphs;
  return paragraphs.map((paragraph, index) => {
    if (index !== p) return paragraph;
    const next = [...runs];
    const [moved] = next.splice(r, 1);
    next.splice(to, 0, moved!);
    return { ...paragraph, runs: next };
  });
}

/** Alterna texto ↔ expresión (`=…`). El valor se conserva (con o sin `=`). */
export function toggleRunKind(paragraphs: ParagraphDto[], p: number, r: number): ParagraphDto[] {
  const run = paragraphs[p]?.runs[r];
  if (!run) return paragraphs;
  const expression = isExpressionRun(run);
  const value = expression ? run.value.trimStart().slice(1) : `=${run.value}`;
  return updateRun(paragraphs, p, r, { value });
}

/* ---------------------------- párrafos ---------------------------------- */

export function addParagraph(paragraphs: ParagraphDto[]): ParagraphDto[] {
  const last = paragraphs[paragraphs.length - 1];
  return [...paragraphs, { runs: [newRun('text', last?.runs[last.runs.length - 1])] }];
}

export function duplicateParagraph(paragraphs: ParagraphDto[], p: number): ParagraphDto[] {
  const paragraph = paragraphs[p];
  if (!paragraph) return paragraphs;
  const clone: ParagraphDto = {
    runs: paragraph.runs.map((run) => ({
      ...run,
      style: run.style ? { ...run.style } : undefined,
    })),
    style: paragraph.style ? { ...paragraph.style } : undefined,
  };
  return [...paragraphs.slice(0, p + 1), clone, ...paragraphs.slice(p + 1)];
}

export function removeParagraph(paragraphs: ParagraphDto[], p: number): ParagraphDto[] {
  if (paragraphs.length <= 1) return paragraphs;
  return paragraphs.filter((_, index) => index !== p);
}

export function moveParagraph(
  paragraphs: ParagraphDto[],
  p: number,
  delta: number,
): ParagraphDto[] {
  const to = p + delta;
  if (to < 0 || to >= paragraphs.length) return paragraphs;
  const next = [...paragraphs];
  const [moved] = next.splice(p, 1);
  next.splice(to, 0, moved!);
  return next;
}

/* ------------------------ documento ↔ texto ----------------------------- */

/**
 * Marcadores en el textarea: `⟨BTCMyCompanyName⟩` (la etiqueta de BC del run) o
 * `⟨=Code.GetData(13, 1)⟩` si no tiene. Los ángulos son improbables en el texto
 * de un informe (los corchetes sí se usan en las etiquetas de BC).
 */
export const EXPRESSION_OPEN = '⟨';
export const EXPRESSION_CLOSE = '⟩';

/**
 * Texto del textarea: un párrafo por línea; las expresiones entre marcadores y
 * con su **etiqueta** cuando la tienen (lo que muestra BC/RB).
 */
export function paragraphsToText(paragraphs: ParagraphDto[]): string {
  return paragraphs
    .map((paragraph) =>
      paragraph.runs
        .map((run) => {
          if (!isExpressionRun(run)) return run.value;
          const inside = run.label !== undefined && run.label !== '' ? run.label : run.value;
          return `${EXPRESSION_OPEN}${inside}${EXPRESSION_CLOSE}`;
        })
        .join(''),
    )
    .join('\n');
}

/**
 * Párrafos a partir del texto del textarea. Un marcador puede llevar la
 * **etiqueta** del run (`⟨BTCMyCompanyName⟩`) o su expresión
 * (`⟨=Code.GetData(13, 1)⟩`); al coincidir con un run del párrafo anterior se
 * conservan su expresión, su etiqueta y su formato (por consumo en orden). Un
 * marcador nuevo con `=` nace como expresión; sin `=` y sin coincidencia, como
 * texto. Los runs nuevos heredan el formato del run anterior del párrafo.
 */
export function textToParagraphs(text: string, previous: ParagraphDto[]): ParagraphDto[] {
  return text.split('\n').map((line, index) => {
    const available = [...(previous[index]?.runs ?? [])];
    const runs: TextRunDto[] = [];

    const neighborStyle = (): { style?: TextRunDto['style'] } => {
      const neighbor = runs[runs.length - 1];
      return neighbor?.style ? { style: { ...neighbor.style } } : {};
    };

    const plain = (value: string): TextRunDto => {
      const at = available.findIndex((run) => !isExpressionRun(run) && run.value === value);
      const match = at === -1 ? undefined : available.splice(at, 1)[0];
      if (match) return { ...match, ...(match.style ? { style: { ...match.style } } : {}) };
      return { value, ...neighborStyle() };
    };

    const marked = (content: string): TextRunDto => {
      const at = available.findIndex(
        (run) => run.label === content || (isExpressionRun(run) && run.value === content),
      );
      const match = at === -1 ? undefined : available.splice(at, 1)[0];
      if (match) return { ...match, ...(match.style ? { style: { ...match.style } } : {}) };
      // Marcador nuevo: expresión si empieza por `=`; si no, texto (un
      // `⟨algo⟩` que no es expresión ni etiqueta conocida no es un run válido).
      if (content.trimStart().startsWith('=')) return { value: content, ...neighborStyle() };
      return { value: content, ...neighborStyle() };
    };

    let cursor = 0;
    while (cursor < line.length) {
      const open = line.indexOf(EXPRESSION_OPEN, cursor);
      if (open === -1) break;
      const close = line.indexOf(EXPRESSION_CLOSE, open + 1);
      if (close === -1) break;

      const before = line.slice(cursor, open);
      if (before !== '') runs.push(plain(before));
      const inside = line.slice(open + EXPRESSION_OPEN.length, close);
      if (inside.trim() !== '') runs.push(marked(inside));
      cursor = close + EXPRESSION_CLOSE.length;
    }
    const tail = line.slice(cursor);
    if (tail !== '' || runs.length === 0) runs.push(plain(tail));

    return { runs };
  });
}

/** Índice de la línea (párrafo) del caret en el textarea. */
export function paragraphIndexAt(text: string, caret: number): number {
  const position = Math.max(0, Math.min(caret, text.length));
  return text.slice(0, position).split('\n').length - 1;
}
