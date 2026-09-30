import type { RdlcCommand, TablixMemberDto } from '@rdlc-designer/contracts';
import type { VariableEntry } from './variables';

/**
 * Borradores del diálogo «Propiedades del grupo» (F2.b.2): lo que se edita en
 * las pestañas General / Saltos de página / Ordenación / Visibilidad, y la
 * traducción a comandos (solo lo que cambió, un comando por sección).
 */

export interface GroupExpressionDraft {
  /** Identidad de UI (clave de React); no viaja a los comandos. */
  id: string;
  expression: string;
}

export interface GroupSortDraft {
  /** Identidad de UI (clave de React); no viaja a los comandos. */
  id: string;
  expression: string;
  direction: 'Ascending' | 'Descending';
}

export interface GroupPageBreakDraft {
  between: boolean;
  start: boolean;
  end: boolean;
}

export interface GroupPropertiesDraft {
  /** Nombre del grupo (`Group > @Name`); editable desde G11. */
  name: string;
  expressions: GroupExpressionDraft[];
  pageBreaks: GroupPageBreakDraft;
  sorting: GroupSortDraft[];
  /** `null` = sin declaración (visible); `true`/expresión = oculto. */
  hidden: boolean | string | null;
  /** `null` = sin `ToggleItem`. */
  toggleItem: string | null;
}

/** Expresión lista para RDL (`=…`); `null` si está vacía. */
export function ensureExpression(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '=') return null;
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

/** Fila nueva de expresión para el borrador (Group on / And on). */
export function newExpressionDraft(expression: string): GroupExpressionDraft {
  return { id: crypto.randomUUID(), expression };
}

/** Fila nueva de ordenación para el borrador. */
export function newSortDraft(): GroupSortDraft {
  return { id: crypto.randomUUID(), expression: '', direction: 'Ascending' };
}

/** Estado inicial del diálogo a partir del miembro proyectado. */
export function groupPropertiesDraft(member: TablixMemberDto): GroupPropertiesDraft {
  return {
    name: member.name ?? '',
    expressions: [newExpressionDraft(member.expression ?? '')],
    pageBreaks: {
      between: member.pageBreaks?.includes('Between') ?? false,
      start: member.pageBreaks?.includes('Start') ?? false,
      end: member.pageBreaks?.includes('End') ?? false,
    },
    sorting: (member.sortExpressions ?? []).map((sort) => ({
      id: crypto.randomUUID(),
      expression: sort.value,
      direction: sort.direction ?? 'Ascending',
    })),
    hidden: member.hidden ?? null,
    toggleItem: member.toggleItem ?? null,
  };
}

/**
 * Comandos para pasar del borrador inicial al editado: **solo las secciones que
 * cambiaron** (cada una es un paso de undo independiente).
 */
export function groupPropertiesCommands(
  tablixId: string,
  axis: 'row' | 'column',
  path: number[],
  before: GroupPropertiesDraft,
  after: GroupPropertiesDraft,
): RdlcCommand[] {
  const commands: RdlcCommand[] = [];

  if (after.name.trim() !== '' && after.name !== before.name) {
    commands.push({ cmd: 'setGroupName', id: tablixId, axis, path, name: after.name.trim() });
  }

  if (!sameExpressions(before.expressions, after.expressions)) {
    commands.push({
      cmd: 'setGroupExpressions',
      id: tablixId,
      axis,
      path,
      expressions: after.expressions.map((row) => row.expression),
    });
  }

  if (!samePageBreaks(before.pageBreaks, after.pageBreaks)) {
    commands.push({ cmd: 'setGroupPageBreaks', id: tablixId, axis, path, ...after.pageBreaks });
  }

  if (!sameSorting(before.sorting, after.sorting)) {
    commands.push({
      cmd: 'setGroupSorting',
      id: tablixId,
      axis,
      path,
      sorts: after.sorting.map((sort) => ({
        expression: sort.expression,
        direction: sort.direction,
      })),
    });
  }

  if (before.hidden !== after.hidden) {
    commands.push({ cmd: 'setMemberVisibility', id: tablixId, axis, path, hidden: after.hidden });
  }

  if (before.toggleItem !== after.toggleItem) {
    commands.push({
      cmd: 'setMemberToggleItem',
      id: tablixId,
      axis,
      path,
      item: after.toggleItem,
    });
  }

  return commands;
}

/** true si el borrador se puede aplicar (nombre, expresiones y ordenación). */
export function isGroupPropertiesValid(draft: GroupPropertiesDraft): boolean {
  return (
    draft.name.trim() !== '' &&
    draft.expressions.length > 0 &&
    draft.expressions.every((row) => isUsableExpression(row.expression)) &&
    draft.sorting.every((sort) => isUsableExpression(sort.expression))
  );
}

/** Variable del informe cuya expresión es exactamente esta (o `undefined`). */
export function variableForExpression(
  entries: VariableEntry[],
  expression: string,
): VariableEntry | undefined {
  return entries.find((entry) => entry.expression === expression);
}

function isUsableExpression(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed !== '=';
}

function sameExpressions(a: GroupExpressionDraft[], b: GroupExpressionDraft[]): boolean {
  return a.length === b.length && a.every((row, index) => row.expression === b[index]?.expression);
}

function samePageBreaks(a: GroupPageBreakDraft, b: GroupPageBreakDraft): boolean {
  return a.between === b.between && a.start === b.start && a.end === b.end;
}

function sameSorting(a: GroupSortDraft[], b: GroupSortDraft[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (sort, index) =>
        sort.expression === b[index]?.expression && sort.direction === b[index]?.direction,
    )
  );
}
