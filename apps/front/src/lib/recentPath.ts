/**
 * Partes de la ruta de un informe reciente: el **nombre** del fichero y su
 * **carpeta**. Las rutas recientes suelen compartir el principio
 * (`C:\Users\…\OneDrive - …`): lo que las distingue está al final.
 */
export function splitRecentPath(path: string): { name: string; folder: string } {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (cut < 0) return { name: path, folder: '' };
  return { name: path.slice(cut + 1), folder: path.slice(0, cut) };
}
