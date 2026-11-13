/** Aviso de conflicto: un cambio sin guardar y el fichero tocado por fuera. */
import { readFileSync, writeFileSync } from 'node:fs';
import { THREE_TABS, around, nodeRect, shot } from '../lib.mjs';

export const files = THREE_TABS;

export default async function conflict(ctx) {
  const { page } = ctx;
  const rect = await nodeRect(page, 'Textbox1');
  await page.mouse.click(rect.x + rect.width * 0.3, rect.y + rect.height / 2);
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  writeFileSync(ctx.paths[0], `${readFileSync(ctx.paths[0], 'utf8')}\n`);
  await page.waitForTimeout(2500);
  const box = await page.getByTestId('conflict-dialog').boundingBox();
  await shot(ctx, 'conflict', around([{ x: 12, y: 96, width: 1098, height: 10 }, box], 12));
}
