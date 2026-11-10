/** Editor de texto: texto normal + una expresión con autocompletado, en negrita, y un segundo párrafo. */
import { clickLocator, moveTo, nodeRect, pause, press, record, type } from '../lib.mjs';

export default async function text(ctx) {
  const { page } = ctx;
  // Antes de grabar: abre el diálogo de un textbox, lo agranda a la altura
  // máxima (así no «salta» al añadir fragmentos) y vacía su documento.
  const rect = await nodeRect(page, 'Textbox93');
  await page.mouse.dblclick(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const dialog = page.getByRole('dialog');
  const area = dialog.locator('textarea[data-rdlc-text-document]');
  await area.waitFor();
  await pause(ctx, 800);
  const grip = await dialog.locator('[data-rdlc-dialog-grip]').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 400, { steps: 8 });
  await page.mouse.up();
  await pause(ctx, 600);
  await area.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await pause(ctx, 600);
  const box = await dialog.boundingBox();
  const clip = { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 };

  await record(
    ctx,
    'text-editor',
    clip,
    async () => {
      await pause(ctx, 200);
      // 1. Texto normal en el documento.
      await type(ctx, 'Total due: ', { delay: 70 });
      await pause(ctx, 700);
      // 2. Expresión en el cursor: el foco salta a su fragmento, abajo.
      await clickLocator(ctx, dialog.getByRole('button', { name: 'Insert expression' }));
      await pause(ctx, 700);
      // El fragmento nuevo ya trae «=»; el autocompletado ofrece los campos.
      await type(ctx, 'TotalAmountInclud', { delay: 70 });
      await pause(ctx, 1100);
      await press(ctx, 'Enter', { show: false, after: 600 });
      await pause(ctx, 200);
      // 3. Negrita en ese fragmento.
      await clickLocator(ctx, dialog.getByRole('button', { name: 'Bold for run 2' }));
      await pause(ctx, 800);
      // 4. Segundo párrafo: Enter al final del documento y más texto normal.
      await clickLocator(ctx, area, { fx: 0.9, fy: 0.3 });
      await press(ctx, 'End', { after: 200 });
      await press(ctx, 'Enter', { show: false, after: 500 });
      await type(ctx, 'Thank you!', { delay: 70 });
      await pause(ctx, 700);
      // 5. Un clic en la expresión del documento lleva a su fragmento (párrafo 1).
      await clickLocator(ctx, dialog.locator('mark').first());
      await pause(ctx, 700);
      await moveTo(ctx, box.x + 540, box.y + 12);
      await pause(ctx, 1000);
    },
    { cursorAt: { x: box.x + box.width / 2, y: box.y + 200 }, lead: 300, hold: 1800 },
  );
}
