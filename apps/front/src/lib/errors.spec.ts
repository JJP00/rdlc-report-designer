import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './errors';

/** El banner no debe mostrar el código: solo el motivo (o el texto por defecto). */
describe('apiErrorMessage', () => {
  it('devuelve el motivo de la API, sin el código', () => {
    expect(
      apiErrorMessage({ message: 'No se puede dejar el Tablix sin filas' }, 'comando rechazado'),
    ).toBe('No se puede dejar el Tablix sin filas');
  });

  it('cae al texto por defecto si no hay motivo', () => {
    expect(apiErrorMessage({}, 'no se pudo hacer')).toBe('no se pudo hacer');
    expect(apiErrorMessage({ message: '   ' }, 'no se pudo hacer')).toBe('no se pudo hacer');
    expect(apiErrorMessage({ message: undefined }, 'no se pudo hacer')).toBe('no se pudo hacer');
  });
});
