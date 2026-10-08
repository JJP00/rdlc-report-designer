import { describe, expect, it } from 'vitest';
import { apiErrorMessage, isPersistentErrorCode } from './errors';

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

  it('adjunta los detalles de validación (data) como lista copiable', () => {
    const message = apiErrorMessage(
      {
        message: 'El XML no valida (2 problema(s)); no se escribió el fichero',
        data: ["Element 'Tablix': ...", "Attribute 'Name' ..."],
      },
      'error al guardar',
    );
    expect(message).toBe(
      'El XML no valida (2 problema(s)); no se escribió el fichero\n' +
        "• Element 'Tablix': ...\n" +
        "• Attribute 'Name' ...",
    );
  });

  it('ignora detalles que no sean textos (p. ej. el error crudo de E/S)', () => {
    expect(apiErrorMessage({ message: 'Error de E/S', data: new Error('boom') }, 'x')).toBe(
      'Error de E/S',
    );
    expect(apiErrorMessage({ message: 'Error', data: ['', '  '] }, 'x')).toBe('Error');
  });
});

/** El banner no debe borrarse solo si el usuario tiene algo que hacer (BUG-57). */
describe('isPersistentErrorCode', () => {
  it('mantiene visibles los errores que exigen una acción', () => {
    expect(isPersistentErrorCode('E_UNSUPPORTED_SCHEMA')).toBe(true);
    expect(isPersistentErrorCode('E_CONFLICT')).toBe(true);
    expect(isPersistentErrorCode('E_IO')).toBe(true);
  });

  it('deja que el resto de errores se borren solos', () => {
    expect(isPersistentErrorCode('E_VALIDATION')).toBe(false);
    expect(isPersistentErrorCode('E_NOT_FOUND')).toBe(false);
    expect(isPersistentErrorCode('E_INVALID_XML')).toBe(false);
    expect(isPersistentErrorCode('E_INVALID_COMMAND')).toBe(false);
    expect(isPersistentErrorCode('E_UNEXPECTED')).toBe(false);
    expect(isPersistentErrorCode('')).toBe(false);
  });
});
