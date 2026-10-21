import type {
  BorderSide,
  BorderSides,
  BorderSidesPatch,
  RdlcCommand,
  StyleDto,
  StylePatch,
} from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical, readLength, writeLength } from '../geometry/geometry.js';
import { formatLength, parseLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';

export type SetStyleCommand = Extract<RdlcCommand, { cmd: 'setStyle' }>;

/** Nodo quitado por un parche `null`, con su contenedor y sitio exactos. */
interface RemovedStyleNode {
  /** Contenedor del nodo (el `<Style>` o un borde por lado). */
  style: RdlcNode;
  node: RdlcNode;
  index: number;
}

/** Lados del padding: el contrato usa un objeto anidado (`padding.left`). */
const PADDING_SIDES = [
  { key: 'top', tag: 'PaddingTop' },
  { key: 'left', tag: 'PaddingLeft' },
  { key: 'bottom', tag: 'PaddingBottom' },
  { key: 'right', tag: 'PaddingRight' },
] as const;

/** Bordes por lado: tag del override en `<Style>` (el genérico es `<Border>`). */
const BORDER_SIDES = [
  { key: 'top', tag: 'TopBorder' },
  { key: 'left', tag: 'LeftBorder' },
  { key: 'bottom', tag: 'BottomBorder' },
  { key: 'right', tag: 'RightBorder' },
] as const;

const BORDER_STYLES = new Set(['None', 'Solid', 'Dashed', 'Dotted', 'Double']);

const SIMPLE_TAGS: Record<string, string> = {
  fontFamily: 'FontFamily',
  fontWeight: 'FontWeight',
  fontStyle: 'FontStyle',
  textDecoration: 'TextDecoration',
  color: 'Color',
  backgroundColor: 'BackgroundColor',
  textAlign: 'TextAlign',
  verticalAlign: 'VerticalAlign',
  format: 'Format',
};

/** Claves del parche soportadas por este comando (el resto se rechaza). */
const SUPPORTED_KEYS = new Set<string>([
  ...Object.keys(SIMPLE_TAGS),
  'fontSize',
  'padding',
  'border',
  // `ListStyle` no vive en `<Style>`: es hijo directo de `<Paragraph>`.
  'listStyle',
]);

/**
 * Estilo del item (`<Style>` del Textbox/Rectangle/…): fuente, colores,
 * alineación, padding, viñetas… Solo se escriben los campos presentes en el
 * parche; el inverso guarda los valores anteriores de esos mismos campos.
 *
 * Precedencia RDL: run > párrafo > item. Escribir en el item no basta si un
 * párrafo o un run ya declara esa propiedad (lo sombrea), así que el comando
 * **quita los overrides equivalentes** de los niveles inferiores. Sin eso el
 * cambio se vería en el diseñador pero BC lo ignoraría.
 *
 * `Format` es la excepción: BC lo escribe en los **runs**, no en el item
 * (ver `applyFormat`). `TextAlign` tiene la suya: BC lo escribe **y solo lo lee
 * en los párrafos** — en el `<Style>` del item lo ignora (ver `writeTextAlign`).
 */
export function applySetStyle(
  ctx: CommandContext,
  command: SetStyleCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.of('itemMissing', { id: command.id }));

  const unsupported = Object.keys(command.style).filter((key) => !SUPPORTED_KEYS.has(key));
  if (unsupported.length > 0) {
    return left(
      CommandRejectedError.of('styleUnsupported', { properties: unsupported.join(', ') }),
    );
  }

  // `ListStyle` no es una propiedad de `<Style>`: se escribe como hijo directo
  // de cada `<Paragraph>` (donde lo espera el XSD). `Format` (F1 · formato
  // numérico) tampoco sigue la vía genérica del item: BC lo escribe en el
  // `<Style>` de cada run (ver `applyFormat`). `TextAlign` va a los párrafos
  // (ver `writeTextAlign`). Se separan antes de tocar nada.
  const { listStyle, format, textAlign, ...stylePatch } = command.style as StylePatch & {
    listStyle?: 'None' | 'Bulleted' | 'Numbered' | null;
  };
  const runs = textRuns(node);

  // El `<Style>` del item solo se crea si algo lo necesita: un `format` que va
  // a los runs no debe dejar un `<Style />` vacío en el fichero.
  const styleExisted = node.child('Style') !== undefined;
  let style = node.child('Style');
  if (Object.keys(stylePatch).length > 0 && !style) style = childOrCreate(node, 'Style');

  // Índices prístinos compartidos por todos los borrados del comando.
  const indexesOf = createOriginalIndexes();
  const { previous, removed, changes } = style
    ? writeStylePatch(style, stylePatch, indexesOf)
    : {
        previous: {} as StylePatch,
        removed: [] as RemovedStyleNode[],
        changes: [] as DomainCommand[],
      };
  if (listStyle !== undefined) writeListStyle(node, listStyle, changes, removed, indexesOf);

  if (textAlign !== undefined) {
    writeTextAlign(node, textAlign, changes, removed, indexesOf);
    // El fallback sin párrafos pudo crear el `<Style>` del item.
    style ??= node.child('Style');
  }

  const restored = syncShadowingStyles(node, stylePatch);

  if (format !== undefined) {
    if (format === null || format === '') {
      // «General»: quitar el tag de los runs no basta si un párrafo o el item
      // lo declaran (run > párrafo > item): se limpian los tres niveles.
      clearFormat(node, removed, indexesOf);
    } else {
      restored.push(...applyFormat(node, runs, format, style));
      // `applyFormat` crea el `<Style>` del item en el fallback sin runs.
      style ??= node.child('Style');
    }
  }

  // Los nodos quitados se reinsertan en su índice exacto (el orden canónico no
  // tiene por qué coincidir con el del fichero original). Se listan de mayor a
  // menor índice porque el journal aplica los inversos al revés.
  const reinsert = [...removed]
    .sort((a, b) => b.index - a.index)
    .map((entry) => ({
      cmd: 'restoreNode' as const,
      node: entry.node,
      container: entry.style,
      index: entry.index,
      name: entry.node.tagName,
    }));

  // Con overrides, `ListStyle`, `TextAlign` o `format` tocados el front
  // necesita la proyección nueva (párrafos y runs no viajan en `applied`).
  const needsSnapshot =
    restored.length > 0 ||
    listStyle !== undefined ||
    format !== undefined ||
    textAlign !== undefined;

  return right({
    // Orden de los inversos: el journal los aplica al revés, así que el último
    // es el primero en deshacerse. Si el comando creó el `<Style>` (el item no
    // lo tenía), al final del undo se quita para volver a los bytes originales.
    //
    // `setStyle(previous)` va **después** de `restored` en la lista y, por
    // tanto, se aplica antes al deshacer: primero vuelve el estilo del item (con
    // su sincronización de overrides a los valores previos) y luego los
    // overrides originales de párrafos y runs, que quedan byte a byte como
    // estaban. Al revés, la sincronización del `setStyle` inverso pisaría el
    // override restaurado (p. ej. el run a 8pt volvía a 10pt).
    inverse: [
      ...(style && !styleExisted ? [{ cmd: 'removeNode', node: style } as const] : []),
      ...reinsert,
      ...restored,
      { cmd: 'setStyle', id: command.id, style: previous },
      ...changes,
    ],
    // El item no se toca cuando el formato va a los runs: `applied` no puede
    // expresar el resultado, pero el front refresca la proyección.
    applied: [{ id: command.id, values: style ? { style: readStyle(style) } : {} }],
    ...(needsSnapshot ? { snapshotOut: true } : {}),
  });
}

