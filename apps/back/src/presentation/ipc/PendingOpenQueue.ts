import type { PendingOpenResult } from '@rdlc-designer/contracts';

/**
 * Ficheros que el main quiere abrir en el renderer, con dos vías:
 *
 * - **Arranque** (argumento de CLI / `RDLC_OPEN`): se entrega **una sola vez**,
 *   al montar el renderer (BUG-29: una recarga no debe reabrirlo).
 * - **Aperturas externas** (2.ª instancia de la asociación de ficheros: doble
 *   clic en el Explorador con la app ya abierta): si el renderer aún no ha
 *   montado se acumulan y viajan con la entrega inicial; después se emiten en
 *   vivo (quien llama envía el evento).
 */
export class PendingOpenQueue {
  private startup: string | null = null;
  private earlyExternal: string[] = [];
  private mounted = false;

  /** Fichero de arranque pendiente de la entrega inicial. */
  setStartup(path: string | null): void {
    this.startup = path;
  }

  /**
   * Petición externa. Devuelve `false` si el renderer aún no ha montado (la
   * ruta queda encolada para la entrega inicial) y `true` si ya está vivo
   * (quien llama la emite como evento).
   */
  requestExternal(path: string): boolean {
    if (!this.mounted) {
      this.earlyExternal.push(path);
      return false;
    }
    return true;
  }

  /** Entrega inicial (única): fichero de arranque + externas encoladas. */
  consume(): Pick<PendingOpenResult, 'path' | 'paths'> {
    this.mounted = true;
    const result = { path: this.startup, paths: this.earlyExternal };
    this.startup = null;
    this.earlyExternal = [];
    return result;
  }
}
