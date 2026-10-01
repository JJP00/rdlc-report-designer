import { afterEach, describe, expect, it } from 'vitest';
import { CommandService } from '../../src/application/services/CommandService.js';
import type { RdlcNode } from '../../src/domain/document/tree/RdlcNode.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/**
 * F2/F2.c · los comandos que insertan filas/columnas crean **textbox con
 * nombre** dentro de las celdas: además del inverso, obligan a reconstruir el
 * índice de nombres (si no, dos inserciones seguidas reutilizarían el mismo
 * `TextboxN`). Se prueba a nivel de servicio, que es quien reconstruye.
 */

afterEach(cleanupTempDirs);

/** Nombres de todos los `Textbox` bajo el tablix indicado. */
function textboxNames(root: RdlcNode, tablixName: string): string[] {
  let tablix: RdlcNode | undefined;
  const find = (node: RdlcNode): void => {
    if (tablix) return;
    if (node.tagName === 'Tablix' && node.attribute('Name') === tablixName) {
      tablix = node;
      return;
    }
    for (const child of node.children()) find(child);
  };
  find(root);

  const names: string[] = [];
  const walk = (node: RdlcNode): void => {
    if (node.tagName === 'Textbox') {
      const name = node.attribute('Name');
      if (name) names.push(name);
    }
    for (const child of node.children()) walk(child);
  };
  if (tablix) walk(tablix);
  return names;
}

describe('F2/F2.c · índice estructural al añadir filas', () => {
  it('dos addRow seguidos no reutilizan nombres de textbox', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'SalesCreditMemoESP.rdlc');
    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const commands = new CommandService(service);
    const sessionId = opened.value.sessionId;
    expect(commands.execute(sessionId, { cmd: 'addRow', id: 'Tablix3', row: 0 }).isRight()).toBe(
      true,
    );
    expect(commands.execute(sessionId, { cmd: 'addRow', id: 'Tablix3', row: 0 }).isRight()).toBe(
      true,
    );

    const target = service.getEditTarget(sessionId);
    expect(target.isRight()).toBe(true);
    if (!target.isRight()) return;
    const names = textboxNames(target.value.document.root, 'Tablix3');
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });
});
