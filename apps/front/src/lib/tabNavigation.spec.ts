import { describe, expect, it } from 'vitest';
import {
  dropTargetIndex,
  focusTargetIndex,
  moveAnnouncement,
  moveTargetIndex,
  tabAriaLabel,
} from './tabNavigation';

/** Lógica pura de la tira de pestañas (hallazgos 3, 9 y 21). */
describe('tabAriaLabel', () => {
  it('sin estado es solo el nombre', () => {
    expect(tabAriaLabel('Pedidos.rdlc', false, false)).toBe('Pedidos.rdlc');
  });

  it('con cambios sin guardar añade el estado', () => {
    expect(tabAriaLabel('Pedidos.rdlc', true, false)).toBe('Pedidos.rdlc, con cambios sin guardar');
  });

  it('el conflicto puede ir sin cambios locales', () => {
    expect(tabAriaLabel('Pedidos.rdlc', false, true)).toBe(
      'Pedidos.rdlc, conflicto: el fichero cambió en disco',
    );
  });

  it('con los dos estados los encadena en orden', () => {
    expect(tabAriaLabel('Pedidos.rdlc', true, true)).toBe(
      'Pedidos.rdlc, con cambios sin guardar, conflicto: el fichero cambió en disco',
    );
  });
});

describe('focusTargetIndex (roving del tablist)', () => {
  it('← y → se mueven una posición', () => {
    expect(focusTargetIndex(1, 3, 'ArrowLeft')).toBe(0);
    expect(focusTargetIndex(1, 3, 'ArrowRight')).toBe(2);
  });

  it('←/→ dan la vuelta en los extremos', () => {
    expect(focusTargetIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(focusTargetIndex(2, 3, 'ArrowRight')).toBe(0);
  });

  it('una sola pestaña se queda en sí misma', () => {
    expect(focusTargetIndex(0, 1, 'ArrowLeft')).toBe(0);
    expect(focusTargetIndex(0, 1, 'ArrowRight')).toBe(0);
  });

  it('Inicio y Fin van a los extremos (sin vuelta)', () => {
    expect(focusTargetIndex(2, 4, 'Home')).toBe(0);
    expect(focusTargetIndex(1, 4, 'End')).toBe(3);
  });

  it('otras teclas y lista vacía no navegan', () => {
    expect(focusTargetIndex(1, 3, 'Enter')).toBeNull();
    expect(focusTargetIndex(0, 0, 'ArrowRight')).toBeNull();
  });
});

describe('dropTargetIndex (arrastre)', () => {
  it('soltar a la derecha descuenta la pestaña que sale', () => {
    expect(dropTargetIndex(0, 2)).toBe(1);
    expect(dropTargetIndex(1, 3)).toBe(2);
  });

  it('soltar a la izquierda usa la ranura tal cual', () => {
    expect(dropTargetIndex(2, 1)).toBe(1);
    expect(dropTargetIndex(1, 0)).toBe(0);
  });

  it('soltar en la propia ranura no cambia la posición', () => {
    expect(dropTargetIndex(1, 1)).toBe(1);
    expect(dropTargetIndex(1, 2)).toBe(1);
  });
});

describe('moveTargetIndex (Alt+←/→)', () => {
  it('mueve una posición dentro del rango', () => {
    expect(moveTargetIndex(1, -1, 3)).toBe(0);
    expect(moveTargetIndex(1, 1, 3)).toBe(2);
  });

  it('se acota a los extremos, como moveTab', () => {
    expect(moveTargetIndex(0, -1, 3)).toBe(0);
    expect(moveTargetIndex(2, 1, 3)).toBe(2);
  });
});

describe('moveAnnouncement', () => {
  it('publica el nombre y la posición final en 1-based', () => {
    expect(moveAnnouncement('Segundo.rdlc', 0, 3)).toBe('«Segundo.rdlc», posición 1 de 3');
    expect(moveAnnouncement('PalletOutput.rdlc', 2, 3)).toBe(
      '«PalletOutput.rdlc», posición 3 de 3',
    );
  });
});
