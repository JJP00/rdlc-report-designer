import type { RdlcDocument } from '../../../domain/document/tree/RdlcDocument.js';

export const RDLC_PROJECTION_PORT = Symbol('RdlcProjectionPort');

export interface RdlcProjectionInput {
  sessionId: string;
  filePath: string;
  document: RdlcDocument;
  version: number;
}

/**
 * Puerto de salida: documento → JSON de renderizado.
 *
 * F0: lo implementa un adaptador que lee el modelo de la librería XML.
 * F1: pasa a ser `ProjectionService` (aplicación) sobre el árbol de dominio.
 */
export interface RdlcProjectionPort {
  project(input: RdlcProjectionInput): unknown;
}
