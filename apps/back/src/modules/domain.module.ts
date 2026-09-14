import { Module } from '@nestjs/common';

/**
 * Módulo de dominio: solo providers puros (aggregate Document, comandos,
 * dominio `expression`). En F1 registra las factorías y servicios de dominio.
 */
@Module({})
export class DomainModule {}
