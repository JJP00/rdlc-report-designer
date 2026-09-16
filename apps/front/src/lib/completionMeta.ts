import type { ReportMetaDto } from '@rdlc-designer/contracts';

/**
 * Metadatos del informe abierto para el autocompletado de expresiones.
 *
 * Módulo **sin dependencias** (a propósito): lo escribe el contenedor de la app
 * y lo lee el host de Monaco, que se carga en diferido. Si esto viviera en el
 * host, importarlo desde App arrastraría `monaco-editor` al bundle inicial.
 */

let currentMeta: ReportMetaDto | null = null;

export function setCompletionMeta(meta: ReportMetaDto | null): void {
  currentMeta = meta;
}

export function getCompletionMeta(): ReportMetaDto | null {
  return currentMeta;
}
