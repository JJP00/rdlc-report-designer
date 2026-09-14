import {
  IPC_CHANNELS,
  executeCommandRequestSchema,
  openFileRequestSchema,
  sessionRequestSchema,
  type CloseResult,
  type CommandResult,
  type IpcErrorDto,
  type OpenFileResult,
  type PickFileResult,
  type SaveResult,
} from '@rdlc-designer/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type { ZodType } from 'zod';
import { COMMAND_SERVICE, type ICommandService } from '../../application/services/ICommandService.js';
import type {
  ISessionService,
  OpenSessionResult,
  SaveSessionResult,
} from '../../application/services/ISessionService.js';
import { SESSION_SERVICE } from '../../application/services/ISessionService.js';
import type { Either } from '../../shared/either.js';
import type { DomainError } from '../../shared/domainError.js';
import { toIpcError, unexpectedToIpcError } from './ipcErrorMapper.js';

/**
 * Adaptador de entrada del hexágono: `ipcMain.handle` → zod → caso de uso →
 * DTO. Fino a propósito: validar, llamar, mapear, mapear errores.
 */
@Injectable()
export class IpcController {
  private getWindow: () => BrowserWindow | null = () => null;

  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: ISessionService,
    @Inject(COMMAND_SERVICE) private readonly commands: ICommandService,
  ) {}

  register(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;

    ipcMain.handle(IPC_CHANNELS.pickFile, () => this.pickFile());

    ipcMain.handle(IPC_CHANNELS.openFile, (_event, payload) =>
      this.handle(
        openFileRequestSchema,
        payload,
        (req) => this.sessions.open(req.path),
        (value: OpenSessionResult): OpenFileResult => ({
          ok: true,
          sessionId: value.sessionId,
          projection: value.projection,
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

    ipcMain.handle(IPC_CHANNELS.close, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        async (req) => {
          const result = await this.sessions.close(req.sessionId);
          if (result.isRight()) this.commands.drop(req.sessionId);
          return result;
        },
        (): CloseResult => ({ ok: true }),
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
}
