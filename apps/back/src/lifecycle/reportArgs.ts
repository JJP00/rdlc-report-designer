/** Extensiones de informe que la app sabe abrir (asociación de ficheros / CLI). */
const REPORT_ARG = /\.(rdlc|rdl)$/i;

/**
 * Primer argumento que apunta a un informe (`.rdlc`/`.rdl`). Vale tanto para
 * el arranque (`process.argv`) como para la segunda instancia: el evento
 * `second-instance` entrega el argv completo, con el ejecutable en `argv[0]`.
 */
export function findRdlcArg(argv: readonly string[]): string | null {
  return argv.find((arg) => REPORT_ARG.test(arg)) ?? null;
}
