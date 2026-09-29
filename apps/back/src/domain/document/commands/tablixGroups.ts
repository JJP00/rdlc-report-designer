import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right, type Either } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { RdlcNode } from '../tree/RdlcNode.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { detach, restore, setNodeTextChange } from './nodeChanges.js';
import { leafAt, memberAt, tablixHierarchy } from './tablixParts.js';

export type SetGroupExpressionCommand = Extract<RdlcCommand, { cmd: 'setGroupExpression' }>;
export type AddRowGroupCommand = Extract<RdlcCommand, { cmd: 'addRowGroup' }>;
export type DeleteRowGroupCommand = Extract<RdlcCommand, { cmd: 'deleteRowGroup' }>;

/**
 * Grupos de fila del Tablix (F2.b). El modelo RDL: un `TablixMember` con
 * `<Group>` es dinámico (se repite por valor de la expresión) y sus hojas son
 * filas del body.
 *
 * Decisiones (lecciones del ida/vuelta con Report Builder):
 * - Un grupo puede ser **hoja** (sin `TablixMembers`): es la fila de detalle que
 *   se repite (caso real: `Tablix7` de BC). Aquí cuenta como grupo, no como
 *   fila, y `deleteRowGroup` lo degrada a fila estática sin perder la fila.
 * - `addRowGroup` **envuelve** la fila elegida en el grupo nuevo (como RB al
 *   agrupar una fila de detalle) y **no toca `TablixHeader`**: no se crea
 *   cabecera ni se convierte ninguna en fila; si el miembro ya tenía cabecera,
 *   se conserva.
 * - `deleteRowGroup` quita el `<Group>` (y su ordenación) del miembro: las
 *   filas que cuelgan se quedan como filas estáticas y una `TablixHeader`
 *   existente se conserva (el miembro pasa a ser un contenedor estático con
 *   cabecera). Un `TablixCorner` no se toca (vive en el Tablix, no en el grupo).
 * - La ordenación (`SortExpressions`) del grupo espeja la expresión: al crearlo
 *   nace ordenado por ella y al editarla se sincroniza si espejaba la anterior
 *   (igual que RB).
 */

/* ------------------------- setGroupExpression ---------------------------- */

/**
 * Edita la expresión del grupo apuntado por `path`. El nombre del grupo no
 * cambia (las expresiones de ámbito `Sum(..., "Grupo")` lo referencian).
 */
export function applySetGroupExpression(
  ctx: CommandContext,
  command: SetGroupExpressionCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member, group } = found.value;

  const expressions = group.child('GroupExpressions');
  const existing = expressions?.children('GroupExpression') ?? [];
  if (existing.length > 1) {
    return left(
      CommandRejectedError.create(
        'El grupo tiene varias expresiones: edítalo desde el XML del informe',
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
  writeGroupExpression(group, expression, inverse);

  // La ordenación que espejaba la expresión anterior la sigue (como RB): si el
  // grupo ordenaba por otro campo, se respeta.
  if (previous !== undefined) {
    for (const sort of member.child('SortExpressions')?.children('SortExpression') ?? []) {
      const value = sort.child('Value');
      if (value?.text() !== previous) continue;
      inverse.push(setNodeTextChange({ node: value, value: previous }));
      value.setText(expression);
    }
  }

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
  const tablix = ctx.index.get(command.id);
  if (!tablix) return left(CommandRejectedError.create(`No existe el elemento '${command.id}'`));

  const hierarchy = tablix.child('TablixRowHierarchy');
  const rows = tablix.child('TablixBody')?.child('TablixRows')?.children('TablixRow') ?? [];
  if (!hierarchy?.child('TablixMembers')) {
    return left(
      CommandRejectedError.create(`El Tablix '${command.id}' no tiene jerarquía de filas`),
    );
  }
  if (command.row >= rows.length) {
    return left(
      CommandRejectedError.create(`La fila ${command.row} está fuera del Tablix '${command.id}'`),
    );
  }

  const expression = normalizedExpression(command.expression);
  if (expression === null) {
    return left(CommandRejectedError.create('La expresión del grupo no puede estar vacía'));
  }

  const leaf = leafAt(hierarchy, command.row);
  if (!leaf) {
    return left(
      CommandRejectedError.create(
        `La jerarquía del Tablix '${command.id}' no tiene miembro para la fila ${command.row}`,
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
  const sort = sorts.createElement('SortExpression');
  sort.appendChild(sort.createElement('Value', expression));
  sorts.appendChild(sort);
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

/* ---------------------------- deleteRowGroup ----------------------------- */

/**
 * Quita el grupo del miembro: se desprenden su `Group` y su `SortExpressions`
 * (la ordenación pertenece al grupo). Ni las filas ni la cabecera se tocan.
 */
export function applyDeleteRowGroup(
  ctx: CommandContext,
  command: DeleteRowGroupCommand,
): Either<DomainError, CommandOutcome> {
  const found = findGroup(ctx, command.id, command.axis, command.path);
  if (found.isLeft()) return left(found.value);
  const { member, group } = found.value;

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

/** Escribe la expresión del grupo (creando `GroupExpressions` si faltara). */
function writeGroupExpression(group: RdlcNode, expression: string, inverse: DomainCommand[]): void {
  const container = group.child('GroupExpressions');
  if (container) {
    const node = container.child('GroupExpression');
    if (node) {
      inverse.push(setNodeTextChange({ node, value: node.text() ?? '' }));
      node.setText(expression);
      return;
    }
    const created = container.createElement('GroupExpression', expression);
    container.appendChild(created);
    inverse.push({ cmd: 'removeNode', node: created });
    return;
  }

  const createdContainer = group.createElement('GroupExpressions');
  createdContainer.appendChild(createdContainer.createElement('GroupExpression', expression));
  group.insertChildAt(createdContainer, 0);
  inverse.push({ cmd: 'removeNode', node: createdContainer });
}

/** Expresión lista para el XML: recortada y con `=` (lo que espera RDL). */
function normalizedExpression(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '=') return null;
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
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
  for (let index = 1; taken.has(name); index += 1) name = `${base}${index}`;
  return name;
}

function collectScopeNames(root: RdlcNode): Set<string> {
  const names = new Set<string>();
  const walk = (node: RdlcNode): void => {
    if (node.tagName === 'Group' || node.tagName === 'DataSet') {
      const name = node.attribute('Name');
      if (name) names.add(name);
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
