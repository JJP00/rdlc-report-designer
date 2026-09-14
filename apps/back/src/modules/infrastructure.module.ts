import { Module } from '@nestjs/common';
import { EVENT_BUS_PORT } from '../application/ports/out/EventBusPort.js';
import { FILE_SYSTEM_PORT } from '../application/ports/out/FileSystemPort.js';
import { FILE_WATCHER_PORT } from '../application/ports/out/FileWatcherPort.js';
import { RDLC_PROJECTION_PORT } from '../application/ports/out/RdlcProjectionPort.js';
import { RDLC_PARSER_PORT } from '../application/ports/out/RdlcParserPort.js';
import { RDLC_SERIALIZER_PORT } from '../application/ports/out/RdlcSerializerPort.js';
import { ElectronEventBusAdapter } from '../infrastructure/events/ElectronEventBusAdapter.js';
import { ChokidarWatcherAdapter } from '../infrastructure/fs/ChokidarWatcherAdapter.js';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter.js';
import { TrueFormatProjectionAdapter } from '../infrastructure/rdlc/TrueFormatProjectionAdapter.js';
import { TrueFormatXmlAdapter } from '../infrastructure/rdlc/TrueFormatXmlAdapter.js';

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
    ElectronEventBusAdapter,
    { provide: EVENT_BUS_PORT, useExisting: ElectronEventBusAdapter },
  ],
  exports: [
    FILE_SYSTEM_PORT,
    FILE_WATCHER_PORT,
    RDLC_PARSER_PORT,
    RDLC_SERIALIZER_PORT,
    RDLC_PROJECTION_PORT,
    EVENT_BUS_PORT,
    ElectronEventBusAdapter,
  ],
})
export class InfrastructureModule {}
