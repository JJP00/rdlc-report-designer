import type { RdlcCommand } from '@rdlc-designer/contracts';
import { left, right } from '../../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../../shared/domainError.js';
import type { Either } from '../../../shared/either.js';
import type { CommandContext, CommandOutcome, DomainCommand } from './CommandContext.js';
import { applyDeleteItem } from './deleteItem.js';
import { applyDuplicateItem } from './duplicateItem.js';
import { applyInsertItem } from './insertItem.js';
import { applyInsertClone } from './insertClone.js';
import { applySetLocation } from './setLocation.js';
import { applySetBounds } from './setBounds.js';
import { applyResizeColumn, applyResizeRow, applyResizeTable } from './resizeTablix.js';
import {
  applyAddColumn,
  applyAddRow,
  applyDeleteColumn,
  applyDeleteColumns,
  applyDeleteRow,
  applyDeleteRows,
  applyMergeCells,
  applyUnmergeCells,
} from './tablixStructure.js';
import { applySetPageMargins } from './setPageMargins.js';
import { applySetPageSize } from './setPageSize.js';
import { applySetParagraphs } from './setParagraphs.js';
import { applySetImageOptions } from './setImageOptions.js';
import { applySetReportCode } from './setReportCode.js';
import { applySetSize } from './setSize.js';
import { applySetStyle } from './setStyle.js';
import { applySetText } from './setText.js';

/**
 * Dispatcher de comandos del dominio (públicos y los internos del journal).
 * Si un comando no está implementado todavía se rechaza explícitamente
 * (nunca se ignora en silencio).
 */
export function applyCommand(
  ctx: CommandContext,
  command: DomainCommand,
): Either<DomainError, CommandOutcome> {
  switch (command.cmd) {
    case 'setLocation':
      return applySetLocation(ctx, command);
    case 'setSize':
      return applySetSize(ctx, command);
    case 'setBounds':
      return applySetBounds(ctx, command);
    case 'resizeTable':
      return applyResizeTable(ctx, command);
    case 'resizeColumn':
      return applyResizeColumn(ctx, command);
    case 'resizeRow':
      return applyResizeRow(ctx, command);
    case 'addRow':
      return applyAddRow(ctx, command);
    case 'deleteRow':
      return applyDeleteRow(ctx, command);
    case 'addColumn':
      return applyAddColumn(ctx, command);
    case 'deleteColumn':
      return applyDeleteColumn(ctx, command);
    case 'deleteRows':
      return applyDeleteRows(ctx, command);
    case 'deleteColumns':
      return applyDeleteColumns(ctx, command);
    case 'mergeCells':
      return applyMergeCells(ctx, command);
    case 'unmergeCells':
      return applyUnmergeCells(ctx, command);
    case 'setText':
      return applySetText(ctx, command);
    case 'setParagraphs':
      return applySetParagraphs(ctx, command);
    case 'setStyle':
      return applySetStyle(ctx, command);
    case 'setPageSize':
      return applySetPageSize(ctx, command);
    case 'setPageMargins':
      return applySetPageMargins(ctx, command);
    case 'setReportCode':
      return applySetReportCode(ctx, command);
    case 'setImageOptions':
      return applySetImageOptions(ctx, command);
    case 'insertItem':
      return applyInsertItem(ctx, command);
    case 'duplicateItem':
      return applyDuplicateItem(ctx, command);
    case 'deleteItem':
      return applyDeleteItem(ctx, command);

    /* ------------------- internos del journal (undo) ------------------- */

    case 'removeNode': {
      command.node.remove();
      return right({ inverse: [] });
    }
    case 'restoreNode': {
      command.container.insertChildAt(command.node, command.index);
      return right({ inverse: [{ cmd: 'removeNode', node: command.node }] });
    }
    case 'setNodeText': {
      command.node.setText(command.value);
      return right({ inverse: [] });
    }
    case 'insertClone':
      return applyInsertClone(ctx, command);

    default:
      return left(
        CommandRejectedError.create(`Comando no implementado: '${(command as RdlcCommand).cmd}'`),
      );
  }
}
