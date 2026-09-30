import {
  IPC_CHANNELS,
  clipboardSourceRequestSchema,
  closeRequestSchema,
  createNewRequestSchema,
  executeCommandRequestSchema,
  openFileRequestSchema,
  pasteRequestSchema,
  pickSavePathRequestSchema,
  saveAsRequestSchema,
  sessionRequestSchema,
  type CloseResult,
  type CommandResult,
  type FontListResult,
  type IpcErrorDto,
  type OpenFileResult,
  type PendingOpenResult,
  type PickFileResult,
  type PickSavePathResult,
  type RecentFilesResult,
  type SaveResult,
} from '@rdlc-designer/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import type { ZodType } from 'zod';
import {
  COMMAND_SERVICE,
  type ICommandService,
} from '../../application/services/ICommandService.js';
import type {
  ISessionService,
  OpenSessionResult,
  SaveSessionResult,
} from '../../application/services/ISessionService.js';
import { SESSION_SERVICE } from '../../application/services/ISessionService.js';
import type { SystemFontsPort } from '../../application/ports/out/SystemFontsPort.js';
import { SYSTEM_FONTS_PORT } from '../../application/ports/out/SystemFontsPort.js';
import type { CloseSessionResult } from '../../application/services/ISessionService.js';
import type { RecentFilesPort } from '../../application/ports/out/RecentFilesPort.js';
import { RECENT_FILES_PORT } from '../../application/ports/out/RecentFilesPort.js';
import { left, right, type Either } from '../../shared/either.js';
import { CommandRejectedError, type DomainError } from '../../shared/domainError.js';
import { toIpcError, unexpectedToIpcError } from './ipcErrorMapper.js';

/**
 * Adaptador de entrada del hexágono: `ipcMain.handle` → zod → caso de uso →
 * DTO. Fino a propósito: validar, llamar, mapear, mapear errores.
 */
