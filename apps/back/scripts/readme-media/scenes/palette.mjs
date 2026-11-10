/**
 * Paleta (Ctrl+K): buscar «lines» (acciones, items y variables a la vez), bajar
 * hasta un item y ver cómo el lienzo lo selecciona y se desplaza hasta él.
 */
import { pause, press, record, type } from '../lib.mjs';

/** Item al que se salta: con el zoom ampliado queda fuera de la vista. */
const TARGET = 'LinesTable2';

export default async function palette(ctx) {
  const { page } = ctx;
  // Zoom ampliado: así elegir el item obliga al lienzo a desplazarse.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.mouse.click(1000, 140); // fuera de la página: nada seleccionado
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(600);

  const clip = { x: 160, y: 110, width: 960, height: 760 };
  await record(
    ctx,
    'palette',
    clip,
    async () => {
      await press(ctx, 'Control+k', { after: 500 });
      await type(ctx, 'lines');
      await pause(ctx, 1200);
      // Baja con las flechas hasta el item (el orden depende de la puntuación).
      for (let step = 0; step < 12; step++) {
        const current = await page
          .locator('[cmdk-item][data-selected="true"]')
          .first()
          .textContent();
        if (current?.trim().startsWith(TARGET)) break;
        await press(ctx, 'ArrowDown', { after: 260 });
      }
      await pause(ctx, 400);
      await press(ctx, 'Enter', { show: true, after: 1500 });
    },
    { cursor: false },
  );
}
