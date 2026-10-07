import type { RdlcCommand } from '@rdlc-designer/contracts';
import type { TablixBreakLocation } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import {
  detach,
  insertAfterTags,
  moveNode,
  restore,
  setNodeTextChange,
  type Detached,
} from './nodeChanges.js';
import {
  leafAt,
  memberAt,
  memberLeafRange,
  tablixColumns,
  tablixHierarchy,
  tablixRows,
} from './tablixParts.js';

export type SetGroupExpressionCommand = Extract<RdlcCommand, { cmd: 'setGroupExpression' }>;
export type SetGroupNameCommand = Extract<RdlcCommand, { cmd: 'setGroupName' }>;
export type SetGroupExpressionsCommand = Extract<RdlcCommand, { cmd: 'setGroupExpressions' }>;
export type AddRowGroupCommand = Extract<RdlcCommand, { cmd: 'addRowGroup' }>;
export type AddColumnGroupCommand = Extract<RdlcCommand, { cmd: 'addColumnGroup' }>;
export type AddRowToGroupCommand = Extract<RdlcCommand, { cmd: 'addRowToGroup' }>;
export type AddColumnToGroupCommand = Extract<RdlcCommand, { cmd: 'addColumnToGroup' }>;
export type DeleteRowGroupCommand = Extract<RdlcCommand, { cmd: 'deleteRowGroup' }>;
export type SetGroupPageBreaksCommand = Extract<RdlcCommand, { cmd: 'setGroupPageBreaks' }>;
export type SetGroupSortingCommand = Extract<RdlcCommand, { cmd: 'setGroupSorting' }>;

interface GroupSort {
  expression: string;
  direction: 'Ascending' | 'Descending';
}

/**
 * Grupos del Tablix (F2.b/F3): expresiones, creación/eliminación, saltos de
 * página y ordenación, en la jerarquía de **filas o de columnas** (Matrix). El
 * modelo RDL: un `TablixMember` con `<Group>` es dinámico (se repite por valor
 * de las expresiones) y sus hojas son filas/columnas del body.
 *
 * Decisiones (lecciones del ida/vuelta con Report Builder):
 * - Un grupo puede ser **hoja** (sin `TablixMembers`): es la fila/columna de
 *   detalle que se repite (caso real: `Tablix7` de BC y el grupo de columna
 *   `BTC_Document_No_` de `BTCLoadingOrder`). `deleteRowGroup` lo degrada a
 *   hoja estática sin perderla (y conserva su `TablixHeader`).
 * - Un grupo **con hijos**: `deleteRowGroup` **eleva** las hojas al padre y el
 *   miembro desaparece (como RB al quitar el grupo: la línea de grupo no deja
 *   un contenedor fantasma). Si el grupo trae `TablixHeader` con contenido, se
 *   rechaza para no perderlo en silencio.
 * - `addRowGroup`/`addColumnGroup` **envuelven** la hoja elegida en el grupo
 *   nuevo (como RB al agrupar una fila/columna de detalle) y **no tocan
 *   `TablixHeader`**: no se crea cabecera ni se convierte ninguna en hoja; si el
 *   miembro ya tenía cabecera, se conserva.
 * - La ordenación (`SortExpressions`) del grupo espeja la expresión: al crear el
 *   grupo nace ordenado por ella y al editarla se sincroniza si espejaba la
 *   anterior (igual que RB). Ascendente se **omite** en el XML (canónico de BC).
 * - Los saltos de página se gestionan solo en `Start`/`End`/`Between`: otros
 *   valores (`None`, `StartAndEnd`) no se tocan.
 */

/* ------------------------- expresiones del grupo ------------------------- */

/**
 * Edita la expresión de un grupo apuntado por `path`. El nombre del grupo no
 * cambia (las expresiones de ámbito `Sum(..., "Grupo")` lo referencian).
 */
