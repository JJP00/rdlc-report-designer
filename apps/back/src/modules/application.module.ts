import { Module } from '@nestjs/common';
import { SESSION_SERVICE } from '../application/services/ISessionService.js';
import { SessionService } from '../application/services/SessionService.js';
import { InfrastructureModule } from './infrastructure.module.js';

/** Módulo de aplicación: casos de uso (dependen de los puertos de infraestructura). */
@Module({
  imports: [InfrastructureModule],
  providers: [{ provide: SESSION_SERVICE, useClass: SessionService }],
  exports: [SESSION_SERVICE],
})
export class ApplicationModule {}
