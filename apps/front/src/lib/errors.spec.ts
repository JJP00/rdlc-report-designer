import { describe, expect, it } from 'vitest';
import { createTranslator } from '@rdlc-designer/i18n';
import { apiErrorMessage, isPersistentErrorCode } from './errors';

const es = createTranslator('es');
const en = createTranslator('en');

/** El banner compone el motivo desde `reason`/`params`, nunca desde el código (fase 2). */
describe('apiErrorMessage', () => {
  it('compone el mensaje del motivo con el catálogo del idioma', () => {
    expect(
      apiErrorMessage({ reason: 'itemMissing', params: { id: 'Textbox1' } }, es, 'rechazado'),
    ).toBe("No existe el elemento 'Textbox1'");
    expect(
      apiErrorMessage({ reason: 'itemMissing', params: { id: 'Textbox1' } }, en, 'rejected'),
    ).toBe("Item not found: 'Textbox1'");
  });

  it('sin motivo traducido gana el mensaje específico; sin mensaje, el fallback por código', () => {
    // Motivo desconocido + mensaje del backend: el mensaje es lo único específico.
    expect(
      apiErrorMessage(
        { code: 'E_UNEXPECTED', reason: 'motivoDesconocido', message: 'boom' },
        es,
        'rechazado',
      ),
    ).toBe('boom');
    // Sin mensaje: fallback genérico por código.
    expect(apiErrorMessage({ code: 'E_UNEXPECTED', reason: 'motivoDesconocido' }, es, 'x')).toBe(
      'Error inesperado',
    );
    // Sin traducción de motivo ni de código: diagnóstico de la API.
    expect(apiErrorMessage({ message: 'boom' }, es, 'rechazado')).toBe('boom');
  });

  it('cae al fallback por código cuando no hay traducción ni diagnóstico', () => {
    expect(apiErrorMessage({ code: 'E_NOT_FOUND', reason: 'x' }, es, 'no se pudo hacer')).toBe(
      'No se encontró el recurso',
    );
    expect(apiErrorMessage({}, es, 'no se pudo hacer')).toBe('no se pudo hacer');
    expect(apiErrorMessage({ message: '   ' }, es, 'no se pudo hacer')).toBe('no se pudo hacer');
  });

  it('adjunta los detalles de validación (data) como lista copiable', () => {
    const message = apiErrorMessage(
      {
        reason: 'xsdValidationFailed',
        params: { count: 2 },
        data: ["Element 'Tablix': ...", "Attribute 'Name' ..."],
      },
      es,
      'error al guardar',
    );
    expect(message).toBe(
      'El XML no valida contra el esquema RDL 2016/01 (2 problemas); no se escribió el fichero\n' +
        "• Element 'Tablix': ...\n" +
        "• Attribute 'Name' ...",
    );
  });

  it('usa el plural real del motivo (ICU) para el conteo', () => {
    expect(apiErrorMessage({ reason: 'xsdValidationFailed', params: { count: 1 } }, es, 'x')).toBe(
      'El XML no valida contra el esquema RDL 2016/01 (1 problema); no se escribió el fichero',
    );
  });

  it('ignora detalles que no sean textos (p. ej. el error crudo de E/S)', () => {
    expect(
      apiErrorMessage(
        { reason: 'ioWriteFailed', params: { path: 'x.rdlc' }, data: new Error('boom') },
        es,
        'fallback',
      ),
    ).toBe('Error de E/S al escribir x.rdlc');
    expect(apiErrorMessage({ message: 'Error', data: ['', '  '] }, es, 'x')).toBe('Error');
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
