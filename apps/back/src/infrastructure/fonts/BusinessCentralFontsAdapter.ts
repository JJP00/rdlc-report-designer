import { BUSINESS_CENTRAL_FONT_FAMILIES } from '@rdlc-designer/contracts';
import type { AvailableFontsPort } from '../../application/ports/out/AvailableFontsPort.js';

/**
 * Fuentes disponibles en Business Central: la lista oficial de la
 * documentación (preinstaladas en el servidor, sección «Document fonts»), que
 * es la única que un informe puede usar. El front las pinta en la barra de
 * formato, la selección múltiple y el editor de texto.
 *
 * Es estática (el entorno no admite fuentes propias), así que se sirve tal
 * cual; si algún día la lista dependiera del entorno, aquí iría la consulta.
 */
export class BusinessCentralFontsAdapter implements AvailableFontsPort {
  async list(): Promise<string[]> {
    return [...BUSINESS_CENTRAL_FONT_FAMILIES];
  }
}
