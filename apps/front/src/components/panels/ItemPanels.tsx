import type {
  EmbeddedImageDto,
  ItemDto,
  Length,
  StylePatch,
  TextboxDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import { ImagePanel, type ImageOptionsPatch } from '@/components/panels/ImagePanel';
import { PropertiesPanel, type ItemOptionsPatch } from '@/components/panels/PropertiesPanel';
import { TextPanel } from '@/components/panels/TextPanel';

export interface ItemPanelsProps {
  item: ItemDto | undefined;
  /** El item es contenido directo de una celda (posiciones/tamaño los fija la celda). */
  cellContent?: boolean;
  onSetLocation: (top: Length, left: Length) => void;
  onSetSize: (width: Length, height: Length) => void;
  onSetStyle: (patch: StylePatch) => void;
  /** Renombra el elemento (lo valida el dominio). */
  onSetName: (name: string) => void;
  /** `null` = quitar la visibilidad declarada. */
  onSetVisibility: (hidden: boolean | string | null) => void;
  /** `CanGrow`/`KeepTogether` (solo Textbox). */
  onSetItemOptions: (options: ItemOptionsPatch) => void;
  /** Salto de página del item (Rectangle/Tablix). */
  onSetPageBreak: (breakLocation: 'None' | 'Start' | 'End' | 'Between') => void;
  onSetText: (p: number, r: number, value: string) => void;
  /** Etiqueta de diseñador del run (`<Label>`); `null` la quita. */
  onSetLabel: (p: number, r: number, label: string | null) => void;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
  /** Catálogo `<EmbeddedImages>` del informe (panel de imagen). */
  embeddedImages?: EmbeddedImageDto[];
  /** Abre el editor de texto del textbox (párrafos → runs). */
  onEditText: (id: string) => void;
}

/**
 * Columna derecha: propiedades del item seleccionado más el panel específico de
 * su tipo (texto/expresión o imagen).
 */
export function ItemPanels({
  item,
  cellContent,
  onSetLocation,
  onSetSize,
  onSetStyle,
  onSetName,
  onSetVisibility,
  onSetItemOptions,
  onSetPageBreak,
  onSetText,
  onSetLabel,
  onSetImageOptions,
  embeddedImages,
  onEditText,
}: ItemPanelsProps): ReactNode {
  const t = useT();
  if (!item) {
    return <p className="p-4 text-xs text-muted-foreground">{t('panels.item.empty')}</p>;
  }

  return (
    <>
      <PropertiesPanel
        item={item}
        cellContent={cellContent}
        onSetLocation={onSetLocation}
        onSetSize={onSetSize}
        onSetStyle={onSetStyle}
        onSetName={onSetName}
        onSetVisibility={onSetVisibility}
        onSetItemOptions={onSetItemOptions}
        onSetPageBreak={onSetPageBreak}
      />
      {item.kind === 'textbox' ? (
        <TextPanel
          item={item as TextboxDto}
          onSetText={onSetText}
          onSetLabel={onSetLabel}
          onSetStyle={onSetStyle}
          onOpenEditor={() => onEditText(item.id)}
        />
      ) : null}
      {item.kind === 'image' ? (
        <ImagePanel
          item={item}
          onSetImageOptions={onSetImageOptions}
          onSetStyle={onSetStyle}
          embeddedImages={embeddedImages}
        />
      ) : null}
    </>
  );
}
