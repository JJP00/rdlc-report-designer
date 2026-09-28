import type { StyleDto, StylePatch } from '@rdlc-designer/contracts';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  ListX,
  Underline,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { useSystemFonts } from '@/hooks/useSystemFonts';
import { toHexColor, toPt } from '@/lib/style';

interface FormatToolbarProps {
  style: StyleDto | undefined;
  onSetStyle: (patch: StylePatch) => void;
  /** Sin textbox seleccionado la barra se muestra deshabilitada. */
  disabled?: boolean;
}

/**
 * Barra de formato de texto (como la de Report Builder): fuente, tamaño,
 * negrita/cursiva/subrayado, color, resaltado y alineación/viñetas.
 * Aplica al `<Style>` del item seleccionado vía comando `setStyle`.
 * Las fuentes se leen del **sistema** (registro de Windows vía IPC).
 */
export function FormatToolbar({ style, onSetStyle, disabled }: FormatToolbarProps): ReactNode {
  const fonts = useSystemFonts();

  // La fuente del estilo actual siempre debe poder seleccionarse.
  const options =
    style?.fontFamily && !fonts.includes(style.fontFamily) ? [style.fontFamily, ...fonts] : fonts;

  const fontSizePt = style?.fontSize ? Math.round(toPt(style.fontSize) * 10) / 10 : 10;

  const toggle = (
    active: boolean,
    patch: StylePatch,
    icon: ReactNode,
    title: string,
  ): ReactNode => (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="icon-xs"
      title={title}
      onClick={() => onSetStyle(patch)}
    >
      {icon}
    </Button>
  );

  return (
    <div
      className={`flex flex-col gap-2 border-b bg-background px-3 py-1.5 ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <select
          className="h-7 max-w-[130px] rounded-md border bg-background px-1 text-xs"
          value={style?.fontFamily ?? 'Arial'}
          aria-label="Fuente"
          onChange={(event) => onSetStyle({ fontFamily: event.target.value })}
        >
          {options.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>

        <Input
          className="h-7 w-14 text-xs tabular-nums"
          type="number"
          min={4}
          max={72}
          title="Tamaño (pt)"
          value={fontSizePt}
          onChange={(event) => {
            const value = Number.parseFloat(event.target.value);
            if (Number.isFinite(value) && value > 0) {
              onSetStyle({ fontSize: { value, unit: 'pt' } });
            }
          }}
        />

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {toggle(
          style?.fontWeight === 'Bold',
          { fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' },
          <Bold />,
          'Negrita',
        )}
        {toggle(
          style?.fontStyle === 'Italic',
          { fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' },
          <Italic />,
          'Cursiva',
        )}
        {toggle(
          style?.textDecoration === 'Underline',
          { textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline' },
          <Underline />,
          'Subrayado',
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ColorField
          title="Color de texto"
          value={toHexColor(style?.color, '#111827')}
          onChange={(color) => onSetStyle({ color })}
        />
        <ColorField
          title="Resaltado"
          value={toHexColor(style?.backgroundColor, '#ffffff')}
          onChange={(backgroundColor) => onSetStyle({ backgroundColor })}
          highlight
        />
      </div>

      <div className="flex items-center gap-1.5">
        {toggle(
          style?.textAlign === 'Left',
          { textAlign: 'Left' },
          <AlignLeft />,
          'Alinear izquierda',
        )}
        {toggle(style?.textAlign === 'Center', { textAlign: 'Center' }, <AlignCenter />, 'Centrar')}
        {toggle(
          style?.textAlign === 'Right',
          { textAlign: 'Right' },
          <AlignRight />,
          'Alinear derecha',
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        {toggle(style?.listStyle === 'Bulleted', { listStyle: 'Bulleted' }, <List />, 'Viñetas')}
        {toggle(
          style?.listStyle === 'Numbered',
          { listStyle: 'Numbered' },
          <ListOrdered />,
          'Numeración',
        )}
        {toggle(
          style?.listStyle === undefined || style?.listStyle === 'None',
          { listStyle: 'None' },
          <ListX />,
          'Sin lista',
        )}
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        {toggle(
          style?.verticalAlign === 'Top',
          { verticalAlign: 'Top' },
          <span className="text-[10px] leading-none">A↑</span>,
          'Alinear arriba',
        )}
        {toggle(
          style?.verticalAlign === 'Middle',
          { verticalAlign: 'Middle' },
          <span className="text-[10px] leading-none">A↕</span>,
          'Centrar vertical',
        )}
        {toggle(
          style?.verticalAlign === 'Bottom',
          { verticalAlign: 'Bottom' },
          <span className="text-[10px] leading-none">A↓</span>,
          'Alinear abajo',
        )}{' '}
      </div>
    </div>
  );
}

function ColorField({
  title,
  value,
  onChange,
  highlight,
}: {
  title: string;
  value: string;
  onChange: (color: string) => void;
  highlight?: boolean;
}): ReactNode {
  // Commit diferido: arrastrar la paleta no lanza un comando por paso.
  const { color, change } = useDeferredColor(value, highlight ? '#ffffff' : '#111827', onChange);

  return (
    <label
      title={title}
      className="flex h-7 w-8 cursor-pointer items-center justify-center rounded-md border bg-background text-[11px] font-bold hover:bg-muted"
    >
      <span
        className={highlight ? 'rounded-sm px-0.5' : ''}
        style={highlight ? { backgroundColor: color } : { color }}
      >
        A
      </span>
      <input
        type="color"
        className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        value={color}
        aria-label={title}
        onChange={(event) => change(event.target.value)}
      />
    </label>
  );
}
