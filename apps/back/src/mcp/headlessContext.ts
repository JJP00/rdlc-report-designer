import { join } from 'node:path';
import type { FileSystemPort } from '../application/ports/out/FileSystemPort.js';
import type { FileWatcherPort } from '../application/ports/out/FileWatcherPort.js';
import type { XmlSchemaValidatorPort } from '../application/ports/out/XmlSchemaValidatorPort.js';
import type { ICommandService } from '../application/services/ICommandService.js';
import type { ISessionService } from '../application/services/ISessionService.js';
import { CommandService } from '../application/services/CommandService.js';
import { SessionService } from '../application/services/SessionService.js';
import { ChokidarWatcherAdapter } from '../infrastructure/fs/ChokidarWatcherAdapter.js';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../infrastructure/validation/LibXml2SchemaValidatorAdapter.js';
import { HeadlessEventBus } from './HeadlessEventBus.js';

/**
 * Esquema oficial RDL 2016/01. `RDLC_SCHEMA_PATH` lo sobrescribe; por defecto
 * `apps/back/resources/` (tanto desde `src/mcp` como desde `out/mcp`).
 */
const DEFAULT_SCHEMA_PATH = join(
  import.meta.dirname,
  '../../resources/rdl2016/ReportDefinition2016.xsd',
);

export interface HeadlessOverrides {
  fileSystem?: FileSystemPort;
  fileWatcher?: FileWatcherPort;
  schemaValidator?: XmlSchemaValidatorPort;
}

export interface HeadlessContext {
  sessions: ISessionService;
  commands: ICommandService;
  events: HeadlessEventBus;
}

/**
 * Raíz de composición **sin Electron ni Nest**: los mismos servicios de
 * aplicación que usa la app de escritorio, cableados a mano con los puertos
 * de Node. Es lo que permite a un agente editar `.rdlc` sin abrir la GUI.
 */
export function createHeadlessContext(overrides: HeadlessOverrides = {}): HeadlessContext {
  const events = new HeadlessEventBus();
  const xml = new TrueFormatXmlAdapter();
  const sessions = new SessionService(
    overrides.fileSystem ?? new NodeFileSystemAdapter(),
    overrides.fileWatcher ?? new ChokidarWatcherAdapter(),
    xml,
    xml,
    new TrueFormatProjectionAdapter(),
    overrides.schemaValidator ??
      new LibXml2SchemaValidatorAdapter(process.env['RDLC_SCHEMA_PATH'] ?? DEFAULT_SCHEMA_PATH),
    events,
  );
  const commands = new CommandService(sessions);
  return { sessions, commands, events };
}
