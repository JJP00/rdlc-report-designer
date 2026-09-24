import type { ParagraphDto, RdlcCommand, StyleDto } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome } from './CommandContext.js';
import { writeStylePatch } from './setStyle.js';

export type SetParagraphsCommand = Extract<RdlcCommand, { cmd: 'setParagraphs' }>;

/**
 * Reemplaza los párrafos del Textbox (editor de texto: párrafos → runs, con
 * formato por run/párrafo). Es **un solo paso de undo**: el inverso devuelve el
 * nodo `<Paragraphs>` original tal cual (byte-exacto).
 */
export function applySetParagraphs(
  ctx: CommandContext,
  command: SetParagraphsCommand,
): Either<DomainError, CommandOutcome> {
  const textbox = ctx.index.get(command.id);
  if (!textbox) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));
  if (textbox.tagName !== 'Textbox') {
    return left(CommandRejectedError.create(`El elemento '${command.id}' no es un Textbox`));
  }

  const original = textbox.child('Paragraphs');
  if (!original) {
    return left(CommandRejectedError.create(`El Textbox '${command.id}' no tiene <Paragraphs>`));
  }
  // El XSD exige al menos un párrafo y un TextRun por párrafo.
  if (command.paragraphs.length === 0) {
    return left(CommandRejectedError.create('El Textbox necesita al menos un párrafo'));
  }
  const emptyParagraph = command.paragraphs.findIndex((paragraph) => paragraph.runs.length === 0);
  if (emptyParagraph !== -1) {
    return left(
      CommandRejectedError.create(
        `El párrafo ${emptyParagraph + 1} no tiene TextRuns: cada párrafo necesita al menos uno`,
      ),
    );
  }

  const container = original.parent ?? textbox;
  const index = container.children().findIndex((child) => child.equals(original));
  original.remove();
  const created = buildParagraphs(textbox, command.paragraphs);
  container.insertChildAt(created, index);

  return right({
    inverse: [
      { cmd: 'removeNode', node: created },
      { cmd: 'restoreNode', node: original, container, index, name: 'Paragraphs' },
    ],
    snapshotOut: true,
  });
}

/** `<Paragraphs>` nuevo con el orden que usa BC: `Label?`, `Value`, `Style?`. */
function buildParagraphs(container: RdlcNode, paragraphs: ParagraphDto[]): RdlcNode {
  const element = container.createElement('Paragraphs');
  for (const paragraph of paragraphs) {
    const paragraphNode = element.createElement('Paragraph');
    const runs = paragraphNode.createElement('TextRuns');
    for (const run of paragraph.runs) {
      const runNode = runs.createElement('TextRun');
      if (run.label !== undefined && run.label !== '') {
        runNode.appendChild(runNode.createElement('Label', run.label));
      }
      runNode.appendChild(runNode.createElement('Value', run.value));
      const style = styleNode(runNode, run.style);
      if (style) runNode.appendChild(style);
      runs.appendChild(runNode);
    }
    paragraphNode.appendChild(runs);
    const style = styleNode(paragraphNode, paragraph.style);
    if (style) paragraphNode.appendChild(style);
    element.appendChild(paragraphNode);
  }
  return element;
}

/** `<Style>` del nivel (run/párrafo) si el DTO trae algo que escribir. */
function styleNode(node: RdlcNode, style: StyleDto | undefined): RdlcNode | undefined {
  if (!style) return undefined;
  const element = node.createElement('Style');
  writeStylePatch(element, style);
  return element.children().length > 0 ? element : undefined;
}
