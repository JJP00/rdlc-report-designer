import { describe, expect, it } from 'vitest';
import type { TablixMemberDto } from '@rdlc-designer/contracts';
import {
  groupPropertiesCommands,
  groupPropertiesDraft,
  isGroupPropertiesValid,
  newExpressionDraft,
  newSortDraft,
  variableForExpression,
  type GroupPropertiesDraft,
} from './groupProperties';

/**
 * F2.b.2 · borradores del diálogo «Propiedades del grupo» y su traducción a
 * comandos (solo las secciones que cambiaron). Los `id` de los borradores son
 * identidad de UI: las comparaciones usan solo el contenido.
 */

const MEMBER: TablixMemberDto = {
  path: [2],
  name: 'LineNo',
  expression: '=Fields!LineNo_Line.Value',
  total: 'none',
  hidden: '=Fields!BTCJobNo.Value <> ""',
  sortExpressions: [
    { value: '=Fields!LineNo_Line.Value' },
    { value: '=Fields!B.Value', direction: 'Descending' },
  ],
  pageBreaks: ['Between', 'End'],
  toggleItem: 'Textbox1',
  children: [],
};

/** Contenido del borrador sin los `id` de UI. */
function content(draft: GroupPropertiesDraft): unknown {
  return {
    expressions: draft.expressions.map((row) => row.expression),
    pageBreaks: draft.pageBreaks,
    sorting: draft.sorting.map(({ expression, direction }) => ({ expression, direction })),
    hidden: draft.hidden,
    toggleItem: draft.toggleItem,
  };
}

describe('groupProperties · borrador', () => {
  it('parte del miembro proyectado (dirección ausente = ascendente)', () => {
    expect(content(groupPropertiesDraft(MEMBER))).toEqual({
      expressions: ['=Fields!LineNo_Line.Value'],
      pageBreaks: { between: true, start: false, end: true },
      sorting: [
        { expression: '=Fields!LineNo_Line.Value', direction: 'Ascending' },
        { expression: '=Fields!B.Value', direction: 'Descending' },
      ],
      hidden: '=Fields!BTCJobNo.Value <> ""',
      toggleItem: 'Textbox1',
    });
  });
});

describe('groupProperties · comandos', () => {
  it('no manda nada si no cambió nada', () => {
    const draft = groupPropertiesDraft(MEMBER);
    expect(groupPropertiesCommands('T', 'row', MEMBER.path, draft, draft)).toEqual([]);
  });

  it('manda un comando por sección cambiada', () => {
    const before = groupPropertiesDraft(MEMBER);
    const after: GroupPropertiesDraft = {
      ...before,
      expressions: [newExpressionDraft('=Fields!Other.Value')],
      pageBreaks: { between: false, start: true, end: false },
      sorting: [{ ...before.sorting[0]!, expression: '=Fields!A.Value', direction: 'Descending' }],
      hidden: true,
      toggleItem: null,
    };

    expect(groupPropertiesCommands('T', 'row', MEMBER.path, before, after)).toEqual([
      {
        cmd: 'setGroupExpressions',
        id: 'T',
        axis: 'row',
        path: [2],
        expressions: ['=Fields!Other.Value'],
      },
      {
        cmd: 'setGroupPageBreaks',
        id: 'T',
        axis: 'row',
        path: [2],
        between: false,
        start: true,
        end: false,
      },
      {
        cmd: 'setGroupSorting',
        id: 'T',
        axis: 'row',
        path: [2],
        sorts: [{ expression: '=Fields!A.Value', direction: 'Descending' }],
      },
      { cmd: 'setMemberVisibility', id: 'T', axis: 'row', path: [2], hidden: true },
      { cmd: 'setMemberToggleItem', id: 'T', axis: 'row', path: [2], item: null },
    ]);
  });

  it('detecta cambios de orden y de visibilidad por separado', () => {
    const before = groupPropertiesDraft(MEMBER);
    const moved: GroupPropertiesDraft = { ...before, sorting: [...before.sorting].reverse() };
    expect(groupPropertiesCommands('T', 'row', [2], before, moved).map((cmd) => cmd.cmd)).toEqual([
      'setGroupSorting',
    ]);
    expect(
      groupPropertiesCommands('T', 'row', [2], before, { ...before, toggleItem: null }).map(
        (cmd) => cmd.cmd,
      ),
    ).toEqual(['setMemberToggleItem']);
  });
});

describe('groupProperties · validación', () => {
  it('exige expresiones y ordenaciones completas', () => {
    const empty = groupPropertiesDraft({ path: [0], total: 'none', children: [] });
    expect(isGroupPropertiesValid(empty)).toBe(false);
    expect(
      isGroupPropertiesValid({ ...empty, expressions: [newExpressionDraft('=Fields!A.Value')] }),
    ).toBe(true);
    expect(isGroupPropertiesValid({ ...empty, expressions: [newExpressionDraft('=')] })).toBe(
      false,
    );
    expect(
      isGroupPropertiesValid({
        ...empty,
        expressions: [newExpressionDraft('=Fields!A.Value')],
        sorting: [{ ...newSortDraft(), expression: ' ' }],
      }),
    ).toBe(false);
  });
});

describe('groupProperties · variables', () => {
  it('encuentra la variable cuya expresión coincide exactamente', () => {
    const entries = [{ group: 'Campos (Fields!)', name: 'A', expression: '=Fields!A.Value' }];
    expect(variableForExpression(entries, '=Fields!A.Value')?.name).toBe('A');
    expect(variableForExpression(entries, '=Fields!B.Value')).toBeUndefined();
  });
});