/* --------------------------- escritura ---------------------------------- */

/** Índices originales (prístinos) de los hijos de un contenedor, cacheados. */
type OriginalIndexes = (parent: RdlcNode) => Map<string, number>;

function createOriginalIndexes(): OriginalIndexes {
  // Los envoltorios `RdlcNode` no tienen identidad estable (cada `child()`
  // devuelve uno nuevo sobre el mismo elemento): el contenedor se localiza por
  // `equals`, que compara el nodo del documento.
  const entries: { container: RdlcNode; map: Map<string, number> }[] = [];
  return (parent) => {
    const found = entries.find((entry) => entry.container.equals(parent));
    if (found) return found.map;

    const map = new Map<string, number>();
    parent.children().forEach((child, index) => {
      if (!map.has(child.tagName)) map.set(child.tagName, index);
    });
    entries.push({ container: parent, map });
    return map;
  };
}

/**
 * Aplica un parche al `<Style>`. Devuelve:
 * - `previous`: valores anteriores de los campos que **existían** (para el
 *   inverso; `null` = el tag no existía).
 * - `removed`: nodos borrados por un valor `null`, con su índice, para poder
 *   reinsertarlos tal cual (quitar y volver a crear perdería el orden original).
 *
 * `indexesOf` se comparte con quien quite más nodos del mismo contenedor en el
 * mismo comando (p. ej. `writeListStyle`): los índices deben ser los **de antes
 * de cualquier borrado**, no los vivos (que se van desplazando).
 */
