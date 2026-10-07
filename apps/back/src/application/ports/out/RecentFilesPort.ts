export const RECENT_FILES_PORT = Symbol('RecentFilesPort');

/**
 * Puerto de salida: ficheros recientes del editor (desplegable de «Abrir…»).
 * El adaptador decide dónde persiste; los servicios solo hablan de rutas.
 */
export interface RecentFilesPort {
  /** Rutas existentes, más recientes primero (los desaparecidos se descartan). */
  list(): Promise<string[]>;
  /** Mueve `path` al frente (deduplicado) y devuelve la lista actualizada. */
  add(path: string): Promise<string[]>;
}