@Injectable()
export class IpcController {
  private getWindow: () => BrowserWindow | null = () => null;
  private pendingOpen: string | null = null;

  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: ISessionService,
    @Inject(COMMAND_SERVICE) private readonly commands: ICommandService,
    @Inject(SYSTEM_FONTS_PORT) private readonly fonts: SystemFontsPort,
    @Inject(RECENT_FILES_PORT) private readonly recents: RecentFilesPort,
  ) {}

  /** Fichero inicial (argumento de CLI) que el front consume al montar. */
  setPendingOpen(path: string | null): void {
    this.pendingOpen = path;
  }

  register(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;

    ipcMain.handle(IPC_CHANNELS.pickFile, () => this.pickFile());

    ipcMain.handle(IPC_CHANNELS.pickSavePath, (_event, payload) =>
      this.handle(
        pickSavePathRequestSchema,
        payload,
        async (req) => right(await this.pickSavePath(req.defaultPath)),
        (value: PickSavePathResult): PickSavePathResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.pendingOpen, (): PendingOpenResult => ({
      ok: true,
      path: this.pendingOpen,
    }));

    ipcMain.handle(IPC_CHANNELS.listFonts, async (): Promise<FontListResult> => ({
      ok: true,
      fonts: await this.fonts.list(),
    }));

    ipcMain.handle(IPC_CHANNELS.openFile, (_event, payload) =>
      this.handle(
        openFileRequestSchema,
        payload,
        async (req) => {
          const result = await this.sessions.open(req.path);
          if (result.isRight()) await this.recents.add(req.path);
          return result;
        },
        (value: OpenSessionResult): OpenFileResult => ({
          ok: true,
          sessionId: value.sessionId,
          projection: value.projection,
          ...(value.warnings ? { warnings: value.warnings } : {}),
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.createNew, (_event, payload) =>
      this.handle(
        createNewRequestSchema,
        payload,
        async (req) => {
          if (!req.path) {
            return left(CommandRejectedError.create('Falta la ruta del informe nuevo'));
          }
          const result = await this.sessions.createNew(req.path);
          if (result.isRight()) await this.recents.add(req.path);
          return result;
        },
        (value: OpenSessionResult): OpenFileResult => ({
          ok: true,
          sessionId: value.sessionId,
          projection: value.projection,
          ...(value.warnings ? { warnings: value.warnings } : {}),
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.save, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        (req) => this.sessions.save(req.sessionId),
        (value: SaveSessionResult): SaveResult => ({
          ok: true,
          path: value.path,
          bytesIdentical: value.bytesIdentical,
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.saveAs, (_event, payload) =>
      this.handle(
        saveAsRequestSchema,
        payload,
        async (req) => {
          const result = await this.sessions.saveAs(req.sessionId, req.path);
          if (result.isRight()) await this.recents.add(req.path);
          return result;
        },
        (value: SaveSessionResult): SaveResult => ({
          ok: true,
          path: value.path,
          bytesIdentical: value.bytesIdentical,
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.reloadFile, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        (req) => this.sessions.reload(req.sessionId),
        (value: OpenSessionResult): OpenFileResult => ({
          ok: true,
          sessionId: value.sessionId,
          projection: value.projection,
          ...(value.warnings ? { warnings: value.warnings } : {}),
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.recentFiles, async (): Promise<RecentFilesResult> => ({
      ok: true,
      files: await this.recents.list(),
    }));

    ipcMain.handle(IPC_CHANNELS.close, (_event, payload) =>
      this.handle(
        closeRequestSchema,
        payload,
        async (req) => {
          const result = await this.sessions.close(req.sessionId, { force: req.force === true });
          if (result.isRight() && result.value.closed) this.commands.drop(req.sessionId);
          return result;
        },
        (value: CloseSessionResult): CloseResult =>
          value.closed ? { ok: true } : { ok: false, needsConfirmation: true, dirty: true },
      ),
    );

    ipcMain.handle(IPC_CHANNELS.executeCommand, (_event, payload) =>
      this.handle(
        executeCommandRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.execute(req.sessionId, req.command)),
        (value: CommandResult): CommandResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.undo, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.undo(req.sessionId)),
        (value: CommandResult): CommandResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.redo, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.redo(req.sessionId)),
        (value: CommandResult): CommandResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.copy, (_event, payload) =>
      this.handle(
        clipboardSourceRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.copy(req.sessionId, req.ids)),
        (value: CommandResult): CommandResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.cut, (_event, payload) =>
      this.handle(
        clipboardSourceRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.cut(req.sessionId, req.ids)),
        (value: CommandResult): CommandResult => value,
      ),
    );

    ipcMain.handle(IPC_CHANNELS.paste, (_event, payload) =>
      this.handle(
        pasteRequestSchema,
        payload,
        (req) => Promise.resolve(this.commands.paste(req.sessionId, req.scope, req.index)),
        (value: CommandResult): CommandResult => value,
      ),
    );
  }

  /* ------------------------------ helpers ------------------------------- */

  private async handle<Req, T, R>(
    schema: ZodType<Req>,
    payload: unknown,
    useCase: (req: Req) => Promise<Either<DomainError, T>>,
    toResult: (value: T) => R,
  ): Promise<R | IpcErrorDto> {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'E_INVALID_COMMAND',
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(payload)'}: ${issue.message}`)
          .join('; '),
      };
    }

    try {
      const result = await useCase(parsed.data);
      return result.isRight() ? toResult(result.value) : toIpcError(result.value);
    } catch (error) {
      return unexpectedToIpcError(error);
    }
  }

  private async pickFile(): Promise<PickFileResult> {
    const options: OpenDialogOptions = {
      title: 'Abrir layout RDLC',
      properties: ['openFile'],
      filters: [{ name: 'Informes RDLC', extensions: ['rdlc'] }],
    };
    const window = this.getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const path = result.canceled ? undefined : result.filePaths[0];
    return { ok: true, path: path ?? null };
  }

  private async pickSavePath(defaultPath?: string): Promise<PickSavePathResult> {
    const options: SaveDialogOptions = {
      title: 'Guardar informe RDLC',
      ...(defaultPath ? { defaultPath } : {}),
      filters: [{ name: 'Informes RDLC', extensions: ['rdlc'] }],
    };
    const window = this.getWindow();
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    return { ok: true, path: result.canceled ? null : (result.filePath ?? null) };
  }
}