export function writeStylePatch(
  style: RdlcNode,
  patch: StylePatch,
  indexesOf: OriginalIndexes = createOriginalIndexes(),
): { previous: StylePatch; removed: RemovedStyleNode[]; changes: DomainCommand[] } {
  const previous: StylePatch = {};
  const removed: RemovedStyleNode[] = [];
  const changes: DomainCommand[] = [];

  const removeTag = (parent: RdlcNode, tag: string): void => {
    removeTagNode(parent, tag, removed, indexesOf);
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (key === 'padding') {
      const sides = (value ?? {}) as Record<string, Length | null | undefined>;
      const prevPadding: Record<string, Length | null> = {};
      for (const side of PADDING_SIDES) {
        const sideValue = value === null ? null : sides[side.key];
        if (sideValue === undefined) continue;
        if (sideValue === null) {
          removeTag(style, side.tag);
          continue;
        }
        prevPadding[side.key] = readLength(style, side.tag) ?? null;
        writeLength(style, side.tag, sideValue);
      }
      if (Object.keys(prevPadding).length > 0) {
        previous.padding = prevPadding as StylePatch['padding'];
      }
      continue;
    }

    if (key === 'border') {
      writeBorderPatch(style, value as BorderSidesPatch | null, changes, removeTag);
      continue;
    }

    const tag = SIMPLE_TAGS[key] ?? (key === 'fontSize' ? 'FontSize' : undefined);
    if (!tag) continue;

    if (value === null) {
      removeTag(style, tag);
      continue;
    }

    if (key === 'fontSize') {
      previous.fontSize = readLength(style, 'FontSize') ?? null;
      writeLength(style, 'FontSize', value as Length);
      continue;
    }

    (previous as Record<string, unknown>)[key] = style.child(tag)?.text() ?? null;
    setChildText(style, tag, String(value));
  }

  return { previous, removed, changes };
}

/**
 * Quita el tag del contenedor recordando el nodo y su índice **prístino** (el
 * vivo se desplaza con cada borrado anterior del mismo contenedor): el undo lo
 * reinserta en su sitio exacto y los bytes cuadran.
 */
function removeTagNode(
  parent: RdlcNode,
  tag: string,
  removed: RemovedStyleNode[],
  indexesOf: OriginalIndexes,
): void {
  const child = parent.child(tag);
  const index = indexesOf(parent).get(tag);
  if (!child || index === undefined) return;
  child.remove();
  removed.push({ style: parent, node: child, index });
}

/**
 * Bordes: `null` quita toda la declaración (genérico + lados); un lado a
 * `null` quita su override (el genérico vuelve a aplicar). El parche de un lado
 * escribe `Style` (obligatorio en el contrato) y, **si vienen**, `Color`/
 * `Width`; lo no enviado no se toca: cambiar solo el estilo no borra el grosor
 * del corpus. Inversos explícitos → undo byte-exacto.
 */
function writeBorderPatch(
  style: RdlcNode,
  patch: BorderSidesPatch | null,
  changes: DomainCommand[],
  removeTag: (parent: RdlcNode, tag: string) => void,
): void {
  if (patch === null) {
    for (const tag of ['Border', 'TopBorder', 'BottomBorder', 'LeftBorder', 'RightBorder']) {
      removeTag(style, tag);
    }
    return;
  }

  for (const side of BORDER_SIDES) {
    const sideValue = patch[side.key];
    if (sideValue === undefined) continue;
    if (sideValue === null) {
      removeTag(style, side.tag);
      continue;
    }

    let node = style.child(side.tag);
    if (!node) {
      node = style.createElement(side.tag);
      insertCanonical(style, side.tag, node);
      changes.push({ cmd: 'removeNode', node });
    }
    writeBorderSide(node, sideValue, changes);
  }
}

