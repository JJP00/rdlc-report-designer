import type { RdlcCommand, StylePatch } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical, readLength, writeLength } from '../geometry/geometry.js';
import { formatLength, parseLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';

export type SetStyleCommand = Extract<RdlcCommand, { cmd: 'setStyle' }>;

/** Nodo de `<Style>` quitado por un parche `null`, con su sitio exacto. */
interface RemovedStyleNode {
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

const SIMPLE_TAGS: Record<string, string> = {
  fontFamily: 'FontFamily',
  fontWeight: 'FontWeight',
  fontStyle: 'FontStyle',
  textDecoration: 'TextDecoration',
  color: 'Color',
  backgroundColor: 'BackgroundColor',
  textAlign: 'TextAlign',
  verticalAlign: 'VerticalAlign',
  listStyle: 'ListStyle',
  format: 'Format',
};

/** Claves del parche soportadas por este comando (el resto se rechaza). */
const SUPPORTED_KEYS = new Set<string>([
  ...Object.keys(SIMPLE_TAGS),
  'fontSize',
  'padding',
  // `border` está en el contrato pero aún no se escribe ni se proyecta.
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
 */
export function applySetStyle(
  ctx: CommandContext,
  command: SetStyleCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const unsupported = Object.keys(command.style).filter((key) => !SUPPORTED_KEYS.has(key));
  if (unsupported.length > 0) {
    return left(
      CommandRejectedError.create(`setStyle no soporta todavía: ${unsupported.join(', ')}`),
    );
  }

  const styleExisted = node.child('Style') !== undefined;
  const style = childOrCreate(node, 'Style');
  const { previous, removed } = writeStylePatch(style, command.style);

  const restored = syncShadowingStyles(node, command.style);

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

  return right({
    // Orden de los inversos: el journal los aplica al revés, así que el último
    // es el primero en deshacerse. Si el comando creó el `<Style>` (el item no
    // lo tenía), al final del undo se quita para volver a los bytes originales.
    inverse: [
      ...(styleExisted ? [] : [{ cmd: 'removeNode', node: style } as const]),
      ...reinsert,
      { cmd: 'setStyle', id: command.id, style: previous },
      ...restored,
    ],
    applied: [{ id: command.id, values: { style: readStyle(style) } }],
    // Con overrides tocados el front necesita la proyección nueva (párrafos y
    // runs no viajan en `applied`).
    ...(restored.length > 0 ? { snapshotOut: true } : {}),
  });
}

/* --------------------------- escritura ---------------------------------- */

/**
 * Aplica un parche al `<Style>`. Devuelve:
 * - `previous`: valores anteriores de los campos que **existían** (para el
 *   inverso; `null` = el tag no existía).
 * - `removed`: nodos borrados por un valor `null`, con su índice, para poder
 *   reinsertarlos tal cual (quitar y volver a crear perdería el orden original).
 */
export function writeStylePatch(
  style: RdlcNode,
  patch: StylePatch,
): { previous: StylePatch; removed: RemovedStyleNode[] } {
  const previous: StylePatch = {};
  const removed: RemovedStyleNode[] = [];

  // Índices **originales** de los hijos: si se quitan varios tags seguidos, los
  // índices vivos ya no sirven para devolverlos a su sitio (cada borrado mueve
  // a los siguientes). Con el mapa prístino, el undo los reinserta en orden
  // ascendente y el XML queda igual que al principio.
  const originalIndex = new Map<string, number>();
  style.children().forEach((child, index) => {
    if (!originalIndex.has(child.tagName)) originalIndex.set(child.tagName, index);
  });

  const removeTag = (tag: string): void => {
    const child = style.child(tag);
    const index = originalIndex.get(tag);
    if (!child || index === undefined) return;
    child.remove();
    removed.push({ style, node: child, index });
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
          removeTag(side.tag);
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

    const tag = SIMPLE_TAGS[key] ?? (key === 'fontSize' ? 'FontSize' : undefined);
    if (!tag) continue;

    if (value === null) {
      removeTag(tag);
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

  return { previous, removed };
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

  for (const tag of tags) {
    const value = itemStyle.child(tag)?.text();
    if (value === undefined) continue;

    for (const style of paragraphAndRunStyles(item)) {
      const child = style.child(tag);
      if (!child) continue;
      inverse.push({ cmd: 'setNodeText', node: child, value: child.text() ?? '' });
      child.setText(value);
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

/** `<Style>` de los párrafos del textbox y de sus runs. */
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

  return result;
}

/** Reexport para tests: longitud formateada tal cual se escribe en el XML. */
export const formatStyleLength = formatLength;
export const parseStyleLength = parseLength;
