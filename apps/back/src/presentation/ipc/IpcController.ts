import {
  IPC_CHANNELS,
  clipboardSourceRequestSchema,
  closeRequestSchema,
  createNewRequestSchema,
  droppedFileRequestSchema,
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
  type ListedSessionsResult,
  type OpenFileResult,
  type PendingOpenResult,
  type PickFileResult,
  type PickSavePathResult,
  type ReadProjectionResult,
  type RecentFilesResult,
  type SaveResult,
} from '@rdlc-designer/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
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
import type { AvailableFontsPort } from '../../application/ports/out/AvailableFontsPort.js';
import { AVAILABLE_FONTS_PORT } from '../../application/ports/out/AvailableFontsPort.js';
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
  /**
   * Rutas que el usuario eligió explícitamente: diálogos nativos, fichero de
   * arranque (CLI) o un fichero soltado sobre la ventana. `openFile`,
   * `createNew` y `saveAs` solo aceptan rutas de aquí (o recientes, al abrir):
   * un renderer comprometido no puede leer/escribir en cualquier ruta (BUG-50).
   */
  private readonly trustedPaths = new Set<string>();

  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: ISessionService,
    @Inject(COMMAND_SERVICE) private readonly commands: ICommandService,
    @Inject(AVAILABLE_FONTS_PORT) private readonly fonts: AvailableFontsPort,
    @Inject(RECENT_FILES_PORT) private readonly recents: RecentFilesPort,
  ) {}

  /** Fichero inicial (argumento de CLI) que el front consume al montar. */
  setPendingOpen(path: string | null): void {
    this.pendingOpen = path;
    if (path) this.trustPath(path);
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

    // Consumo único (BUG-29): una recarga del renderer (HMR, reload) no debe
    // volver a recibir el fichero de arranque y reabrirlo.
    ipcMain.handle(IPC_CHANNELS.pendingOpen, (): PendingOpenResult => {
      const path = this.pendingOpen;
      this.pendingOpen = null;
      return { ok: true, path };
    });

    // Sesiones vivas del backend: el front las re-adopta tras recargar la
    // interfaz (recuperación del ErrorBoundary, P0.1/BUG-51).
    ipcMain.handle(
      IPC_CHANNELS.listSessions,
      (): ListedSessionsResult => ({ ok: true, sessions: this.sessions.listSessions() }),
    );

    // Drop de ficheros: lo llama el preload con la ruta real del `File`
    // (`webUtils.getPathForFile`); el renderer no puede invocar este canal.
    ipcMain.handle(IPC_CHANNELS.registerDroppedFile, (_event, payload) =>
      this.handle(
        droppedFileRequestSchema,
        payload,
        async (req) => {
          this.trustPath(req.path);
          return right(undefined);
        },
        (): { ok: true } => ({ ok: true }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.listFonts, async (): Promise<FontListResult> => ({
      ok: true,
      fonts: await this.fonts.list(),
    }));

    ipcMain.handle(IPC_CHANNELS.openFile, (_event, payload) =>
      this.handle(
        openFileRequestSchema,
        payload,
        async (req) => {
          if (!(await this.isTrustedReadPath(req.path))) {
            return left(
              CommandRejectedError.create(
                `Ruta no autorizada para abrir: ${req.path} (usa «Abrir…», los recientes o arrastra el fichero)`,
              ),
            );
          }
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
          if (!this.isTrustedWritePath(req.path)) {
            return left(
              CommandRejectedError.create(
                `Ruta no autorizada para crear el informe: ${req.path} (usa el diálogo de guardado)`,
              ),
            );
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
          ...(value.warning ? { warning: value.warning } : {}),
        }),
      ),
    );

    ipcMain.handle(IPC_CHANNELS.saveAs, (_event, payload) =>
      this.handle(
        saveAsRequestSchema,
        payload,
        async (req) => {
          if (!this.isTrustedWritePath(req.path)) {
            return left(
              CommandRejectedError.create(
                `Ruta no autorizada para guardar: ${req.path} (usa el diálogo de guardado)`,
              ),
            );
          }
          const result = await this.sessions.saveAs(req.sessionId, req.path);
          if (result.isRight()) await this.recents.add(req.path);
          return result;
        },
        (value: SaveSessionResult): SaveResult => ({
          ok: true,
          path: value.path,
          bytesIdentical: value.bytesIdentical,
          ...(value.warning ? { warning: value.warning } : {}),
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

    // Proyección vigente sin recargar del disco: el front deshace con ella el
    // optimismo de un comando rechazado (BUG-31).
    ipcMain.handle(IPC_CHANNELS.readProjection, (_event, payload) =>
      this.handle(
        sessionRequestSchema,
        payload,
        async (req) => this.sessions.projectionOf(req.sessionId),
        (value): ReadProjectionResult => ({ ok: true, projection: value }),
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

  /** Autoriza una ruta para operaciones de fichero (diálogo, CLI, drop). */
  private trustPath(path: string): void {
    this.trustedPaths.add(resolve(path));
  }

  /** Ruta para leer/escribir que salió de un diálogo nativo de esta ventana. */
  private isTrustedWritePath(path: string): boolean {
    return this.trustedPaths.has(resolve(path));
  }

  /**
   * Para abrir también valen los recientes: son rutas que ya se abrieron con
   * diálogo y las sirve el backend, no el renderer.
   */
  private async isTrustedReadPath(path: string): Promise<boolean> {
    if (this.isTrustedWritePath(path)) return true;
    const wanted = resolve(path);
    const recents = await this.recents.list();
    return recents.some((recent) => resolve(recent) === wanted);
  }

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
      title: 'Abrir informe RDL/RDLC',
      properties: ['openFile'],
      filters: [{ name: 'Informes RDL/RDLC', extensions: ['rdlc', 'rdl'] }],
    };
    const window = this.getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const path = result.canceled ? undefined : result.filePaths[0];
    if (path) this.trustPath(path);
    return { ok: true, path: path ?? null };
  }

  private async pickSavePath(defaultPath?: string): Promise<PickSavePathResult> {
    const options: SaveDialogOptions = {
      title: 'Guardar informe RDL/RDLC',
      ...(defaultPath ? { defaultPath } : {}),
      filters: [{ name: 'Informes RDL/RDLC', extensions: ['rdlc', 'rdl'] }],
    };
    const window = this.getWindow();
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    // La ruta que devuelve el diálogo queda autorizada para `createNew`/`saveAs`.
    const path = result.canceled ? null : (result.filePath ?? null);
    if (path) this.trustPath(path);
    return { ok: true, path };
  }
}