/** Contenido de un borde (`Style` obligatorio; `Color`/`Width` opcionales). */
function writeBorderSide(node: RdlcNode, side: BorderSide, changes: DomainCommand[]): void {
  writeBorderChild(node, 'Style', side.style, changes);
  if (side.color !== undefined) writeBorderChild(node, 'Color', side.color, changes);
  if (side.width !== undefined) {
    writeBorderChild(node, 'Width', formatLength(side.width), changes);
  }
}

function writeBorderChild(
  node: RdlcNode,
  tag: string,
  value: string,
  changes: DomainCommand[],
): void {
  const existing = node.child(tag);
  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === value) return;
    existing.setText(value);
    changes.push({ cmd: 'setNodeText', node: existing, value: previous });
    return;
  }
  const created = node.createElement(tag, value);
  insertCanonical(node, tag, created);
  changes.push({ cmd: 'removeNode', node: created });
}

function setChildText(style: RdlcNode, tagName: string, value: string): void {
  const existing = style.child(tagName);
  if (existing) {
    existing.setText(value);
    return;
  }
  insertCanonical(style, tagName, style.createElement(tagName, value));
}

/* --------------------- overrides de párrafos y runs --------------------- */

/**
 * Impide que los niveles inferiores sombreen el estilo del item: si un párrafo
 * o un run ya declara una de las propiedades del parche, se **reescribe con el
 * mismo valor** que el item.
 *
 * Se reescribe (no se quita) porque quitar y reinsertar un nodo perdería la
 * indentación original y rompería el undo byte-exacto; reescribir en el sitio sí
 * lo garantiza. El override redundante que queda en el XML es inofensivo: BC
 * renderiza el mismo valor y el siguiente `setStyle` lo vuelve a sincronizar.
 *
 * Devuelve los inversos (`setNodeText`: devuelve el texto anterior tal cual).
 */
function syncShadowingStyles(item: RdlcNode, patch: StylePatch): DomainCommand[] {
  const tags = shadowedTags(patch);
  if (tags.length === 0) return [];

  const itemStyle = item.child('Style');
  if (!itemStyle) return [];

  const inverse: DomainCommand[] = [];

  // Párrafos: se reescriben los overrides existentes de los tags del parche.
  for (const tag of tags) {
    const value = itemStyle.child(tag)?.text();
    if (value === undefined) continue;
    for (const style of paragraphStyles(item)) {
      inverse.push(...rewriteTag(style, tag, value));
    }
  }

  // Runs: los tags del parche se escriben/crean; además se materializan los
  // tags de texto que el item declara y el run hereda. RDL los hereda
  // (run > párrafo > item), pero BC los escribe en el run y RB los resuelve
  // ahí: sin esto, un textbox con la fuente solo en el item se ve a Arial 10.
  // Solo se rellenan los que falten, con el valor **efectivo** del párrafo, así
  // que lo que declara el run (formato mixto) no se toca.
  const patched = new Set(tags);
  for (const paragraph of item.child('Paragraphs')?.children('Paragraph') ?? []) {
    const paragraphStyle = paragraph.child('Style');
    for (const run of paragraph.child('TextRuns')?.children('TextRun') ?? []) {
      for (const tag of RUN_TEXT_TAGS) {
        const overridden = patched.has(tag);
        const inherited = !overridden && itemStyle.child(tag)?.text() !== undefined;
        if (!overridden && !inherited) continue;

        const value = overridden
          ? itemStyle.child(tag)?.text()
          : (paragraphStyle?.child(tag)?.text() ?? itemStyle.child(tag)?.text());
        if (value === undefined) continue;

        const existing = run.child('Style')?.child(tag);
        if (existing && !overridden) continue;
        const style = run.child('Style') ?? ensureStyle(run, inverse);
        inverse.push(...writeTag(style, tag, value));
      }
    }
  }

  return inverse;
}