export function applySetGroupExpression(
  ctx: CommandContext,
  command: SetGroupExpressionCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member, group } = found.value;

  const existing = group.child('GroupExpressions')?.children('GroupExpression') ?? [];
  if (existing.length > 1) {
    return left(
      CommandRejectedError.create(
        'El grupo tiene varias expresiones: edítalas desde «Propiedades del grupo»',
      ),
    );
  }

  const expression = normalizedExpression(command.expression);
  if (expression === null) {
    return left(CommandRejectedError.create('La expresión del grupo no puede estar vacía'));
  }

  const previous = existing[0]?.text();
  if (previous === expression) return right({ inverse: [] });

  const inverse: DomainCommand[] = [];
  writeGroupExpressions(group, [expression], inverse);
  syncSortExpressions(member, previous !== undefined ? [previous] : [], [expression], inverse);

  return right({ inverse, snapshotOut: true });
}

/**
 * Reemplaza la lista completa de expresiones del grupo (la primera es el
 * «Group on» de RB; las siguientes, los «And on»).
 */
export function applySetGroupExpressions(
  ctx: CommandContext,
  command: SetGroupExpressionsCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member, group } = found.value;

  if (command.expressions.length === 0) {
    return left(CommandRejectedError.create('El grupo necesita al menos una expresión'));
  }

  const expressions = normalizedExpressions(command.expressions);
  if (expressions === null) {
    return left(CommandRejectedError.create('La expresión del grupo no puede estar vacía'));
  }

  const previous =
    group
      .child('GroupExpressions')
      ?.children('GroupExpression')
      .map((node) => node.text() ?? '') ?? [];

  const inverse: DomainCommand[] = [];
  writeGroupExpressions(group, expressions, inverse);
  syncSortExpressions(member, previous, expressions, inverse);

  return right({ inverse, snapshotOut: true });
}

/* ------------------------------ addRowGroup ------------------------------ */

/**
 * Envuelve la hoja (fila del body) `row` en un grupo nuevo con `expression`:
 * `<TablixMember><Group/><SortExpressions/><TablixMembers>hoja</TablixMembers>`
 * en el hueco que ocupaba la hoja. El body no cambia (las hojas siguen siendo
 * las mismas); el nombre del grupo se deriva de la expresión y es único.
 */
export function applyAddRowGroup(
  ctx: CommandContext,
  command: AddRowGroupCommand,
): Either<DomainError, CommandOutcome> {
  return addLeafGroup(ctx, command.id, 'row', command.row, command.expression);
}

/** F3 · Matrix: agrupa una columna (espejo de `applyAddRowGroup`). */
export function applyAddColumnGroup(
  ctx: CommandContext,
  command: AddColumnGroupCommand,
): Either<DomainError, CommandOutcome> {
  return addLeafGroup(ctx, command.id, 'column', command.column, command.expression);
}

/**
 * Envuelve la hoja (fila/columna del body) `index` en un grupo nuevo con
 * `expression`: `<TablixMember><Group/><SortExpressions/><TablixMembers>hoja
 * </TablixMembers>` en el hueco que ocupaba la hoja. El body no cambia (las
 * hojas siguen siendo las mismas); el nombre del grupo se deriva de la
 * expresión y es único.
 */
