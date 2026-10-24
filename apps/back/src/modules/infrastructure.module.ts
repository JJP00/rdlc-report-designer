import { Module } from '@nestjs/common';
import { app } from 'electron';
import { join } from 'node:path';
import { AVAILABLE_FONTS_PORT } from '../application/ports/out/AvailableFontsPort.js';
import { EVENT_BUS_PORT } from '../application/ports/out/EventBusPort.js';
import { FILE_SYSTEM_PORT } from '../application/ports/out/FileSystemPort.js';
import { FILE_WATCHER_PORT } from '../application/ports/out/FileWatcherPort.js';
import { LOCALE_PREFERENCE_PORT } from '../application/ports/out/LocalePreferencePort.js';
import type { LocalePreferencePort } from '../application/ports/out/LocalePreferencePort.js';
import { RECENT_FILES_PORT } from '../application/ports/out/RecentFilesPort.js';
import { UPDATE_PREFERENCE_PORT } from '../application/ports/out/UpdatePreferencePort.js';
import { UPDATER_PORT } from '../application/ports/out/UpdaterPort.js';
import { RDLC_PROJECTION_PORT } from '../application/ports/out/RdlcProjectionPort.js';
import { RDLC_PARSER_PORT } from '../application/ports/out/RdlcParserPort.js';
import { RDLC_SERIALIZER_PORT } from '../application/ports/out/RdlcSerializerPort.js';
import { XML_SCHEMA_VALIDATOR_PORT } from '../application/ports/out/XmlSchemaValidatorPort.js';
import { ElectronEventBusAdapter } from '../infrastructure/events/ElectronEventBusAdapter.js';
import { BusinessCentralFontsAdapter } from '../infrastructure/fonts/BusinessCentralFontsAdapter.js';
import { ChokidarWatcherAdapter } from '../infrastructure/fs/ChokidarWatcherAdapter.js';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter.js';
import { JsonLocalePreferenceAdapter } from '../infrastructure/locale/JsonLocalePreferenceAdapter.js';
import { LocaleRuntime } from '../infrastructure/locale/LocaleRuntime.js';
import { JsonRecentFilesAdapter } from '../infrastructure/recent/JsonRecentFilesAdapter.js';
import { ElectronUpdaterAdapter } from '../infrastructure/updates/ElectronUpdaterAdapter.js';
import { JsonUpdatePreferenceAdapter } from '../infrastructure/updates/JsonUpdatePreferenceAdapter.js';
import { TrueFormatProjectionAdapter } from '../infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../infrastructure/validation/LibXml2SchemaValidatorAdapter.js';

/**
 * Esquema oficial RDL 2016/01 (MS-RDL §5.8, XSD de ReportViewer) que viaja
 * con la app en `apps/back/resources/` (dev) o en `resources/rdl2016/` del
 * paquete (electron-builder lo copia con `extraResources`).
 */
const RDL_SCHEMA_PATH = app.isPackaged
  ? join(process.resourcesPath, 'rdl2016', 'ReportDefinition2016.xsd')
  : join(import.meta.dirname, '../../resources/rdl2016/ReportDefinition2016.xsd');

/**
 * Módulo de infraestructura: binding tokens → adaptadores.
 * Sin lógica: solo el cableado de puertos.
 */
@Module({
  providers: [
    { provide: FILE_SYSTEM_PORT, useClass: NodeFileSystemAdapter },
    { provide: FILE_WATCHER_PORT, useClass: ChokidarWatcherAdapter },
    { provide: RDLC_PARSER_PORT, useClass: TrueFormatXmlAdapter },
    { provide: RDLC_SERIALIZER_PORT, useClass: TrueFormatXmlAdapter },
    { provide: RDLC_PROJECTION_PORT, useClass: TrueFormatProjectionAdapter },
    {
      provide: XML_SCHEMA_VALIDATOR_PORT,
      useFactory: () => new LibXml2SchemaValidatorAdapter(RDL_SCHEMA_PATH),
    },
    { provide: AVAILABLE_FONTS_PORT, useClass: BusinessCentralFontsAdapter },
    {
      provide: RECENT_FILES_PORT,
      useFactory: () =>
        new JsonRecentFilesAdapter(join(app.getPath('userData'), 'recent-files.json')),
    },
    {
      provide: LOCALE_PREFERENCE_PORT,
      useFactory: () =>
        new JsonLocalePreferenceAdapter(join(app.getPath('userData'), 'locale.json')),
    },
    {
      provide: LocaleRuntime,
      useFactory: (preference: LocalePreferencePort) =>
        new LocaleRuntime(preference, process.env['RDLC_LOCALE'], app.getLocale()),
      inject: [LOCALE_PREFERENCE_PORT],
    },
    { provide: UPDATER_PORT, useClass: ElectronUpdaterAdapter },
    {
      provide: UPDATE_PREFERENCE_PORT,
      useFactory: () =>
        new JsonUpdatePreferenceAdapter(join(app.getPath('userData'), 'updates.json')),
    },
    ElectronEventBusAdapter,
    { provide: EVENT_BUS_PORT, useExisting: ElectronEventBusAdapter },
  ],
  exports: [
    FILE_SYSTEM_PORT,
    FILE_WATCHER_PORT,
    RDLC_PARSER_PORT,
    RDLC_SERIALIZER_PORT,
    RDLC_PROJECTION_PORT,
    XML_SCHEMA_VALIDATOR_PORT,
    AVAILABLE_FONTS_PORT,
    RECENT_FILES_PORT,
    LOCALE_PREFERENCE_PORT,
    LocaleRuntime,
    UPDATER_PORT,
    UPDATE_PREFERENCE_PORT,
    EVENT_BUS_PORT,
    ElectronEventBusAdapter,
  ],
})
export class InfrastructureModule {}