/** Tags a limpiar en los niveles inferiores: solo las claves con valor. */
function shadowedTags(patch: StylePatch): string[] {
  const tags = new Set<string>();

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;

    if (key === 'padding') {
      for (const side of PADDING_SIDES) {
        if ((value as Record<string, unknown>)[side.key] !== undefined) tags.add(side.tag);
      }
      continue;
    }

    const tag = SIMPLE_TAGS[key] ?? (key === 'fontSize' ? 'FontSize' : undefined);
    if (tag) tags.add(tag);
  }

  return [...tags];
}

/**
 * Tags de texto que BC escribe en el **run** (y RB resuelve ahí, no en el
 * `<Style>` del item): un textbox con la fuente solo en el item se ve a Arial
 * 10 en Report Builder. Se replican en cada run al aplicar el estilo.
 *
 * `Format` **no** está aquí a propósito (aunque BC también lo escriba en el
 * run): este conjunto materializa en los runs lo que el item declara con
 * **cualquier** parche, y un cambio de fuente no debe copiar ni pisar el
 * formato (ni al revés: el item no declara `Format`, así que no hay nada que
 * materializar). El formato tiene reglas propias (`applyFormat`).
 */
const RUN_TEXT_TAGS = new Set([
  'FontFamily',
  'FontSize',
  'FontWeight',
  'FontStyle',
  'TextDecoration',
  'Color',
]);

/** `<Style>` de los párrafos del textbox. */
function paragraphStyles(item: RdlcNode): RdlcNode[] {
  const styles: RdlcNode[] = [];
  for (const paragraph of item.child('Paragraphs')?.children('Paragraph') ?? []) {
    const paragraphStyle = paragraph.child('Style');
    if (paragraphStyle) styles.push(paragraphStyle);
  }
  return styles;
}

/** Reescribe el tag si existe (no crea); devuelve los inversos. */
function rewriteTag(style: RdlcNode, tag: string, value: string): DomainCommand[] {
  const child = style.child(tag);
  if (!child || child.text() === value) return [];
  const inverse: DomainCommand[] = [{ cmd: 'setNodeText', node: child, value: child.text() ?? '' }];
  child.setText(value);
  return inverse;
}

/** Escribe el tag creándolo si falta (inverso: quitarlo). */
function writeTag(style: RdlcNode, tag: string, value: string): DomainCommand[] {
  const child = style.child(tag);
  if (child) return rewriteTag(style, tag, value);
  const created = style.createElement(tag, value);
  insertCanonical(style, tag, created);
  return [{ cmd: 'removeNode', node: created }];
}

/** `<Style>` del nodo (run o párrafo), creándolo si falta (inverso: quitarlo). */
function ensureStyle(parent: RdlcNode, inverse: DomainCommand[]): RdlcNode {
  const existing = parent.child('Style');
  if (existing) return existing;
  const style = parent.createElement('Style');
  insertCanonical(parent, 'Style', style);
  inverse.push({ cmd: 'removeNode', node: style });
  return style;
}

/* -------------------------------- Format --------------------------------- */

/**
 * `Format` (F1 · formato numérico/de fecha). BC lo escribe en el `<Style>` de
 * **cada `TextRun`**, no en el del item: RDL resuelve run > párrafo > item, así
 * que un formato escrito solo en el item quedaría sombreado por el run y BC lo
 * ignoraría (lo mismo que ya pasó con la fuente). Se escribe en todos los runs
 * con el valor tal cual (expresión incluida: aquí no se evalúa ni se valida
 * sintaxis .NET). El item se queda intacto.
 *
 * Un item **sin runs** (Rectangle, textbox vacío…) no tiene nivel inferior al
 * que escribir: el valor cae al `<Style>` del item para no perderlo en
 * silencio. Es el único caso en que `format` toca el item.
 */
function applyFormat(
  item: RdlcNode,
  runs: RdlcNode[],
  value: string,
  itemStyle: RdlcNode | undefined,
): DomainCommand[] {
  if (runs.length === 0) {
    const style = itemStyle ?? childOrCreate(item, 'Style');
    return writeTag(style, 'Format', value);
  }

  const inverse: DomainCommand[] = [];
  for (const run of runs) {
    const style = run.child('Style') ?? ensureStyle(run, inverse);
    inverse.push(...writeTag(style, 'Format', value));
  }
  return inverse;
}