function addLeafGroup(
  ctx: CommandContext,
  id: string,
  axis: 'row' | 'column',
  index: number,
  wanted: string,
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${id}'`));

  const labels = leafLabels(axis);
  const hierarchy = tablix.child(axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy');
  const leaves = axis === 'row' ? tablixRows(tablix) : tablixColumns(tablix);
  if (!hierarchy?.child('TablixMembers')) {
    return left(
      CommandRejectedError.create(`El Tablix '${id}' no tiene jerarquía de ${labels.many}`),
    );
  }
  if (index >= leaves.length) {
    return left(
      CommandRejectedError.create(`La ${labels.one} ${index} está fuera del Tablix '${id}'`),
    );
  }

  const expression = normalizedExpression(wanted);
  if (expression === null) {
    return left(CommandRejectedError.create('La expresión del grupo no puede estar vacía'));
  }

  const leaf = leafAt(hierarchy, index);
  if (!leaf) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${id}' no tiene miembro para la ${labels.one} ${index}`,
      ),
    );
  }

  // El grupo nuevo ocupa el hueco de la hoja y esta pasa a ser su detalle.
  const position = detach(leaf.member);

  const groupMember = leaf.container.createElement('TablixMember');
  const group = groupMember.createElement('Group');
  group.setAttribute('Name', nextGroupName(ctx, expression));
  const groupExpressions = group.createElement('GroupExpressions');
  groupExpressions.appendChild(group.createElement('GroupExpression', expression));
  group.appendChild(groupExpressions);
  groupMember.appendChild(group);

  const sorts = groupMember.createElement('SortExpressions');
  sorts.appendChild(createSortExpression(sorts, { expression, direction: 'Ascending' }));
  groupMember.appendChild(sorts);

  const nested = groupMember.createElement('TablixMembers');
  nested.appendChild(leaf.member);
  groupMember.appendChild(nested);

  position.container.insertChildAt(groupMember, position.index);

  // El undo quita el grupo (con sus nodos nuevos) y devuelve la hoja a su sitio.
  return right({
    inverse: [restore(position, leaf.member), { cmd: 'removeNode', node: groupMember }],
    snapshotOut: true,
  });
}

/* ---------------------------- addRowToGroup ------------------------------ */

/**
 * Añade una fila **contigua** al grupo: la hoja pasa a ser la primera (si va
 * justo antes del rango del grupo) o la última (si va justo después). Si el
 * grupo era hoja (sin `TablixMembers`), nace su contenedor de miembros.
 */
export function applyAddRowToGroup(
  ctx: CommandContext,
  command: AddRowToGroupCommand,
): Either<DomainError, CommandOutcome> {
  return addLeafToGroup(ctx, command.id, 'row', command.row, command.groupPath);
}

/** F3 · Matrix: añade una columna contigua al grupo (espejo de `addRowToGroup`). */
export function applyAddColumnToGroup(
  ctx: CommandContext,
  command: AddColumnToGroupCommand,
): Either<DomainError, CommandOutcome> {
  return addLeafToGroup(ctx, command.id, 'column', command.column, command.groupPath);
}

/**
 * Añade una hoja **contigua** al grupo: pasa a ser la primera (si va justo
 * antes del rango del grupo) o la última (si va justo después). Un grupo hoja
 * (sin `TablixMembers`) se rechaza: añadirle hijos la haría desaparecer.
 */
