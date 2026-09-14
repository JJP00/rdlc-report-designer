import type { RdlcCommand, StylePatch } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical, readLength, writeLength } from '../geometry/geometry.js';
import { formatLength, parseLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';

export type SetStyleCommand = Extract<RdlcCommand, { cmd: 'setStyle' }>;

/**
 * Estilo del item (`<Style>` del Textbox/Rectangle/…): fuente, colores,
 * alineación, viñetas… Solo se escriben los campos presentes en el parche; el
 * inverso guarda los valores anteriores de esos mismos campos.
 */
export function applySetStyle(
  ctx: CommandContext,
  command: SetStyleCommand,
): Either<DomainError, CommandOutcome> {
  const node = ctx.index.get(command.id);
  if (!node) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const style = childOrCreate(node, 'Style');
  const previous = captureFields(style, command.style);

  writePatch(style, command.style);

  return right({
    inverse: [{ cmd: 'setStyle', id: command.id, style: previous }],
    applied: [{ id: command.id, values: { style: readStyle(style) } }],
  });
}

/* --------------------------- escritura ---------------------------------- */

const LENGTH_FIELDS = new Set(['FontSize']);
const PADDING_TAGS: Record<string, string> = {
  paddingTop: 'PaddingTop',
  paddingBottom: 'PaddingBottom',
  paddingLeft: 'PaddingLeft',
  paddingRight: 'PaddingRight',
};

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

function writePatch(style: RdlcNode, patch: StylePatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    // `null` = quitar la propiedad del <Style> (lo usa el inverso).
    if (value === null) {
      const tagToRemove = SIMPLE_TAGS[key] ?? PADDING_TAGS[key] ?? (key === 'fontSize' ? 'FontSize' : undefined);
      if (tagToRemove) style.child(tagToRemove)?.remove();
      continue;
    }

    if (key === 'fontSize' && typeof value === 'object') {
      writeLength(style, 'FontSize', value as Length);
      continue;
    }

    const paddingTag = PADDING_TAGS[key];
    if (paddingTag && typeof value === 'object') {
      writeLength(style, paddingTag, value as Length);
      continue;
    }

    const tag = SIMPLE_TAGS[key];
    if (tag) {
      setChildText(style, tag, String(value));
    }
  }
}

function setChildText(style: RdlcNode, tagName: string, value: string): void {
  const existing = style.child(tagName);
  if (existing) {
    existing.setText(value);
    return;
  }
  insertCanonical(style, tagName, style.createElement(tagName, value));
}

/* --------------------------- lectura ------------------------------------ */

/** Solo los campos que toca el parche (para construir el inverso). `null` = no existía. */
function captureFields(style: RdlcNode, patch: StylePatch): StylePatch {
  const previous: StylePatch = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (key === 'fontSize') {
      previous.fontSize = readLength(style, 'FontSize') ?? null;
      continue;
    }

    const paddingTag = PADDING_TAGS[key];
    if (paddingTag) {
      const length = readLength(style, paddingTag);
      const side = key.replace('padding', '').toLowerCase() as 'top' | 'bottom' | 'left' | 'right';
      previous.padding = { ...(previous.padding ?? {}), [side]: length ?? null };
      continue;
    }

    const tag = SIMPLE_TAGS[key];
    if (tag) {
      const current = style.child(tag)?.text();
      (previous as Record<string, unknown>)[key] = current ?? null;
    }
  }

  return previous;
}

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
  for (const [key, tag] of Object.entries(PADDING_TAGS)) {
    const length = readLength(style, tag);
    if (length) padding[key.replace('padding', '').toLowerCase()] = length;
  }
  if (Object.keys(padding).length > 0) result.padding = padding;

  return result;
}

/** Reexport para tests: longitud formateada tal cual se escribe en el XML. */
export const formatStyleLength = formatLength;
export const parseStyleLength = parseLength;
