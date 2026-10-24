import { z } from 'zod';
import { commandSchema, scopeRefSchema } from './commands.js';
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
  /** Idioma efectivo + preferencia guardada, al arrancar el renderer. */
  getLocale: 'rdlc:getLocale',
  /** Cambia el idioma (Fichero → Idioma): persiste y actualiza main y renderer. */
  setLocale: 'rdlc:setLocale',
  /** Estado vigente de las actualizaciones (el renderer lo pide al montar). */
  getUpdateState: 'rdlc:getUpdateState',
  /** Comprobación manual (Fichero → Buscar actualizaciones…): ignora «omitir versión». */
  checkForUpdates: 'rdlc:checkForUpdates',
  /** Descarga la versión ofrecida (solo en instalaciones que se pueden actualizar). */
  downloadUpdate: 'rdlc:downloadUpdate',
  /** Reinicia e instala la versión descargada (pasa por la guarda de cambios sin guardar). */
  installUpdate: 'rdlc:installUpdate',
  /** Omite la versión ofrecida: no se vuelve a proponer sola. */
  skipUpdateVersion: 'rdlc:skipUpdateVersion',
  /** Abre la página de la release en el navegador (instalaciones no actualizables). */
  openReleasePage: 'rdlc:openReleasePage',
  close: 'rdlc:close',
  executeCommand: 'rdlc:executeCommand',
  undo: 'rdlc:undo',
  redo: 'rdlc:redo',
  copy: 'rdlc:copy',
  cut: 'rdlc:cut',
  paste: 'rdlc:paste',
  copyCells: 'rdlc:copyCells',
  pasteCells: 'rdlc:pasteCells',
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
  /**
   * Abrir un informe pedido **desde fuera** con la app ya abierta (2.ª
   * instancia de la asociación de ficheros: doble clic en el Explorador).
   */
  openRequested: 'rdlc:evt:openRequested',
  /** Cambió el estado de las actualizaciones (comprobando, disponible, descargando…). */
  updateStateChanged: 'rdlc:evt:updateStateChanged',
} as const;
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

/* ----------------------------- i18n ------------------------------------- */

/** Idiomas soportados por la app (preferencia del usuario; el catálogo fuente es EN). */
export const LOCALES = ['en', 'es'] as const;
export const localeSchema = z.enum(LOCALES);
export type AppLocale = z.infer<typeof localeSchema>;

export const setLocaleRequestSchema = z.object({ locale: localeSchema }).strict();
export type SetLocaleRequest = z.infer<typeof setLocaleRequestSchema>;

/**
 * Idioma efectivo (`locale`; `qps-ploc` en desarrollo), preferencia aplicada
 * (`preferred`: lo que marca el menú «Idioma») y idioma del SO (`system`).
 */
export const localeResultSchema = z.object({
  ok: z.literal(true),
  locale: z.string().min(2),
  preferred: localeSchema,
  system: z.string(),
  locales: z.array(localeSchema),
});
export type LocaleResult = z.infer<typeof localeResultSchema>;

/* --------------------------- Actualizaciones ----------------------------- */

export const UPDATE_STATUSES = [
  'idle',
  'checking',
  'upToDate',
  'available',
  'downloading',
  'downloaded',
  'error',
] as const;
export const updateStatusSchema = z.enum(UPDATE_STATUSES);
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

/**
 * Estado de las actualizaciones, calculado por el main (el renderer nunca toca
 * la red). `version`/`notes` describen la versión ofrecida; `canInstall` es
 * `false` en portable/MSI/zip/desarrollo, donde solo se avisa y se enlaza a la
 * página de la release.
 */
export const updateStateSchema = z.object({
  status: updateStatusSchema,
  currentVersion: z.string(),
  /** Versión ofrecida (`available`/`downloading`/`downloaded`). */
  version: z.string().optional(),
  /** Notas de la release (Markdown de GitHub) como texto; `null` si no se pudieron leer. */
  notes: z.string().nullable().optional(),
  /** Progreso de la descarga, 0–100 (`downloading`). */
  percent: z.number().min(0).max(100).optional(),
  /** Esta instalación se puede actualizar en sitio (NSIS). */
  canInstall: z.boolean(),
  /** Detalle técnico del fallo (`error`); la UI muestra su propio texto traducido. */
  errorMessage: z.string().optional(),
});
export type UpdateState = z.infer<typeof updateStateSchema>;

export const updateStateResultSchema = z.object({
  ok: z.literal(true),
  state: updateStateSchema,
});
export type UpdateStateResult = z.infer<typeof updateStateResultSchema>;

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

/** Celda de un Tablix (fila y columna de rejilla, 0-based). */
export const tablixCellPositionSchema = z
  .object({ row: z.number().int().nonnegative(), col: z.number().int().nonnegative() })
  .strict();

/**
 * Copiar celdas: el contenido de las celdas del Tablix `id`, en orden de
 * lectura (el diseño relativo se calcula respecto a la caja de la selección).
 */
export const copyCellsRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    id: z.string().min(1),
    cells: z.array(tablixCellPositionSchema).min(1),
  })
  .strict();
export type CopyCellsRequest = z.infer<typeof copyCellsRequestSchema>;

/** Pegar celdas: celda ancla desde la que se pega el bloque del portapapeles. */
export const pasteCellsRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    id: z.string().min(1),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
  })
  .strict();
export type PasteCellsRequest = z.infer<typeof pasteCellsRequestSchema>;

/* ---------------------- Respuestas (backend → front) --------------------- */

/** Respuesta de error uniforme: nunca cruzan excepciones crudas por IPC. */
export const ipcErrorSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  /**
   * Motivo estable dentro del código (`errors.<reason>` en los catálogos): la
   * UI compone el mensaje visible; `message` queda para diagnóstico/logs.
   */
  reason: z.string().optional(),
  /** Parámetros de la plantilla del mensaje (`{path}`, `{count}`…). */
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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
  /**
   * Copiar/pegar celdas: celdas procesadas (`done`) de las que traía el
   * portapapeles (`total`); `done < total` si parte del bloque no cabía.
   */
  cells: z
    .object({
      done: z.number().int().nonnegative(),
      total: z.number().int(),
      /** Origen del portapapeles al pegar: celdas copiadas o items sueltos. */
      source: z.enum(['cells', 'items']).optional(),
    })
    .optional(),
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
  /**
   * Aperturas externas (2.ª instancia: doble clic con la app ya arrancando)
   * llegadas antes de montar el renderer: se entregan con el fichero inicial,
   * en orden.
   */
  paths: z.array(z.string()),
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

/** Apertura pedida desde fuera (2.ª instancia) con la app ya abierta. */
export const openRequestedEventSchema = z.object({
  path: z.string(),
});
export type OpenRequestedEvent = z.infer<typeof openRequestedEventSchema>;

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
