/** Problemas: abrir el panel desde el pie y saltar de un hallazgo a su item en el lienzo. */
import { clickLocator, moveTo, pause, record } from '../lib.mjs';

export default async function problems(ctx) {
  const { page } = ctx;
  // Zoom a 100 %: el pie del informe queda fuera de pantalla y el lienzo tiene que desplazarse.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);

  const rows = page.locator('section[aria-label="Problems"] li button');
  // Lienzo + panel de problemas + pie (sin el panel de propiedades).
  const clip = { x: 0, y: 115, width: 1138, height: 785 };
  await record(
    ctx,
    'problems',
    clip,
    async () => {
      await pause(ctx, 300);
      // Abre el panel desde el contador del pie.
      await clickLocator(ctx, page.getByTitle('Show problems'), { duration: 800 });
      await pause(ctx, 900);
      // Primer hallazgo: la tablix; el lienzo se desplaza hasta ella.
      await clickLocator(ctx, rows.nth(0), { fx: 0.2, duration: 700 });
      await pause(ctx, 1500);
      // Otro hallazgo, otra celda (solo filas visibles: no desplazan la lista).
      await clickLocator(ctx, rows.nth(3), { fx: 0.2, duration: 500 });
      await pause(ctx, 1500);
      // Cursor aparcado en el margen gris del lienzo.
      await moveTo(ctx, 1070, 330, { duration: 600 });
    },
    { cursorAt: { x: 560, y: 420 } },
  );
}
