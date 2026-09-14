import { Module } from '@nestjs/common';
import { ApplicationModule } from './modules/application.module.js';
import { DomainModule } from './modules/domain.module.js';
import { InfrastructureModule } from './modules/infrastructure.module.js';
import { PresentationModule } from './modules/presentation.module.js';

/** Raíz del hexágono: solo cableado de DI. */
@Module({
  imports: [DomainModule, ApplicationModule, InfrastructureModule, PresentationModule],
})
export class AppModule {}
