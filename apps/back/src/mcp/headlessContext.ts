import { existsSync } from 'node:fs';
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
 * Esquema oficial RDL 2016/01. Orden de búsqueda: `RDLC_SCHEMA_PATH`, junto al
 * paquete npm (`dist/server.mjs` → `../resources`) y en el repo
 * (`apps/back/{src,out}/mcp` → `../../resources`).
 */
function resolveSchemaPath(): string {
  const fromEnv = process.env['RDLC_SCHEMA_PATH'];
  if (fromEnv) return fromEnv;
  const candidates = [
    join(import.meta.dirname, '../resources/rdl2016/ReportDefinition2016.xsd'),
    join(import.meta.dirname, '../../resources/rdl2016/ReportDefinition2016.xsd'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[1]!;
}

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
    overrides.schemaValidator ?? new LibXml2SchemaValidatorAdapter(resolveSchemaPath()),
    events,
  );
  const commands = new CommandService(sessions);
  return { sessions, commands, events };
}
