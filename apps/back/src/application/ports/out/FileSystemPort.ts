export const FILE_SYSTEM_PORT = Symbol('FileSystemPort');

export interface FileStat {
  mtimeMs: number;
  size: number;
}

/** Puerto de salida: acceso a ficheros (adaptador: NodeFs). */
export interface FileSystemPort {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, content: Buffer): Promise<void>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
}
