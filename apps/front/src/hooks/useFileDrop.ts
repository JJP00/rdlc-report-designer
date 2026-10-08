import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

/**
 * Drag&drop de `.rdlc`/`.rdl` sobre la ventana (U1): mantiene el overlay activo
 * mientras se arrastra y abre cada fichero válido en su pestaña (bloque A:
 * soltar varios abre cada uno). Vive en un hook para no engordar el shell.
 */

export interface FileDropHandlers {
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

export interface FileDropOptions {
  /** false sin backend (modo navegador): no hay `pathForFile`. */
  enabled: boolean;
  /** Abre las rutas soltadas, cada una en su pestaña (anti-duplicados incluido). */
  onOpenPaths: (paths: string[]) => void;
  /** Lo soltado no era un `.rdlc`/`.rdl`. */
  onInvalid: (message: string) => void;
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

export function useFileDrop(options: FileDropOptions): {
  dropActive: boolean;
  dropHandlers: FileDropHandlers;
} {
  const [dropActive, setDropActive] = useState(false);
  const depth = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const onDragEnter = useCallback((event: DragEvent): void => {
    if (!optionsRef.current.enabled || !hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDropActive(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent): void => {
    if (!optionsRef.current.enabled || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((event: DragEvent): void => {
    if (!optionsRef.current.enabled || !hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDropActive(false);
  }, []);

  const onDrop = useCallback((event: DragEvent): void => {
    const { enabled, onOpenPaths, onInvalid } = optionsRef.current;
    if (!enabled) return;
    event.preventDefault();
    depth.current = 0;
    setDropActive(false);
    const files = Array.from(event.dataTransfer.files);
    const paths = files
      .map((file) => window.api.pathForFile(file))
      .filter((path) => /\.(rdlc|rdl)$/i.test(path));
    if (paths.length > 0) onOpenPaths(paths);
    else if (files.length > 0) onInvalid('Solo se pueden abrir ficheros .rdlc o .rdl');
  }, []);

  return { dropActive, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
