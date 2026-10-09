import { z } from 'zod';
import { commandSchema, scopeRefSchema } from './commands.js';
import type { ItemDto } from './projection.js';
import { projectionSchema } from './projection.js';

/** Canales `ipcMain.handle` / `ipcRenderer.invoke`. */
export const IPC_CHANNELS = {
  pickFile: 'rdlc:pickFile',
  /** Diálogo nativo de guardado (para «Guardar como…» y «Nuevo…»). */
  pickSavePath: 'rdlc:pickSavePath',
  /** Fichero con el que se arrancó la app (CLI/argumento), si lo hay. */
  pendingOpen: 'rdlc:pendingOpen',
  /**
   * Solo preload → main: registra la ruta de un fichero soltado sobre la
   * ventana para que `openFile` la acepte. No se expone en `window.api`.
   */
  registerDroppedFile: 'rdlc:registerDroppedFile',
  /** Fuentes instaladas en el sistema (para la barra de formato). */
  listFonts: 'rdlc:listFonts',
  openFile: 'rdlc:openFile',
  createNew: 'rdlc:createNew',
  save: 'rdlc:save',
  saveAs: 'rdlc:saveAs',
  /** Recarga desde disco descartando los cambios locales (diálogo de conflicto). */
  reloadFile: 'rdlc:reloadFile',
  /**
   * Proyección **vigente** de la sesión, sin tocar el documento ni recargar del
   * disco: el front la pide para deshacer el optimismo de un comando rechazado.
   */
  readProjection: 'rdlc:readProjection',
  /** Ficheros abiertos recientemente (para el desplegable de «Abrir…»). */
  recentFiles: 'rdlc:recentFiles',
  /** El renderer confirma (o cancela) el cierre de la ventana pedido por el SO. */
  confirmWindowClose: 'rdlc:confirmWindowClose',
  /**
   * El renderer está **vivo** y atendiendo la petición de cierre (P0.1): el
   * main cancela su vigilante; si no llega a tiempo, ofrece cerrar sin guardar.
   */
  acknowledgeCloseRequest: 'rdlc:acknowledgeCloseRequest',
  /** Sesiones vivas del backend (re-adopción tras recargar la interfaz, P0.1). */
  listSessions: 'rdlc:listSessions',
  close: 'rdlc:close',
  executeCommand: 'rdlc:executeCommand',
  undo: 'rdlc:undo',
  redo: 'rdlc:redo',
  copy: 'rdlc:copy',
  cut: 'rdlc:cut',
  paste: 'rdlc:paste',
} as const;
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Eventos backend → front vía `webContents.send`. */
export const IPC_EVENTS = {
  projectionReady: 'rdlc:evt:projectionReady',
  documentChanged: 'rdlc:evt:documentChanged',
  dirtyChanged: 'rdlc:evt:dirtyChanged',
  conflictDetected: 'rdlc:evt:conflictDetected',
  saved: 'rdlc:evt:saved',
  sessionClosed: 'rdlc:evt:sessionClosed',
  /** El SO quiere cerrar la ventana: el front decide (guardas de cambios). */
  closeRequested: 'rdlc:evt:closeRequested',
  /** El fichero de la sesión desapareció o volvió al disco (BUG-55). */
  fileMissingChanged: 'rdlc:evt:fileMissingChanged',
  /** Cambio externo que no se pudo recargar y la sesión no tenía cambios (BUG-53). */
  externalReloadFailed: 'rdlc:evt:externalReloadFailed',
} as const;
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

/* ----------------------------- Errores ---------------------------------- */

