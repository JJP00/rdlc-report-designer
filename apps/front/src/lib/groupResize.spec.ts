import { describe, expect, it } from 'vitest';
import type { BatchableCommand } from '@rdlc-designer/contracts';
import { groupBoxCm, groupResizeCommands, type GroupResizeMember } from './groupResize';
import type { BoxCm } from './resize';

/** Redimensionado de la multiselección: caja envolvente + escala proporcional. */

const box = (top: number, left: number, width: number, height: number): BoxCm => ({
  top,
  left,
  width,
  height,
});

const item = (id: string, frame: BoxCm, declared: BoxCm = frame): GroupResizeMember => ({
  id,
  box: declared,
  frame,
});

/** El valor de la longitud en cm de un comando (setBounds o resizeTable). */
const commandOf = (
  commands: BatchableCommand[],
  id: string,
): { cmd: string; top: number; left: number; width: number; height: number } => {
  const command = commands.find((entry) => entry.id === id);
  if (!command || (command.cmd !== 'setBounds' && command.cmd !== 'resizeTable')) {
    throw new Error(`sin setBounds/resizeTable para ${id}`);
  }
  return {
    cmd: command.cmd,
    top: command.top.value,
    left: command.left.value,
    width: command.width.value,
    height: command.height.value,
  };
};

describe('groupBoxCm', () => {
  it('envuelve los marcos medidos de todos los miembros', () => {
    const members = [item('a', box(1, 1, 2, 1)), item('b', box(3, 4, 4, 2))];
    expect(groupBoxCm(members)).toEqual(box(1, 1, 7, 4));
  });

  it('sin miembros no hay caja', () => {
    expect(groupBoxCm([])).toBeNull();
  });
});

describe('groupResizeCommands', () => {
  const members = [item('a', box(1, 1, 2, 1)), item('b', box(3, 4, 4, 2))];
  const start = groupBoxCm(members)!; // { top: 1, left: 1, width: 7, height: 4 }

  it('escala tamaño y posición al arrastrar la esquina SE (×2)', () => {
    const commands = groupResizeCommands(members, start, box(1, 1, 14, 8));
    // a está en la esquina de la envolvente: crece en su sitio; b se separa.
    expect(commandOf(commands, 'a')).toEqual({
      cmd: 'setBounds',
      top: 1,
      left: 1,
      width: 4,
      height: 2,
    });
    expect(commandOf(commands, 'b')).toEqual({
      cmd: 'setBounds',
      top: 5,
      left: 7,
      width: 8,
      height: 4,
    });
  });

  it('arrastrar el borde oeste reescala solo el ancho y mantiene la vertical', () => {
    // Envolvente de 7 → 10 cm (×10/7); el alto no cambia.
    const commands = groupResizeCommands(members, start, box(1, 0, 10, 4));
    const a = commandOf(commands, 'a');
    expect(a.left).toBeCloseTo(0, 4);
    expect(a.top).toBe(1);
    expect(a.width).toBeCloseTo((2 * 10) / 7, 4);
    expect(a.height).toBe(1);
    const b = commandOf(commands, 'b');
    expect(b.left).toBeCloseTo(4.2857, 3);
    expect(b.width).toBeCloseTo(5.7143, 3);
    expect(b.height).toBe(2);
  });

  it('un Tablix se redimensiona repartiendo la rejilla (las cabeceras no escalan)', () => {
    const tablix: GroupResizeMember = {
      id: 't',
      box: box(1, 1, 3, 2),
      frame: box(0.8, 0.8, 3.2, 2.2),
      headerOffset: { x: 0.2, y: 0.2 },
      tablix: true,
    };
    const startTablix = groupBoxCm([tablix])!; // el marco medido: 3,2 × 2,2

    const scaled = groupResizeCommands([tablix], startTablix, box(0.8, 0.8, 6.4, 4.4));
    expect(commandOf(scaled, 't')).toEqual({
      cmd: 'resizeTable',
      top: 1,
      left: 1,
      width: 6.2, // 3,2 × 2 − 0,2 de cabecera
      height: 4.2,
    });

    // Mover el bloque: la posición declarada acompaña al marco medido.
    const moved = groupResizeCommands([tablix], startTablix, box(0.3, 0.3, 6.4, 4.4));
    expect(commandOf(moved, 't').top).toBeCloseTo(0.5, 4);
    expect(commandOf(moved, 't').left).toBeCloseTo(0.5, 4);
  });

  it('aplica el tamaño mínimo del dominio a los miembros que se encogen de más', () => {
    const commands = groupResizeCommands(
      [item('a', box(0, 0, 2, 2))],
      box(0, 0, 2, 2),
      box(0, 0, 0.02, 0.02),
    );
    expect(commandOf(commands, 'a').width).toBe(0.05);
    expect(commandOf(commands, 'a').height).toBe(0.05);
  });

  it('redondea a 4 decimales las escalas no exactas', () => {
    // Envolvente de 6 → 2 cm (×1/3): el miembro de 2 cm queda en 0,6667.
    const commands = groupResizeCommands(
      [item('a', box(0, 0, 2, 2)), item('b', box(0, 4, 2, 2))],
      box(0, 0, 6, 2),
      box(0, 0, 2, 2),
    );
    expect(commandOf(commands, 'a').width).toBe(0.6667);
  });

  it('sin cambios no genera comandos', () => {
    expect(groupResizeCommands(members, start, start)).toEqual([]);
    expect(groupResizeCommands([], start, box(0, 0, 1, 1))).toEqual([]);
  });
});