function addLeafToGroup(
  ctx: CommandContext,
  id: string,
  axis: 'row' | 'column',
  index: number,
  groupPath: number[],
): Either<DomainError, CommandOutcome> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${id}'`));

  const labels = leafLabels(axis);
  const hierarchy = tablix.child(axis === 'row' ? 'TablixRowHierarchy' : 'TablixColumnHierarchy');
  const root = hierarchy?.child('TablixMembers');
  const leaves = axis === 'row' ? tablixRows(tablix) : tablixColumns(tablix);
  if (!hierarchy || !root) {
    return left(
      CommandRejectedError.create(`El Tablix '${id}' no tiene jerarquía de ${labels.many}`),
    );
  }
  if (index >= leaves.length) {
    return left(
      CommandRejectedError.create(`La ${labels.one} ${index} está fuera del Tablix '${id}'`),
    );
  }

  const leaf = leafAt(hierarchy, index);
  if (!leaf) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${id}' no tiene miembro para la ${labels.one} ${index}`,
      ),
    );
  }

  const target = memberAt(root, groupPath);
  if (!target?.child('Group')) {
    return left(CommandRejectedError.create('El destino no es un grupo: no declara <Group>'));
  }
  if (target.equals(leaf.member)) {
    return left(CommandRejectedError.create(`La ${labels.one} ya es ese grupo`));
  }

  // Un grupo hoja (sin miembros) ES su hoja: añadirle hijos la haría desaparecer.
  const nested = target.child('TablixMembers');
  if (!nested) {
    return left(
      CommandRejectedError.create(
        `El grupo es una ${labels.one} (grupo hoja): no se le pueden añadir más ${labels.many}`,
      ),
    );
  }

  const range = memberLeafRange(hierarchy, target);
  if (!range) {
    return left(CommandRejectedError.create('No se pudo localizar el rango de hojas del grupo'));
  }
  if (index >= range.start && index <= range.end) {
    return left(CommandRejectedError.create(`La ${labels.one} ya está dentro del grupo`));
  }
  if (index !== range.start - 1 && index !== range.end + 1) {
    return left(
      CommandRejectedError.create(`Solo se pueden añadir ${labels.many} contiguas al grupo`),
    );
  }

  // Si la hoja fuese el único hijo de su grupo, este se quedaría sin hojas.
  if (
    leaf.container.children('TablixMember').length === 1 &&
    leaf.container.parent?.tagName === 'TablixMember'
  ) {
    return left(
      CommandRejectedError.create(`La ${labels.one} es la única de su grupo: muévela con el grupo`),
    );
  }

  const position = detach(leaf.member);
  if (index < range.start) nested.insertChildAt(leaf.member, 0);
  else nested.appendChild(leaf.member);

  return right({
    inverse: [moveNode(leaf.member, position.container, position.index)],
    snapshotOut: true,
  });
}

/** Singular/plural de la hoja según el eje (mensajes de rechazo). */
function leafLabels(axis: 'row' | 'column'): {
  one: 'fila' | 'columna';
  many: 'filas' | 'columnas';
} {
  return axis === 'row' ? { one: 'fila', many: 'filas' } : { one: 'columna', many: 'columnas' };
}

/* ------------------------------ setGroupName ----------------------------- */

/**
 * Renombra el grupo (`Group > @Name`). El nombre debe ser único en todo el
 * documento (el índice incluye items y nombres de grupo). Las expresiones de
 * ámbito ya escritas (`Sum(Fields!X.Value, "GrupoViejo")`) **no** se reescriben:
 * es responsabilidad del usuario, con aviso en el diálogo.
 */
export function applySetGroupName(
  ctx: CommandContext,
  command: SetGroupNameCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { group } = found.value;

  const name = command.name.trim();
  if (name === '') {
    return left(CommandRejectedError.create('El nombre del grupo no puede estar vacío'));
  }

  const previous = group.attribute('Name');
  if (previous === name) return right({ inverse: [] });

  // Los nombres de item y de grupo comparten espacio (ToggleItem, scopes); los
  // campos de DataSet, no: renombrar a un nombre de campo es legítimo. La
  // colisión es **sin distinguir mayúsculas** (RB resuelve con VB).
  const groupWithName = findGroupByName(ctx.root, name);
  if (ctx.index.has(name) || (groupWithName && !groupWithName.equals(group))) {
    return left(
      CommandRejectedError.create(`Ya existe un elemento o grupo con el nombre '${name}'`),
    );
  }

  group.setAttribute('Name', name);
  return right({
    inverse: [{ cmd: 'setAttribute', node: group, name: 'Name', value: previous ?? '' }],
    snapshotOut: true,
  });
}

/* ---------------------------- deleteRowGroup ----------------------------- */

/**
 * Quita el grupo del miembro:
 * - grupo hoja → se quitan `Group` y su ordenación; la fila se queda estática.
 * - grupo con hijos → las filas se elevan al padre y el miembro desaparece.
 */
