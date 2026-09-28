import { describe, expect, it } from 'vitest';
import { HIDDEN_ITEM_OPACITY, itemOpacity, visibilityMode } from './visibility';

describe('itemOpacity', () => {
  it('atenúa un Hidden literal true', () => {
    expect(itemOpacity(true)).toBe(HIDDEN_ITEM_OPACITY);
  });

  it('pinta normal lo visible y lo oculto por expresión (no se evalúa en diseño)', () => {
    expect(itemOpacity(false)).toBe(1);
    expect(itemOpacity(undefined)).toBe(1);
    expect(itemOpacity('=IIF(Fields!X.Value, true, false)')).toBe(1);
  });
});

describe('visibilityMode', () => {
  it('traduce el valor RDL al modo del panel (la predeterminada es visible)', () => {
    expect(visibilityMode(undefined)).toBe('visible');
    expect(visibilityMode(false)).toBe('visible');
    expect(visibilityMode(true)).toBe('hidden');
    expect(visibilityMode('=Fields!X.Value')).toBe('expression');
  });
});