/**
 * «General»: quita `<Format>` de los **tres** niveles (runs, párrafos e item).
 * Quitarlo solo de los runs no bastaría: un párrafo o el propio item que
 * declaren el tag lo heredarían los runs sin formato y la retirada no surtiría
 * efecto. Cada nodo se reinserta en su índice prístino al deshacer.
 */
function clearFormat(
  item: RdlcNode,
  removed: RemovedStyleNode[],
  indexesOf: OriginalIndexes,
): void {
  const itemStyle = item.child('Style');
  for (const style of [...(itemStyle ? [itemStyle] : []), ...paragraphAndRunStyles(item)]) {
    removeTagNode(style, 'Format', removed, indexesOf);
  }
}

/** Todos los `TextRun` del item (de todos sus párrafos, en orden). */
function textRuns(item: RdlcNode): RdlcNode[] {
  const runs: RdlcNode[] = [];
  for (const paragraph of item.child('Paragraphs')?.children('Paragraph') ?? []) {
    runs.push(...(paragraph.child('TextRuns')?.children('TextRun') ?? []));
  }
  return runs;
}

/* ------------------------------ ListStyle -------------------------------- */

/** `<Style>` de los párrafos del textbox y de sus runs (limpieza de legados). */
function paragraphAndRunStyles(item: RdlcNode): RdlcNode[] {
  const styles: RdlcNode[] = [];
  for (const paragraph of item.child('Paragraphs')?.children('Paragraph') ?? []) {
    const paragraphStyle = paragraph.child('Style');
    if (paragraphStyle) styles.push(paragraphStyle);
    for (const run of paragraph.child('TextRuns')?.children('TextRun') ?? []) {
      const runStyle = run.child('Style');
      if (runStyle) styles.push(runStyle);
    }
  }
  return styles;
}

/**
 * `ListStyle` de los párrafos (RDL 2016): es un **hijo directo de
 * `<Paragraph>`**, no una propiedad de `<Style>`. Un `null` quita la lista de
 * todos los párrafos. De paso limpia los `<ListStyle>` que una versión anterior
 * escribía dentro de un `<Style>`: no existen en el XSD y bloqueaban el
 * guardado (`RB`: «índice fuera de intervalo» / validación fallida).
 */
function writeListStyle(
  item: RdlcNode,
  value: 'None' | 'Bulleted' | 'Numbered' | null,
  changes: DomainCommand[],
  removed: RemovedStyleNode[],
  indexesOf: OriginalIndexes,
): void {
  const itemStyle = item.child('Style');
  for (const style of [...(itemStyle ? [itemStyle] : []), ...paragraphAndRunStyles(item)]) {
    const legacy = style.child('ListStyle');
    if (legacy) removeStyleChild(legacy, removed, indexesOf);
  }

  for (const paragraph of item.child('Paragraphs')?.children('Paragraph') ?? []) {
    const existing = paragraph.child('ListStyle');
    if (value === null) {
      if (existing) removeStyleChild(existing, removed, indexesOf);
      continue;
    }
    if (existing) {
      const previous = existing.text() ?? '';
      if (previous === value) continue;
      changes.push({ cmd: 'setNodeText', node: existing, value: previous });
      existing.setText(value);
      continue;
    }
    const created = paragraph.createElement('ListStyle', value);
    insertCanonical(paragraph, 'ListStyle', created);
    changes.push({ cmd: 'removeNode', node: created });
  }
}

/**
 * Quita un nodo guardando el contenedor y su índice **prístino** para el undo
 * (el vivo se desplaza con cada borrado anterior del mismo comando).
 */
function removeStyleChild(
  node: RdlcNode,
  removed: RemovedStyleNode[],
  indexesOf: OriginalIndexes,
): void {
  const container = node.parent;
  if (!container) return;
  const index = indexesOf(container).get(node.tagName) ?? 0;
  removed.push({ style: container, node, index });
  node.remove();
}

/* ------------------------------ TextAlign -------------------------------- */

