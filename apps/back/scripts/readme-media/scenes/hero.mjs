/** Captura principal: tres pestañas, Jerarquía y una factura; en claro y en oscuro. */
import { THREE_TABS, nodeRect, shot } from '../lib.mjs';

export const files = THREE_TABS;

export default async function hero(ctx) {
  const { page } = ctx;
  await page.getByRole('button', { name: 'Hierarchy', exact: true }).click();
  await page.waitForTimeout(400);
  const rect = await nodeRect(page, 'Textbox1');
  await page.mouse.click(rect.x + rect.width * 0.3, rect.y + rect.height / 2);
  await page.waitForTimeout(250);
  await shot(ctx, 'screenshot-light');
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await page.waitForTimeout(500);
  await shot(ctx, 'screenshot-dark');
}
