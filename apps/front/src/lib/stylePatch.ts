import type { ItemDto, StyleDto, StylePatch } from '@rdlc-designer/contracts';

/**
 * Fusiona un `StylePatch` en un estilo: `null` quita la propiedad y `padding`/
 * `border` (anidados) se fusionan lado a lado sin borrar los demás. Se usa en
 * el camino optimista de `setStyle` (un item y el lote de la multiselección) y
 * en la vista previa de los campos numéricos al arrastrar.
 */
export function mergeStylePatch(style: StyleDto | undefined, patch: StylePatch): StyleDto {
  const nextStyle: StyleDto = { ...(style ?? {}) };
  const target = nextStyle as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete target[key];
    else if (value === undefined) continue;
    else if (key === 'padding') {
      target[key] = {
        ...((target[key] as Record<string, unknown> | undefined) ?? {}),
        ...(value as Record<string, unknown>),
      };
    } else if (key === 'border') {
      // Parche por lado: un lado a `null` quita su override.
      const next: Record<string, unknown> = {
        ...((target[key] as Record<string, unknown> | undefined) ?? {}),
      };
      for (const [side, sideValue] of Object.entries(value as Record<string, unknown>)) {
        if (sideValue === null) delete next[side];
        else if (sideValue !== undefined) next[side] = sideValue;
      }
      if (Object.keys(next).length > 0) target[key] = next;
      else delete target[key];
    } else target[key] = value;
  }
  return nextStyle;
}

/**
 * Parche optimista de un `StylePatch` sobre un item. `textAlign` se redirige al
 * `<Style>` de **cada párrafo** (BC solo lo lee ahí: ver `setStyle` del dominio)
 * y, si el item no tiene párrafos (Rectangle…), cae a su `<Style>` como en el
 * backend. El resto del parche va al item como siempre. Sin esta redirección la
 * barra de formato parecería no responder: los párrafos sombrean al item.
 */
export function optimisticStylePatch(item: ItemDto, patch: StylePatch): Partial<ItemDto> {
  const { textAlign, ...rest } = patch;
  const toParagraphs =
    textAlign !== undefined && item.kind === 'textbox' && item.paragraphs.length > 0;

  const style = mergeStylePatch(item.style, toParagraphs ? rest : patch);
  const paragraphs =
    toParagraphs && item.kind === 'textbox'
      ? item.paragraphs.map((paragraph) => ({
          ...paragraph,
          style: mergeStylePatch(paragraph.style, { textAlign }),
        }))
      : undefined;

  return {
    style: Object.keys(style).length > 0 ? style : undefined,
    ...(paragraphs ? { paragraphs } : {}),
  };
}
