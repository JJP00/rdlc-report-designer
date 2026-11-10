/** Paneles Jerarquía y Variables: buscar en cada uno y ver el lienzo seleccionar el item. */
import { clickLocator, moveTo, pause, record, type } from '../lib.mjs';

export default async function panels(ctx) {
  const { page } = ctx;
  // Los dos paneles abiertos a la izquierda (antes de grabar).
  for (const name of ['Hierarchy', 'Variables']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
  }
  await page.mouse.move(700, 600);

  // Paneles + lienzo, para ver la selección.
  const clip = { x: 0, y: 112, width: 1120, height: 764 };
  await record(
    ctx,
    'panels',
    clip,
    async () => {
      // 1) Jerarquía: «Textbox9» deja un árbol corto con sus contenedores.
      await clickLocator(ctx, page.getByLabel('Search the hierarchy'), { duration: 700 });
      await type(ctx, 'Textbox9');
      await pause(ctx, 900);
      // 2) Elegir el último resultado: el lienzo lo selecciona.
      await clickLocator(ctx, page.getByRole('treeitem', { name: 'Textbox9', exact: true }), {
        fx: 0.3,
      });
      await pause(ctx, 1500);
      // 3) Variables: «VAT» deja solo los campos que lo contienen.
      await clickLocator(ctx, page.getByLabel('Search variables'), { duration: 700 });
      await type(ctx, 'VAT');
      await pause(ctx, 800);
      // El cursor se aparta al margen del lienzo.
      await moveTo(ctx, 1088, 640, { duration: 600 });
    },
    { width: 960, cursorAt: { x: 700, y: 600 } },
  );
}
