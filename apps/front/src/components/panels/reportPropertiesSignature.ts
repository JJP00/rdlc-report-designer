import type { ProjectionDto } from '@rdlc-designer/contracts';

/**
 * Huella de lo que edita el formulario de propiedades del informe (página). El
 * panel lateral la usa como `key`: si el documento cambia por fuera (undo,
 * arrastre de la página en el lienzo), el borrador se remonta con los valores
 * vigentes; los cambios que no toca el formulario (mover un item, p. ej.) no lo
 * reinician.
 *
 * El bloque `<Code>` **no** entra en la huella: aplicarlo cambiaba la huella y
 * remontaba el formulario, reseteando la pestaña activa y los borradores de
 * página sin aplicar (BUG-37). El búfer del editor se sincroniza con un efecto.
 */
export function reportPropertiesSignature(projection: ProjectionDto): string {
  const { page } = projection;
  return JSON.stringify([
    page.width,
    page.height,
    page.margins,
    page.header.present,
    page.header.height,
    page.header.printOnFirstPage,
    page.header.printOnLastPage,
    page.footer.present,
    page.footer.height,
    page.footer.printOnFirstPage,
    page.footer.printOnLastPage,
    page.body.width,
    page.body.height,
  ]);
}
