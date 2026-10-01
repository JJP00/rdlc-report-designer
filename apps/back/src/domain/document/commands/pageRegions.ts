import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical } from '../geometry/geometry.js';
import { formatLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { setNodeTextChange } from './nodeChanges.js';

export type SetRegionHeightCommand = Extract<RdlcCommand, { cmd: 'setRegionHeight' }>;
export type SetSectionWidthCommand = Extract<RdlcCommand, { cmd: 'setSectionWidth' }>;
export type SetHeaderFooterOptionsCommand = Extract<RdlcCommand, { cmd: 'setHeaderFooterOptions' }>;

/**
 * Bandas de página (`PageHeader`/`PageFooter`) y **cuerpo** (`Body`): alto,
 * ancho de la sección (`ReportSection > Width`, que manda en las tres bandas) e
 * impresión en la primera y/o última página. El `Page` se crea si el fichero no
 * lo trae (igual que los márgenes) y el undo es byte-exacto: lo creado se quita
 * y los textos vuelven a su valor anterior.
 */

/** Alto de la banda o del cuerpo (`Height` del contenedor). */
export function applySetRegionHeight(
  ctx: CommandContext,
  command: SetRegionHeightCommand,
): Either<DomainError, CommandOutcome> {
  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  // El cuerpo cuelga directo de la sección (`Body > Height`).
  if (command.region === 'body') {
    const body = section.child('Body');
    if (!body) return left(CommandRejectedError.create('El documento no tiene Body'));
    return right(writeHeight(body, command.height));
  }

  const tag = regionTag(command.region);
  const page = childOrCreate(section, 'Page');
  const existing = page.child(tag);
  if (!existing) {
    const created = page.createElement(tag);
    created.appendChild(created.createElement('Height', formatLength(command.height)));
    insertCanonical(page, tag, created);
    return right({ inverse: [{ cmd: 'removeNode', node: created }] });
  }

  return right(writeHeight(existing, command.height));
}

/**
 * Ancho de la sección del informe (`ReportSection > Width`): manda en el ancho
 * de encabezado, cuerpo y pie (la proyección los sirve todos con ese valor).
 */
export function applySetSectionWidth(
  ctx: CommandContext,
  command: SetSectionWidthCommand,
): Either<DomainError, CommandOutcome> {
  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const existing = section.child('Width');
  if (existing) {
    const previous = existing.text() ?? '';
    existing.setText(formatLength(command.width));
    return right({ inverse: [setNodeTextChange({ node: existing, value: previous })] });
  }

  const created = section.createElement('Width', formatLength(command.width));
  insertCanonical(section, 'Width', created);
  return right({ inverse: [{ cmd: 'removeNode', node: created }] });
}

/** Escribe `Height` en la banda/cuerpo (lo crea en orden canónico si falta). */
function writeHeight(container: RdlcNode, height: Length): CommandOutcome {
  const existing = container.child('Height');
  if (existing) {
    const previous = existing.text() ?? '';
    existing.setText(formatLength(height));
    return { inverse: [setNodeTextChange({ node: existing, value: previous })] };
  }

  const created = container.createElement('Height', formatLength(height));
  insertCanonical(container, 'Height', created);
  return { inverse: [{ cmd: 'removeNode', node: created }] };
}

/** `PrintOnFirstPage` / `PrintOnLastPage` de la banda (literales booleanos). */
export function applySetHeaderFooterOptions(
  ctx: CommandContext,
  command: SetHeaderFooterOptionsCommand,
): Either<DomainError, CommandOutcome> {
  if (command.printOnFirstPage === undefined && command.printOnLastPage === undefined) {
    return left(CommandRejectedError.create('No hay ninguna opción que cambiar'));
  }

  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const tag = regionTag(command.region);
  const page = childOrCreate(section, 'Page');
  const region = childOrCreate(page, tag);

  const inverse: DomainCommand[] = [];
  if (command.printOnFirstPage !== undefined) {
    writeFlag(region, 'PrintOnFirstPage', command.printOnFirstPage, inverse);
  }
  if (command.printOnLastPage !== undefined) {
    writeFlag(region, 'PrintOnLastPage', command.printOnLastPage, inverse);
  }

  // La banda no es un item: el front no puede parchearla, se refresca sola.
  return right({ inverse, snapshotOut: true });
}

function regionTag(region: 'pageHeader' | 'pageFooter'): 'PageHeader' | 'PageFooter' {
  return region === 'pageHeader' ? 'PageHeader' : 'PageFooter';
}

function reportSection(ctx: CommandContext): RdlcNode | undefined {
  return ctx.root.child('ReportSections')?.child('ReportSection');
}

/** Escribe el flag (creando el nodo en orden canónico) o lo actualiza. */
function writeFlag(
  region: RdlcNode,
  tag: 'PrintOnFirstPage' | 'PrintOnLastPage',
  value: boolean,
  inverse: DomainCommand[],
): void {
  const existing = region.child(tag);
  if (existing) {
    const previous = existing.text() ?? '';
    if (previous === String(value)) return;
    existing.setText(String(value));
    inverse.push(setNodeTextChange({ node: existing, value: previous }));
    return;
  }

  const created = region.createElement(tag, String(value));
  insertCanonical(region, tag, created);
  inverse.push({ cmd: 'removeNode', node: created });
}
