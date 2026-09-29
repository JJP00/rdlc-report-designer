import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical } from '../geometry/geometry.js';
import { formatLength } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { setNodeTextChange } from './nodeChanges.js';

export type SetRegionHeightCommand = Extract<RdlcCommand, { cmd: 'setRegionHeight' }>;
export type SetHeaderFooterOptionsCommand = Extract<RdlcCommand, { cmd: 'setHeaderFooterOptions' }>;

/**
 * Bandas de página (`PageHeader`/`PageFooter`): alto e impresión en la primera
 * y/o última página. El `Page` se crea si el fichero no lo trae (igual que los
 * márgenes) y el undo es byte-exacto: lo creado se quita y los textos vuelven
 * a su valor anterior.
 */

/** Alto de la banda (`PageHeader/Height` o `PageFooter/Height`). */
export function applySetRegionHeight(
  ctx: CommandContext,
  command: SetRegionHeightCommand,
): Either<DomainError, CommandOutcome> {
  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
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

  const height = existing.child('Height');
  if (!height) {
    const created = existing.createElement('Height', formatLength(command.height));
    insertCanonical(existing, 'Height', created);
    return right({ inverse: [{ cmd: 'removeNode', node: created }] });
  }

  const previous = height.text() ?? '';
  height.setText(formatLength(command.height));
  return right({ inverse: [setNodeTextChange({ node: height, value: previous })] });
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
