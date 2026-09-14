import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { EVENT_BUS_PORT } from '../application/ports/out/EventBusPort.js';
import { FILE_SYSTEM_PORT } from '../application/ports/out/FileSystemPort.js';
import { FILE_WATCHER_PORT } from '../application/ports/out/FileWatcherPort.js';
import { RDLC_PROJECTION_PORT } from '../application/ports/out/RdlcProjectionPort.js';
import { RDLC_PARSER_PORT } from '../application/ports/out/RdlcParserPort.js';
import { RDLC_SERIALIZER_PORT } from '../application/ports/out/RdlcSerializerPort.js';
import { XML_SCHEMA_VALIDATOR_PORT } from '../application/ports/out/XmlSchemaValidatorPort.js';
import { ElectronEventBusAdapter } from '../infrastructure/events/ElectronEventBusAdapter.js';
import { ChokidarWatcherAdapter } from '../infrastructure/fs/ChokidarWatcherAdapter.js';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../infrastructure/rdlc/TrueFormatXmlAdapter.js';
import { LibXml2SchemaValidatorAdapter } from '../infrastructure/validation/LibXml2SchemaValidatorAdapter.js';

/**
 * Esquema oficial RDL 2016/01 (MS-RDL §5.8, XSD de ReportViewer) que viaja
 * con la app en `apps/back/resources/`.
 */
const RDL_SCHEMA_PATH = join(
  import.meta.dirname,
  '../../resources/rdl2016/ReportDefinition2016.xsd',
);

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
    EVENT_BUS_PORT,
    ElectronEventBusAdapter,
  ],
})
export class InfrastructureModule {}
