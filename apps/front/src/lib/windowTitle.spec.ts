import { describe, expect, it } from 'vitest';
import { formatWindowTitle } from './windowTitle';

/** Título de ventana/pestaña: informe abierto, marca de cambios y app (BUG-59). */
describe('formatWindowTitle', () => {
  it('sin fichero muestra solo el nombre de la aplicación', () => {
    expect(formatWindowTitle(null, false)).toBe('RDLC Report Designer');
  });

  it('con fichero muestra el nombre y la aplicación, sin marca si está guardado', () => {
    expect(formatWindowTitle('C:\\informes\\Pedidos.rdlc', false)).toBe(
      'Pedidos.rdlc — RDLC Report Designer',
    );
    expect(formatWindowTitle('/home/ana/Stock.RDL', false)).toBe(
      'Stock.RDL — RDLC Report Designer',
    );
  });

  it('marca los cambios sin guardar con « *»', () => {
    expect(formatWindowTitle('C:\\informes\\Pedidos.rdlc', true)).toBe(
      'Pedidos.rdlc * — RDLC Report Designer',
    );
  });

  it('acepta rutas relativas y con barra final (cae a la ruta completa)', () => {
    expect(formatWindowTitle('Pedidos.rdlc', false)).toBe('Pedidos.rdlc — RDLC Report Designer');
    expect(formatWindowTitle('C:\\datos\\', false)).toBe('C:\\datos\\ — RDLC Report Designer');
  });
});