export const ERROR_CODES = [
  'E_INVALID_COMMAND',
  'E_COMMAND_REJECTED',
  'E_CONFLICT',
  'E_VALIDATION',
  'E_NOT_FOUND',
  'E_INVALID_XML',
  'E_UNSUPPORTED_SCHEMA',
  'E_IO',
  'E_UNEXPECTED',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/* --------------------- Peticiones (front → backend) ---------------------- */

export const openFileRequestSchema = z.object({ path: z.string().min(1) }).strict();
export type OpenFileRequest = z.infer<typeof openFileRequestSchema>;

/** Drop de un fichero real sobre la ventana (lo registra el preload, BUG-50). */
export const droppedFileRequestSchema = z.object({ path: z.string().min(1) }).strict();
export type DroppedFileRequest = z.infer<typeof droppedFileRequestSchema>;

export const createNewRequestSchema = z.object({ path: z.string().min(1).optional() }).strict();
export type CreateNewRequest = z.infer<typeof createNewRequestSchema>;

/** Diálogo nativo de guardado: `defaultPath` propone el nombre/ruta actual. */
export const pickSavePathRequestSchema = z
  .object({ defaultPath: z.string().min(1).optional() })
  .strict();
export type PickSavePathRequest = z.infer<typeof pickSavePathRequestSchema>;

/** El renderer confirma o cancela el cierre de ventana pedido por el SO. */
export const windowCloseConfirmationSchema = z.object({ proceed: z.boolean() }).strict();
export type WindowCloseConfirmation = z.infer<typeof windowCloseConfirmationSchema>;

export const sessionRequestSchema = z.object({ sessionId: z.string().min(1) }).strict();
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const saveAsRequestSchema = z
  .object({ sessionId: z.string().min(1), path: z.string().min(1) })
  .strict();
export type SaveAsRequest = z.infer<typeof saveAsRequestSchema>;

export const closeRequestSchema = z
  .object({ sessionId: z.string().min(1), force: z.boolean().optional() })
  .strict();
export type CloseRequest = z.infer<typeof closeRequestSchema>;

export const executeCommandRequestSchema = z
  .object({ sessionId: z.string().min(1), command: commandSchema })
  .strict();
export type ExecuteCommandRequest = z.infer<typeof executeCommandRequestSchema>;

/** Copiar/cortar: identifican los items origen (multiselección en orden). */
export const clipboardSourceRequestSchema = z
  .object({ sessionId: z.string().min(1), ids: z.array(z.string().min(1)).min(1) })
  .strict();
export type ClipboardSourceRequest = z.infer<typeof clipboardSourceRequestSchema>;

/** Pegar: destino (scope + posición) del contenido del portapapeles. */
export const pasteRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    scope: scopeRefSchema,
    index: z.number().int().nonnegative(),
  })
  .strict();
export type PasteRequest = z.infer<typeof pasteRequestSchema>;

/* ---------------------- Respuestas (backend → front) --------------------- */

/** Respuesta de error uniforme: nunca cruzan excepciones crudas por IPC. */
export const ipcErrorSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  message: z.string().optional(),
  data: z.unknown().optional(),
});
export type IpcErrorDto = z.infer<typeof ipcErrorSchema>;

export const commandOkSchema = z.object({
  ok: z.literal(true),
  /** Id nuevo al insertar. */
  id: z.string().optional(),
  /** Ids creados por un `batch` (duplicar/pegar varios): selección múltiple. */
  ids: z.array(z.string()).optional(),
  /** Valores normalizados por el dominio (uno o varios elementos). */
  applied: z
    .array(z.object({ id: z.string(), values: z.record(z.string(), z.unknown()) }))
    .optional(),
  version: z.number().int().nonnegative().optional(),
});

export const commandResultSchema = z.discriminatedUnion('ok', [commandOkSchema, ipcErrorSchema]);
export type CommandResult = z.infer<typeof commandResultSchema>;

export const pickFileResultSchema = z.object({
  ok: z.literal(true),
  path: z.string().nullable(),
});
export type PickFileResult = z.infer<typeof pickFileResultSchema>;

/** Resultado del diálogo nativo de guardado (`path: null` si se cancela). */
export const pickSavePathResultSchema = z.object({
  ok: z.literal(true),
  path: z.string().nullable(),
});
export type PickSavePathResult = z.infer<typeof pickSavePathResultSchema>;

/** Ficheros recientes (los que ya no existen en disco se descartan al listar). */
export const recentFilesResultSchema = z.object({
  ok: z.literal(true),
  files: z.array(z.string()),
});
export type RecentFilesResult = z.infer<typeof recentFilesResultSchema>;

/** Fichero inicial pasado a la app (argumento de línea de comandos). */
export const pendingOpenResultSchema = z.object({
  ok: z.literal(true),
  path: z.string().nullable(),
});
export type PendingOpenResult = z.infer<typeof pendingOpenResultSchema>;

