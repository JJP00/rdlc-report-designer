import { z } from 'zod';
import { commandSchema } from './commands.js';
import type { ItemDto } from './projection.js';
import { projectionSchema } from './projection.js';

/** Canales `ipcMain.handle` / `ipcRenderer.invoke`. */
export const IPC_CHANNELS = {
  pickFile: 'rdlc:pickFile',
  /** Fichero con el que se arrancó la app (CLI/argumento), si lo hay. */
  pendingOpen: 'rdlc:pendingOpen',
  openFile: 'rdlc:openFile',
  createNew: 'rdlc:createNew',
  save: 'rdlc:save',
  saveAs: 'rdlc:saveAs',
  close: 'rdlc:close',
  executeCommand: 'rdlc:executeCommand',
  undo: 'rdlc:undo',
  redo: 'rdlc:redo',
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
  'E_IO',
  'E_UNEXPECTED',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/* --------------------- Peticiones (front → backend) ---------------------- */

export const openFileRequestSchema = z.object({ path: z.string().min(1) }).strict();
export type OpenFileRequest = z.infer<typeof openFileRequestSchema>;

export const createNewRequestSchema = z.object({ path: z.string().min(1).optional() }).strict();
export type CreateNewRequest = z.infer<typeof createNewRequestSchema>;

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

/** Fichero inicial pasado a la app (argumento de línea de comandos). */
export const pendingOpenResultSchema = z.object({
  ok: z.literal(true),
  path: z.string().nullable(),
});
export type PendingOpenResult = z.infer<typeof pendingOpenResultSchema>;

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

export const saveResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    path: z.string(),
    /** true si el fichero no se tocó y se re-escribieron los mismos bytes. */
    bytesIdentical: z.boolean(),
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
