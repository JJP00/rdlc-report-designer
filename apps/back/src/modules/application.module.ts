import { Module } from '@nestjs/common';
import { COMMAND_SERVICE } from '../application/services/ICommandService.js';
import { SESSION_SERVICE } from '../application/services/ISessionService.js';
import { CommandService } from '../application/services/CommandService.js';
import { SessionService } from '../application/services/SessionService.js';
import { UpdateService } from '../application/services/UpdateService.js';
import { InfrastructureModule } from './infrastructure.module.js';

/** Módulo de aplicación: casos de uso (dependen de los puertos de infraestructura). */
@Module({
  imports: [InfrastructureModule],
  providers: [
    { provide: SESSION_SERVICE, useClass: SessionService },
    { provide: COMMAND_SERVICE, useClass: CommandService },
    UpdateService,
  ],
  exports: [SESSION_SERVICE, COMMAND_SERVICE, UpdateService],
})
export class ApplicationModule {}