/**
 * `TextAlign` de un textbox: BC lo escribe **solo en el `<Style>` de cada
 * `<Paragraph>`** y solo lo lee ahí — un `<TextAlign>` en el `<Style>` del item
 * lo ignora al renderizar (verificado con `CartaCMR.rdlc`: `TextBoxPrueba` solo
 * lo tenía en el item y no se alineaba). El comando lo escribe en **todos** los
 * párrafos, creando su `<Style>` si falta.
 *
 * Si el item ya declara `<TextAlign>` (legado del editor anterior, que escribía
 * en el item) se **sincroniza** al mismo valor — no se crea si no está, para no
 * ensuciar los ficheros de BC. `null` lo quita de los tres sitios: dejar un
 * override en el item lo resucitaría en el diseñador sin que BC lo pinte.
 *
 * Un item sin párrafos (Rectangle, textbox vacío…) cae al `<Style>` del item
 * para no perderlo en silencio, como el formato sin runs.
 */
function writeTextAlign(
  item: RdlcNode,
  value: NonNullable<StyleDto['textAlign']> | null,
  changes: DomainCommand[],
  removed: RemovedStyleNode[],
  indexesOf: OriginalIndexes,
): void {
  const paragraphs = item.child('Paragraphs')?.children('Paragraph') ?? [];
  if (paragraphs.length === 0) {
    const style = item.child('Style') ?? childOrCreate(item, 'Style');
    if (value === null) removeTagNode(style, 'TextAlign', removed, indexesOf);
    else changes.push(...writeTag(style, 'TextAlign', value));
    return;
  }

  for (const paragraph of paragraphs) {
    const style = paragraph.child('Style') ?? ensureStyle(paragraph, changes);
    if (value === null) removeTagNode(style, 'TextAlign', removed, indexesOf);
    else changes.push(...writeTag(style, 'TextAlign', value));
  }

  // Legado: `<TextAlign>` en el item → se sincroniza con el de los párrafos
  // (que es el que BC lee). Si el item no lo declara, no se crea.
  const itemStyle = item.child('Style');
  if (!itemStyle?.child('TextAlign')) return;
  if (value === null) removeTagNode(itemStyle, 'TextAlign', removed, indexesOf);
  else changes.push(...writeTag(itemStyle, 'TextAlign', value));
}

/* --------------------------- lectura ------------------------------------ */

/** Estilo completo del `<Style>` (lo que el front refleja tras el comando). */
export function readStyle(style: RdlcNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, tag] of Object.entries(SIMPLE_TAGS)) {
    const text = style.child(tag)?.text();
    if (text !== undefined) result[key] = text;
  }

  const fontSize = readLength(style, 'FontSize');
  if (fontSize) result.fontSize = fontSize;

  const padding: Record<string, unknown> = {};
  for (const side of PADDING_SIDES) {
    const length = readLength(style, side.tag);
    if (length) padding[side.key] = length;
  }
  if (Object.keys(padding).length > 0) result.padding = padding;

  const border = readBorder(style);
  if (border) result.border = border;

  return result;
}

/**
 * Bordes **resueltos por lado**: gana el override (`TopBorder`…) y, en su
 * defecto, el genérico (`Border`), fusión **propiedad a propiedad** (BC escribe
 * `<Border><Style>Solid</Style></Border>` + `<TopBorder><Width>1pt</Width></TopBorder>`).
 */
export function readBorder(style: RdlcNode): BorderSides | undefined {
  const generic = style.child('Border');
  const border: BorderSides = {};
  let any = false;

  for (const side of BORDER_SIDES) {
    const node = style.child(side.tag);
    if (!node && !generic) continue;

    const styleValue = node?.child('Style')?.text() ?? generic?.child('Style')?.text();
    const color = node?.child('Color')?.text() ?? generic?.child('Color')?.text();
    const width = parseLength(node?.child('Width')?.text() ?? generic?.child('Width')?.text());
    const resolvedStyle =
      styleValue !== undefined && BORDER_STYLES.has(styleValue) ? styleValue : undefined;
    if (resolvedStyle === undefined && color === undefined && width === undefined) continue;

    border[side.key] = {
      style: (resolvedStyle as BorderSide['style'] | undefined) ?? 'None',
      ...(color !== undefined ? { color } : {}),
      ...(width !== undefined ? { width } : {}),
    };
    any = true;
  }

  return any ? border : undefined;
}

/** Reexport para tests: longitud formateada tal cual se escribe en el XML. */
export const formatStyleLength = formatLength;
export const parseStyleLength = parseLength;
