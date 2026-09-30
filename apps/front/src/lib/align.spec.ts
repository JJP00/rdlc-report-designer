import { describe, expect, it } from 'vitest';
import { alignCommands, distributeCommands, type AlignBox } from './align';

/** Alinear/distribuir: cajas en cm, salida en comandos setLocation (cm). */

const box = (id: string, left: number, top: number, width: number, height: number): AlignBox => ({
  id,
  left,
  top,
  width,
  height,
});

const locationOf = (
  commands: { cmd: string; id?: string; top?: { value: number }; left?: { value: number } }[],
  id: string,
): { top: number; left: number } => {
  const command = commands.find((entry) => entry.id === id);
  if (!command?.top || !command.left) throw new Error(`sin setLocation para ${id}`);
  return { top: command.top.value, left: command.left.value };
};

describe('alignCommands', () => {
  const boxes = [box('a', 0, 1, 2, 1), box('b', 5, 3, 3, 2)];

  it('alinea a la izquierda (borde menor)', () => {
    const commands = alignCommands(boxes, 'left');
    expect(locationOf(commands, 'a').left).toBe(0);
    expect(locationOf(commands, 'b').left).toBe(0);
  });

  it('centra horizontalmente sobre la caja envolvente', () => {
    // Envolvente: 0..8, centro 4 → a: 4-1=3; b: 4-1.5=2.5.
    const commands = alignCommands(boxes, 'centerX');
    expect(locationOf(commands, 'a').left).toBe(3);
    expect(locationOf(commands, 'b').left).toBe(2.5);
  });

  it('alinea a la derecha', () => {
    const commands = alignCommands(boxes, 'right');
    expect(locationOf(commands, 'a').left).toBe(6);
    expect(locationOf(commands, 'b').left).toBe(5);
  });

  it('alinea arriba y no toca la posición horizontal', () => {
    const commands = alignCommands(boxes, 'top');
    expect(locationOf(commands, 'a').top).toBe(1);
    expect(locationOf(commands, 'b').top).toBe(1);
    expect(locationOf(commands, 'b').left).toBe(5);
  });

  it('con menos de dos cajas no genera nada', () => {
    expect(alignCommands([boxes[0]!], 'left')).toEqual([]);
  });
});

describe('distributeCommands', () => {
  it('reparte los centros uniformemente entre el primero y el último', () => {
    const boxes = [box('a', 0, 0, 2, 1), box('b', 3, 0, 2, 1), box('c', 10, 0, 4, 1)];
    const commands = distributeCommands(boxes, 'x');
    // Centros: 1, 4, 12 → paso 5.5 → a: 1-1=0; b: 6.5-1=5.5; c: 12-2=10.
    expect(locationOf(commands, 'a').left).toBe(0);
    expect(locationOf(commands, 'b').left).toBe(5.5);
    expect(locationOf(commands, 'c').left).toBe(10);
  });

  it('ordena por centro antes de repartir', () => {
    const boxes = [box('c', 10, 0, 4, 1), box('a', 0, 0, 2, 1), box('b', 3, 0, 2, 1)];
    const commands = distributeCommands(boxes, 'x');
    expect(locationOf(commands, 'b').left).toBe(5.5);
  });

  it('con menos de tres cajas no genera nada', () => {
    expect(distributeCommands([box('a', 0, 0, 2, 1), box('b', 3, 0, 2, 1)], 'x')).toEqual([]);
  });
});
