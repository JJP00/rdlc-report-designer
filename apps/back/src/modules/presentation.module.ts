import { Module } from '@nestjs/common';
import { IpcController } from '../presentation/ipc/IpcController.js';
import { ApplicationModule } from './application.module.js';
import { InfrastructureModule } from './infrastructure.module.js';

/** Módulo de presentación: adaptadores de entrada (IPC). */
@Module({
  imports: [ApplicationModule, InfrastructureModule],
  providers: [IpcController],
})
export class PresentationModule {}
