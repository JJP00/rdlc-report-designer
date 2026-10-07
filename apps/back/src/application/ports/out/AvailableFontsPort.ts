export const AVAILABLE_FONTS_PORT = Symbol('AvailableFontsPort');

/**
 * Puerto de salida: fuentes disponibles para los informes.
 *
 * Son las preinstaladas en Business Central (no se pueden subir fuentes
 * propias): ofrecerlas garantiza que el `.rdlc` se pinte igual en el entorno
 * que en el lienzo. La barra de formato y el editor de texto las ofrecen al
 * usuario.
 */
export interface AvailableFontsPort {
  /** Nombres de familia disponibles (ordenados, sin duplicados). */
  list(): Promise<string[]>;
}
