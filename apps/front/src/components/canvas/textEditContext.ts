import { createContext, useContext } from 'react';

/**
 * Abrir el editor de texto de un textbox. Va por **contexto** y no por props
 * para que los items anidados (rectángulos y celdas de Tablix) lo reciban sin
 * atravesar `Paper`: el lienzo lo publica y cada `ItemView` lo consume.
 */
export const TextEditContext = createContext<((id: string) => void) | null>(null);

/** Callback de edición de texto del lienzo (`null` fuera de él). */
export function useTextEdit(): ((id: string) => void) | null {
  return useContext(TextEditContext);
}
