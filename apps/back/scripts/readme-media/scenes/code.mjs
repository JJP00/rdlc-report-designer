/** Editor de código VB (Informe… → Código): escribir una función nueva con autocompletado. */
import { around, clickLocator, moveTo, pause, press, record, type } from '../lib.mjs';

/** Cierra la lista de sugerencias si está abierta (Escape sin lista cerraría el diálogo). */
async function closeSuggest(ctx) {
  const widget = ctx.page.locator('.suggest-widget.visible');
  if (await widget.count()) await press(ctx, 'Escape', { show: false, after: 200 });
}

export default async function code(ctx) {
  const { page } = ctx;
  await page.getByRole('button', { name: 'Report…' }).click();
  await page.waitForTimeout(800);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Code' }).click();
  await page.waitForTimeout(1500);

  // Recorte algo más alto que el diálogo: la lista de sugerencias cuelga por debajo
  const box = await dialog.boundingBox();
  const clip = around([{ ...box, height: box.height + 90 }], 16);
  const editor = dialog.locator('.monaco-editor').first();
  await record(
    ctx,
    'code-editor',
    clip,
    async () => {
      await pause(ctx, 700);
      // Clic en el editor y al final del código (la última línea ya está vacía)
      await clickLocator(ctx, editor, { fx: 0.6, fy: 0.5 });
      await press(ctx, 'Control+End', { after: 400 });
      await press(ctx, 'Enter', { show: false, after: 400 });

      // La firma entra por trozos (insertText no abre sugerencias a cada palabra)
      for (const chunk of ['Public Function ', 'FormatTotal(', 'value As Decimal', ') As String']) {
        await page.keyboard.insertText(chunk);
        await pause(ctx, 380);
      }
      await closeSuggest(ctx);
      await press(ctx, 'Enter', { show: false, after: 150 });
      await press(ctx, 'Tab', { show: false, after: 150 });
      await type(ctx, 'Return Form');
      // La lista de sugerencias se queda a la vista antes de aceptar
      await pause(ctx, 1500);
      await press(ctx, 'Tab', { show: 'Tab', after: 700 });
      // Aceptar Format ya pone los paréntesis: se escribe dentro y se salta el cierre
      await type(ctx, 'value, "N2"');
      await closeSuggest(ctx);
      await press(ctx, 'End', { show: false, after: 150 });
      await press(ctx, 'Enter', { show: false, after: 150 });
      await press(ctx, 'Shift+Tab', { show: false, after: 150 });
      // Sin teclear: «End» abriría una lista de campos que no viene a cuento
      await page.keyboard.insertText('End Function');
      await pause(ctx, 400);
      await closeSuggest(ctx);
      // El cursor se aparta del código
      await moveTo(ctx, clip.x + clip.width - 140, box.y + 110, { duration: 500 });
      await pause(ctx, 300);
    },
    {
      keysAt: { x: clip.x + clip.width / 2, y: box.y + 165 },
      cursorAt: { x: clip.x + clip.width / 2, y: clip.y + 60 },
    },
  );
}
