/** Editor de expresiones: autocompletado de una función (`IsNothing(`) y de un campo (`Fields!…Value`). */
import { around, clickLocator, moveTo, pause, press, record, type } from '../lib.mjs';

export default async function expression(ctx) {
  const { page } = ctx;
  // Selecciona Tablix4 por la paleta y abre el diálogo de la expresión de visibilidad.
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.keyboard.type('Tablix4');
  await page.waitForTimeout(500);
  await page
    .getByRole('option')
    .filter({ hasText: /^Tablix4/ })
    .first()
    .click();
  await page.waitForTimeout(500);
  await page.getByTitle('Expression editor (with line numbers)').last().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.waitForTimeout(1000);

  const box = await dialog.boundingBox();
  const clip = around([box], 16);
  const park = { x: box.x + box.width * 0.82, y: box.y + box.height * 0.72 };
  const editor = dialog.locator('.monaco-editor .view-lines').first();
  await record(ctx, 'expression-editor', clip, async () => {
    await pause(ctx, 500);
    // Clic al final de la expresión y a escribir; el autocompletado completa por palabras.
    await clickLocator(ctx, editor, { fx: 0.97, fy: 0.5 });
    // Línea nueva: así la lista de sugerencias nace a la izquierda y cabe en el diálogo.
    await press(ctx, 'Control+End', { show: false, after: 200 });
    await press(ctx, 'Enter', { show: false, after: 300 });
    // El cursor se aparta para no tapar la lista.
    await moveTo(ctx, park.x, park.y, { duration: 350 });
    await page.keyboard.insertText('OrElse ');
    await pause(ctx, 300);
    await type(ctx, 'IsNo');
    await pause(ctx, 1500);
    await press(ctx, 'Enter', { show: true, after: 900 });
    // Dentro del paréntesis: un campo del dataset, que se inserta como Fields!X.Value.
    await type(ctx, 'BTCComp');
    await pause(ctx, 1500);
    await press(ctx, 'ArrowDown', { show: false, after: 700 });
    await press(ctx, 'Enter', { show: true, after: 700 });
  });
}