export function applyDeleteRowGroup(
  ctx: CommandContext,
  command: DeleteRowGroupCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member, group } = found.value;

  const children = member.child('TablixMembers')?.children('TablixMember') ?? [];
  if (children.length > 0) {
    if (headerHasContent(member)) {
      return left(
        CommandRejectedError.create(
          'El grupo tiene una cabecera fuera de la rejilla con contenido: bórrala antes de quitar el grupo',
        ),
      );
    }
    return right(hoistGroup(member, children));
  }

  const inverse: DomainCommand[] = [];
  const groupPosition = detach(group);
  inverse.push(restore(groupPosition, group));

  const sorts = member.child('SortExpressions');
  if (sorts) {
    const sortsPosition = detach(sorts);
    inverse.push(restore(sortsPosition, sorts));
  }

  return right({ inverse, snapshotOut: true });
}

/** Eleva las filas de un grupo al padre y lo quita (undo: al revés). */
function hoistGroup(member: RdlcNode, children: RdlcNode[]): CommandOutcome {
  const position = detach(member);
  const childPositions: Detached[] = children.map((child) => detach(child));
  children.forEach((child, index) => {
    position.container.insertChildAt(child, position.index + index);
  });

  return {
    inverse: [
      ...children.map((child, index) =>
        moveNode(child, childPositions[index]!.container, childPositions[index]!.index),
      ),
      restore(position, member),
    ],
    snapshotOut: true,
  };
}

/* --------------------------- opciones del grupo --------------------------- */

/**
 * Saltos de página del grupo: un `PageBreak > BreakLocation` por opción marcada
 * (`Between`, `Start`, `End`), en ese orden. Los saltos con otros valores no se
 * tocan.
 */
export function applySetGroupPageBreaks(
  ctx: CommandContext,
  command: SetGroupPageBreaksCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { group } = found.value;

  const wanted: TablixBreakLocation[] = [];
  if (command.between) wanted.push('Between');
  if (command.start) wanted.push('Start');
  if (command.end) wanted.push('End');

  const inverse: DomainCommand[] = [];
  for (const pageBreak of group.children('PageBreak')) {
    const location = pageBreak.child('BreakLocation')?.text();
    if (location === undefined || !isManagedBreak(location)) continue;
    if (wanted.includes(location)) continue;
    const position = detach(pageBreak);
    inverse.push(restore(position, pageBreak));
  }

  for (const location of wanted) {
    const exists = group
      .children('PageBreak')
      .some((pageBreak) => pageBreak.child('BreakLocation')?.text() === location);
    if (exists) continue;
    const pageBreak = group.createElement('PageBreak');
    pageBreak.appendChild(pageBreak.createElement('BreakLocation', location));
    insertAfterTags(group, pageBreak, [
      'DocumentMapLabel',
      'GroupExpressions',
      'ReGroupExpressions',
      'PageBreak',
    ]);
    inverse.push({ cmd: 'removeNode', node: pageBreak });
  }

  return right({ inverse, snapshotOut: true });
}

/** Ordenación del miembro (`SortExpressions`) con dirección por entrada. */
export function applySetGroupSorting(
  ctx: CommandContext,
  command: SetGroupSortingCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member } = found.value;

  const sorts: GroupSort[] = [];
  for (const sort of command.sorts) {
    const expression = normalizedExpression(sort.expression);
    if (expression === null) {
      return left(CommandRejectedError.create('La expresión de ordenación no puede estar vacía'));
    }
    sorts.push({ expression, direction: sort.direction ?? 'Ascending' });
  }

  const container = member.child('SortExpressions');
  const inverse: DomainCommand[] = [];

  if (sorts.length === 0) {
    if (container) {
      const position = detach(container);
      inverse.push(restore(position, container));
    }
    return right({ inverse, snapshotOut: true });
  }

  if (!container) {
    const created = member.createElement('SortExpressions');
    for (const sort of sorts) created.appendChild(createSortExpression(created, sort));
    insertAfterTags(member, created, ['Group']);
    inverse.push({ cmd: 'removeNode', node: created });
    return right({ inverse, snapshotOut: true });
  }

  const existing = container.children('SortExpression');
  const count = Math.max(existing.length, sorts.length);
  for (let index = 0; index < count; index += 1) {
    const current = existing[index];
    const sort = sorts[index];
    if (current && sort) {
      writeSortExpression(current, sort, inverse);
    } else if (current) {
      const position = detach(current);
      inverse.push(restore(position, current));
    } else if (sort) {
      const created = createSortExpression(container, sort);
      container.appendChild(created);
      inverse.push({ cmd: 'removeNode', node: created });
    }
  }

  return right({ inverse, snapshotOut: true });
}

