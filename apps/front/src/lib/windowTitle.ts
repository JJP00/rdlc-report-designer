/**
 * Nombre del fichero de una ruta (partiendo por `/` y `\` para Windows y
 * POSIX). Se usa en el título de la ventana y en la tira de pestañas.
 */
export function fileBasename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Título de la ventana (BUG-59): nombre del fichero abierto —partiendo por `/`
 * y `\` para Windows y POSIX— con ` *` si hay cambios sin guardar. Sin
 * fichero, solo el nombre de la aplicación.
 */
export function formatWindowTitle(path: string | null, dirty: boolean): string {
  if (!path) return 'RDLC Report Designer';
  const basename = fileBasename(path);
  return `${basename}${dirty ? ' *' : ''} — RDLC Report Designer`;
}
