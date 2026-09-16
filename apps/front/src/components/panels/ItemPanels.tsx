import type { ItemDto, Length, StylePatch, TextboxDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { ImagePanel, type ImageOptionsPatch } from '@/components/panels/ImagePanel';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { TextPanel } from '@/components/panels/TextPanel';

export interface ItemPanelsProps {
  item: ItemDto | undefined;
  onSetLocation: (top: Length, left: Length) => void;
  onSetSize: (width: Length, height: Length) => void;
  onSetStyle: (patch: StylePatch) => void;
  onSetText: (p: number, r: number, value: string) => void;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}

/**
 * Columna derecha: propiedades del item seleccionado más el panel específico de
 * su tipo (texto/expresión o imagen).
 */
export function ItemPanels({
  item,
  onSetLocation,
  onSetSize,
  onSetStyle,
  onSetText,
  onSetImageOptions,
}: ItemPanelsProps): ReactNode {
  if (!item) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Selecciona un elemento en el lienzo para editar sus propiedades.
      </p>
    );
  }

  return (
    <>
      <PropertiesPanel item={item} onSetLocation={onSetLocation} onSetSize={onSetSize} />
      {item.kind === 'textbox' ? (
        <TextPanel item={item as TextboxDto} onSetText={onSetText} onSetStyle={onSetStyle} />
      ) : null}
      {item.kind === 'image' ? (
        <ImagePanel item={item} onSetImageOptions={onSetImageOptions} onSetStyle={onSetStyle} />
      ) : null}
    </>
  );
}