/* ------------------------------- helpers --------------------------------- */

interface FoundGroup {
  member: RdlcNode;
  group: RdlcNode;
}

/** Miembro apuntado por `path` y su `<Group>`; si no es grupo, se rechaza. */
function findGroup(
  ctx: CommandContext,
  id: string,
  axis: 'row' | 'column',
  path: number[],
): Either<DomainError, FoundGroup> {
  const tablix = ctx.index.get(id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${id}'`));

  const root = tablixHierarchy(tablix, axis);
  if (!root) {
    return left(
      CommandRejectedError.create(
        `El Tablix '${id}' no tiene jerarquía de ${axis === 'row' ? 'filas' : 'columnas'}`,
      ),
    );
  }

  const member = memberAt(root, path);
  if (!member) {
    const what = axis === 'row' ? 'fila' : 'columna';
    return left(
      CommandRejectedError.create(`No hay ${what} en la ruta ${path.join('.')} del Tablix '${id}'`),
    );
  }

  const group = member.child('Group');
  if (!group) {
    return left(CommandRejectedError.create('El miembro no es un grupo: no declara <Group>'));
  }

  return right({ member, group });
}

/** true si la `TablixHeader` del miembro tiene un report item dentro. */
function headerHasContent(member: RdlcNode): boolean {
  const contents = member.child('TablixHeader')?.child('CellContents');
  if (!contents) return false;
  return contents
    .children()
    .some((child) => !['ColSpan', 'RowSpan', 'Height'].includes(child.tagName));
}

/** Escribe la lista de expresiones en `GroupExpressions` (crea/quita nodos). */
function writeGroupExpressions(
  group: RdlcNode,
  expressions: string[],
  inverse: DomainCommand[],
): void {
  const container = group.child('GroupExpressions');
  if (!container) {
    const created = group.createElement('GroupExpressions');
    for (const expression of expressions) {
      created.appendChild(created.createElement('GroupExpression', expression));
    }
    // Canónico: `GroupExpressions` va al principio (tras `DocumentMapLabel`).
    group.insertChildAt(created, group.child('DocumentMapLabel') ? 1 : 0);
    inverse.push({ cmd: 'removeNode', node: created });
    return;
  }

  const existing = container.children('GroupExpression');
  const count = Math.max(existing.length, expressions.length);
  for (let index = 0; index < count; index += 1) {
    const current = existing[index];
    const expression = expressions[index];
    if (current && expression !== undefined) {
      if (current.text() === expression) continue;
      inverse.push(setNodeTextChange({ node: current, value: current.text() ?? '' }));
      current.setText(expression);
    } else if (current) {
      const position = detach(current);
      inverse.push(restore(position, current));
    } else if (expression !== undefined) {
      const created = container.createElement('GroupExpression', expression);
      container.appendChild(created);
      inverse.push({ cmd: 'removeNode', node: created });
    }
  }
}

/** Sincroniza la ordenación que espejaba la primera expresión anterior. */
function syncSortExpressions(
  member: RdlcNode,
  previous: string[],
  next: string[],
  inverse: DomainCommand[],
): void {
  const from = previous[0];
  const to = next[0];
  if (from === undefined || to === undefined || from === to) return;
  for (const sort of member.child('SortExpressions')?.children('SortExpression') ?? []) {
    const value = sort.child('Value');
    if (value?.text() !== from) continue;
    inverse.push(setNodeTextChange({ node: value, value: from }));
    value.setText(to);
  }
}

/** Escribe `Value`/`Direction` de un `SortExpression` (ascendente = sin nodo). */
function writeSortExpression(sort: RdlcNode, wanted: GroupSort, inverse: DomainCommand[]): void {
  const value = sort.child('Value');
  if (value) {
    if (value.text() !== wanted.expression) {
      inverse.push(setNodeTextChange({ node: value, value: value.text() ?? '' }));
      value.setText(wanted.expression);
    }
  } else {
    const created = sort.createElement('Value', wanted.expression);
    sort.insertChildAt(created, 0);
    inverse.push({ cmd: 'removeNode', node: created });
  }

  const direction = sort.child('Direction');
  if (wanted.direction === 'Descending') {
    if (direction) {
      if (direction.text() !== 'Descending') {
        inverse.push(setNodeTextChange({ node: direction, value: direction.text() ?? '' }));
        direction.setText('Descending');
      }
    } else {
      const created = sort.createElement('Direction', 'Descending');
      sort.appendChild(created);
      inverse.push({ cmd: 'removeNode', node: created });
    }
  } else if (direction) {
    // Ascendente es el valor por defecto: se omite (canónico en BC).
    const position = detach(direction);
    inverse.push(restore(position, direction));
  }
}

function createSortExpression(parent: RdlcNode, sort: GroupSort): RdlcNode {
  const node = parent.createElement('SortExpression');
  node.appendChild(node.createElement('Value', sort.expression));
  if (sort.direction === 'Descending') {
    node.appendChild(node.createElement('Direction', 'Descending'));
  }
  return node;
}

/** Grupo con ese nombre en cualquier Tablix (scope names: únicos, sin distinguir caja). */
function findGroupByName(root: RdlcNode, name: string): RdlcNode | undefined {
  const wanted = name.toLowerCase();
  let found: RdlcNode | undefined;
  const walk = (node: RdlcNode): void => {
    if (found) return;
    if (node.tagName === 'Group' && node.attribute('Name')?.toLowerCase() === wanted) {
      found = node;
      return;
    }
    for (const child of node.children()) walk(child);
  };
  walk(root);
  return found;
}

/** Expresión lista para el XML: recortada y con `=` (lo que espera RDL). */
function normalizedExpression(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '=') return null;
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

function normalizedExpressions(values: string[]): string[] | null {
  const result: string[] = [];
  for (const value of values) {
    const expression = normalizedExpression(value);
    if (expression === null) return null;
    result.push(expression);
  }
  return result;
}

function isManagedBreak(location: string): location is TablixBreakLocation {
  return location === 'Start' || location === 'End' || location === 'Between';
}

/**
 * Nombre del grupo nuevo a partir de la expresión (`=Fields!X.Value` → `X`,
 * como RB) y **único** entre los nombres de ámbito del informe (`Group` y
 * `DataSet`: sus nombres se usan en expresiones de ámbito). Si ya existe,
 * añade 1, 2…
 */
function nextGroupName(ctx: CommandContext, expression: string): string {
  const taken = collectScopeNames(ctx.root);
  const base = groupNameBase(expression);
  let name = base;
  for (let index = 1; taken.has(name.toLowerCase()); index += 1) name = `${base}${index}`;
  return name;
}

function collectScopeNames(root: RdlcNode): Set<string> {
  const names = new Set<string>();
  const walk = (node: RdlcNode): void => {
    if (node.tagName === 'Group' || node.tagName === 'DataSet') {
      const name = node.attribute('Name');
      if (name) names.add(name.toLowerCase());
    }
    for (const child of node.children()) walk(child);
  };
  walk(root);
  return names;
}

/** Base del nombre: el primer campo de la expresión, o la expresión saneada. */
function groupNameBase(expression: string): string {
  const field = /Fields!([A-Za-z_]\w*)\.Value/.exec(expression);
  const raw = field?.[1] ?? expression;
  const cleaned = raw
    .replace(/^[\s=]+/, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned === '' ? 'Group' : cleaned;
}
