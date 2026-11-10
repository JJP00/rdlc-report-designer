import { describe, expect, it } from 'vitest';
import { splitRecentPath } from './recentPath';

describe('splitRecentPath', () => {
  it('separa el nombre del fichero de su carpeta (Windows y POSIX)', () => {
    expect(splitRecentPath('C:\\Users\\ana\\OneDrive - BITEC\\Ventas\\Factura.rdlc')).toEqual({
      name: 'Factura.rdlc',
      folder: 'C:\\Users\\ana\\OneDrive - BITEC\\Ventas',
    });
    expect(splitRecentPath('/home/ana/informes/Pedido.rdl')).toEqual({
      name: 'Pedido.rdl',
      folder: '/home/ana/informes',
    });
  });

  it('sin carpeta, todo es el nombre', () => {
    expect(splitRecentPath('Factura.rdlc')).toEqual({ name: 'Factura.rdlc', folder: '' });
  });
});
