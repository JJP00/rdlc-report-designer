import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import { childOrCreate, insertCanonical, readLength } from '../geometry/geometry.js';
import { formatLength, fromCm, toCm, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { setNodeTextChange } from './nodeChanges.js';

export type SetRegionHeightCommand = Extract<RdlcCommand, { cmd: 'setRegionHeight' }>;
export type SetSectionWidthCommand = Extract<RdlcCommand, { cmd: 'setSectionWidth' }>;
export type SetHeaderFooterOptionsCommand = Extract<RdlcCommand, { cmd: 'setHeaderFooterOptions' }>;
export type SetRegionPresentCommand = Extract<RdlcCommand, { cmd: 'setRegionPresent' }>;

/** Alto por defecto de una banda recién insertada (como Report Builder). */
const DEFAULT_BAND_HEIGHT_CM = 1.25;

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
    return right(writeHeight(body, clampBandHeight(body, command.height)));
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

  return right(writeHeight(existing, clampBandHeight(existing, command.height)));
}

/**
 * El alto de una banda nunca queda por debajo de su contenido: si el alto
 * pedido es menor que el fondo más lejano de los items de primer nivel, la
 * banda **crece** hasta él (los items no se mueven). Misma regla que el ancho
 * de sección.
 */
function clampBandHeight(region: RdlcNode, height: Length): Length {
  const contentCm = bandContentBottomCm(region);
  return contentCm > toCm(height) ? fromCm(contentCm) : height;
}

/** Fondo más lejano del contenido (cm) de una banda: items de primer nivel. */
function bandContentBottomCm(region: RdlcNode): number {
  const zero: Length = { value: 0, unit: 'cm' };
  let max = 0;
  for (const item of region.child('ReportItems')?.children() ?? []) {
    const top = toCm(readLength(item, 'Top') ?? zero);
    const height = toCm(readLength(item, 'Height') ?? zero);
    max = Math.max(max, top + height);
  }
  return max;
}

/**
 * Ancho de la sección del informe (`ReportSection > Width`): manda en el ancho
 * de encabezado, cuerpo y pie (la proyección los sirve todos con ese valor).
 *
 * **El cuerpo nunca queda a la izquierda de su contenido**: si el ancho pedido
 * es menor que el borde derecho más lejano de los items de primer nivel de las
 * tres bandas, la sección **crece** hasta el contenido (los items no se mueven).
 */
export function applySetSectionWidth(
  ctx: CommandContext,
  command: SetSectionWidthCommand,
): Either<DomainError, CommandOutcome> {
  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const contentCm = contentRightCm(section);
  const width: Length = contentCm > toCm(command.width) ? fromCm(contentCm) : command.width;

  const existing = section.child('Width');
  if (existing) {
    const previous = existing.text() ?? '';
    const next = formatLength(width);
    // Sin cambio real (p. ej. el clamp devuelve el ancho actual): no-op.
    if (previous === next) return right({ inverse: [] });
    existing.setText(next);
    return right({ inverse: [setNodeTextChange({ node: existing, value: previous })] });
  }

  const created = section.createElement('Width', formatLength(width));
  insertCanonical(section, 'Width', created);
  return right({ inverse: [{ cmd: 'removeNode', node: created }] });
}

/**
 * Borde derecho más lejano del contenido (cm): items de **primer nivel** de
 * `Body`, `PageHeader` y `PageFooter` (como el crecimiento de rectángulos).
 */
function contentRightCm(section: RdlcNode): number {
  const zero: Length = { value: 0, unit: 'cm' };
  const containers = [
    section.child('Body')?.child('ReportItems'),
    section.child('Page')?.child('PageHeader')?.child('ReportItems'),
    section.child('Page')?.child('PageFooter')?.child('ReportItems'),
  ];

  let max = 0;
  for (const container of containers) {
    for (const item of container?.children() ?? []) {
      const left = toCm(readLength(item, 'Left') ?? zero);
      const width = toCm(readLength(item, 'Width') ?? zero);
      max = Math.max(max, left + width);
    }
  }
  return max;
}

/** Escribe `Height` en la banda/cuerpo (lo crea en orden canónico si falta). */
function writeHeight(container: RdlcNode, height: Length): CommandOutcome {
  const existing = container.child('Height');
  if (existing) {
    const previous = existing.text() ?? '';
    const next = formatLength(height);
    // Sin cambio real (p. ej. el clamp devuelve el alto actual): no-op.
    if (previous === next) return { inverse: [] };
    existing.setText(next);
    return { inverse: [setNodeTextChange({ node: existing, value: previous })] };
  }

  const created = container.createElement('Height', formatLength(height));
  insertCanonical(container, 'Height', created);
  return { inverse: [{ cmd: 'removeNode', node: created }] };
}

/**
 * Inserta o quita una banda de página (`PageHeader`/`PageFooter`). Al insertar
 * nace con un alto por defecto (`Height`); al quitar se elimina el nodo entero
 * (con su contenido) y el undo lo restaura tal cual.
 */
export function applySetRegionPresent(
  ctx: CommandContext,
  command: SetRegionPresentCommand,
): Either<DomainError, CommandOutcome> {
  const section = reportSection(ctx);
  if (!section) {
    return left(CommandRejectedError.create('El documento no tiene ReportSection'));
  }

  const tag = regionTag(command.region);
  // Al **quitar** no se crea un `Page` vacío: si no existe la banda, es no-op.
  const page = command.present ? childOrCreate(section, 'Page') : section.child('Page');
  if (!page) return right({ inverse: [], snapshotOut: true });
  const existing = page.child(tag);

  if (command.present) {
    if (existing) return right({ inverse: [], snapshotOut: true });
    const created = page.createElement(tag);
    created.appendChild(
      created.createElement('Height', formatLength(fromCm(DEFAULT_BAND_HEIGHT_CM))),
    );
    insertCanonical(page, tag, created);
    return right({ inverse: [{ cmd: 'removeNode', node: created }], snapshotOut: true });
  }

  if (!existing || !existing.parent) {
    return right({ inverse: [], snapshotOut: true });
  }

  const parent = existing.parent;
  const index = parent.children().findIndex((node) => node.equals(existing));
  existing.remove();
  return right({
    inverse: [
      {
        cmd: 'restoreNode',
        node: existing,
        container: parent,
        index: Math.max(index, 0),
        name: tag,
      },
    ],
    snapshotOut: true,
  });
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
