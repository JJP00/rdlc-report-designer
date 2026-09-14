import { Module } from '@nestjs/common';
import { COMMAND_SERVICE } from '../application/services/ICommandService.js';
import { SESSION_SERVICE } from '../application/services/ISessionService.js';
import { CommandService } from '../application/services/CommandService.js';
import { SessionService } from '../application/services/SessionService.js';
import { InfrastructureModule } from './infrastructure.module.js';

/** Módulo de aplicación: casos de uso (dependen de los puertos de infraestructura). */
@Module({
  imports: [InfrastructureModule],
  providers: [
    { provide: SESSION_SERVICE, useClass: SessionService },
    { provide: COMMAND_SERVICE, useClass: CommandService },
  ],
  exports: [SESSION_SERVICE, COMMAND_SERVICE],
})
export class ApplicationModule {}
