import type { ItemDto, Length, StylePatch } from '@rdlc-designer/contracts';
import { createContext, useCallback, useContext } from 'react';
import {
  itemPreview,
  stylePreview,
  tablixTrackPreview,
  type ItemPreviewBuilder,
} from '@/lib/scrubPreview';

/**
 * Canal de vista previa de los campos numéricos (`NumberInput.onPreview`): un
 * parche local sobre la proyección que el lienzo pinta al instante, sin comando
 * ni undo. `null` revierte. Lo provee `App` (`useItemEditing.previewItems`).
 */
export type ScrubPreview = (build: ItemPreviewBuilder | null) => void;

/** Sin proveedor (tests aislados de un panel) la vista previa es un no-op. */
export const ScrubPreviewContext = createContext<ScrubPreview>(() => undefined);

export function useScrubPreview(): ScrubPreview {
  return useContext(ScrubPreviewContext);
}

/** Vista previa de claves del item (`left`, `width`…): `null` revierte. */
export function useItemPreview(id: string): (patch: Partial<ItemDto> | null) => void {
  const preview = useScrubPreview();
  return useCallback(
    (patch) => preview(patch === null ? null : itemPreview(id, patch)),
    [id, preview],
  );
}

/** Vista previa de un `StylePatch` sobre los items dados: `null` revierte. */
export function useStylePreview(ids: readonly string[]): (patch: StylePatch | null) => void {
  const preview = useScrubPreview();
  // La lista llega nueva en cada render: se compara por contenido.
  const key = ids.join('\u0000');
  return useCallback(
    (patch) =>
      preview(patch === null ? null : stylePreview(key === '' ? [] : key.split('\u0000'), patch)),
    [key, preview],
  );
}

/** Vista previa del ancho de una columna / alto de una fila del Tablix: `null` revierte. */
export function useTablixTrackPreview(
  tablixId: string,
): (axis: 'row' | 'column', index: number, size: Length | null) => void {
  const preview = useScrubPreview();
  return useCallback(
    (axis, index, size) =>
      preview(size === null ? null : tablixTrackPreview(tablixId, axis, index, size)),
    [tablixId, preview],
  );
}