/** Fuentes instaladas en el sistema. */
export const fontListResultSchema = z.object({
  ok: z.literal(true),
  fonts: z.array(z.string()),
});
export type FontListResult = z.infer<typeof fontListResultSchema>;

export const openFileResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    sessionId: z.string(),
    projection: projectionSchema,
    /** Avisos de validación de esquema al importar (no bloquean). */
    warnings: z.array(z.string()).optional(),
  }),
  ipcErrorSchema,
]);
export type OpenFileResult = z.infer<typeof openFileResultSchema>;

/** Proyección vigente de la sesión (resincronización tras un rechazo). */
export const readProjectionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), projection: projectionSchema }),
  ipcErrorSchema,
]);
export type ReadProjectionResult = z.infer<typeof readProjectionResultSchema>;

export const saveResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    path: z.string(),
    /** true si el fichero no se tocó y se re-escribieron los mismos bytes. */
    bytesIdentical: z.boolean(),
    /**
     * Aviso no bloqueante tras un guardado correcto (p. ej. «guardado, pero no
     * se vigilan cambios externos», BUG-56).
     */
    warning: z.string().optional(),
  }),
  ipcErrorSchema,
]);
export type SaveResult = z.infer<typeof saveResultSchema>;

export const closeResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), needsConfirmation: z.literal(true), dirty: z.literal(true) }),
  ipcErrorSchema,
]);
export type CloseResult = z.infer<typeof closeResultSchema>;

/* -------------------------- Eventos (backend → front) -------------------- */

export const projectionReadyEventSchema = z.object({
  sessionId: z.string(),
  projection: projectionSchema,
});
export type ProjectionReadyEvent = z.infer<typeof projectionReadyEventSchema>;

export const documentChangedEventSchema = z.object({
  sessionId: z.string(),
  projection: projectionSchema,
  /**
   * `external`: el fichero cambió fuera y se recargó.
   * `internal`: snapshot tras un comando estructural o un undo/redo.
   */
  reason: z.enum(['external', 'internal']).optional(),
});
export type DocumentChangedEvent = z.infer<typeof documentChangedEventSchema>;

export const dirtyChangedEventSchema = z.object({
  sessionId: z.string(),
  dirty: z.boolean(),
});
export type DirtyChangedEvent = z.infer<typeof dirtyChangedEventSchema>;

export const conflictDetectedEventSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
});
export type ConflictDetectedEvent = z.infer<typeof conflictDetectedEventSchema>;

export const savedEventSchema = z.object({
  sessionId: z.string(),
  path: z.string(),
});
export type SavedEvent = z.infer<typeof savedEventSchema>;

export const sessionClosedEventSchema = z.object({
  sessionId: z.string(),
});
export type SessionClosedEvent = z.infer<typeof sessionClosedEventSchema>;

/** El fichero de la sesión desapareció (`true`) o volvió al disco (`false`). */
export const fileMissingChangedEventSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  missing: z.boolean(),
});
export type FileMissingChangedEvent = z.infer<typeof fileMissingChangedEventSchema>;

/** Cambio externo no recargable (sin cambios locales): aviso suave, sin diálogo. */
export const externalReloadFailedEventSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  /** `unreadable`: XML corrupto/medias; `unsupportedSchema`: RDL anterior a 2016. */
  reason: z.enum(['unreadable', 'unsupportedSchema']),
});
export type ExternalReloadFailedEvent = z.infer<typeof externalReloadFailedEventSchema>;

/** Sesión viva del backend (re-adopción del front tras recargar la interfaz). */
export const listedSessionSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  dirty: z.boolean(),
  /** El fichero ya no está en disco (BUG-55): se conserva al re-adoptar. */
  missing: z.boolean(),
  projection: projectionSchema,
});
export type ListedSession = z.infer<typeof listedSessionSchema>;

export const listedSessionsResultSchema = z.object({
  ok: z.literal(true),
  /** Orden de apertura; el front adopta la última si hay varias. */
  sessions: z.array(listedSessionSchema),
});
export type ListedSessionsResult = z.infer<typeof listedSessionsResultSchema>;
