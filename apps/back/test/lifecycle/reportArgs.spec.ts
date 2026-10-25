import { describe, expect, it } from 'vitest';
import { findRdlcArg } from '../../src/lifecycle/reportArgs.js';

/** `findRdlcArg`: primer `.rdlc`/`.rdl` de un argv (arranque y 2.ª instancia). */

describe('findRdlcArg', () => {
  it('encuentra el informe entre los argumentos', () => {
    expect(findRdlcArg(['app.js', 'C:/r/Informe.rdlc', '--user-data-dir=x'])).toBe(
      'C:/r/Informe.rdlc',
    );
    expect(findRdlcArg(['C:/Program Files/RDLC/x.exe', 'D:/otros/Otro.rdl'])).toBe(
      'D:/otros/Otro.rdl',
    );
  });

  it('no distingue mayúsculas en la extensión', () => {
    expect(findRdlcArg(['a.RDLC'])).toBe('a.RDLC');
    expect(findRdlcArg(['b.Rdl'])).toBe('b.Rdl');
  });

  it('devuelve el primero cuando hay varios', () => {
    expect(findRdlcArg(['a.rdlc', 'b.rdlc'])).toBe('a.rdlc');
  });

  it('sin informe en la línea de comandos, null', () => {
    expect(findRdlcArg([])).toBeNull();
    expect(findRdlcArg(['app.js', '--user-data-dir=x', '.'])).toBeNull();
  });
});
