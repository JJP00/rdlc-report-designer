import type { ImageDto } from '@rdlc-designer/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export interface ImageOptionsPatch {
  source?: 'External' | 'Embedded' | 'Database' | null;
  value?: string | null;
  mimeType?: string | null;
  sizing?: string | null;
}

interface ImagePanelProps {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}

const SOURCES = [
  { value: 'Database', label: 'Database (campo del dataset)' },
  { value: 'External', label: 'External (URL)' },
  { value: 'Embedded', label: 'Embedded (incrustada)' },
] as const;

const SIZINGS = ['FitProportional', 'Fit', 'Clip', 'AutoSize', 'Stretch'];

/**
 * Propiedades de una imagen, como el diálogo de Report Builder: origen,
 * campo/expresión, MIME y ajuste. El ToolTip no se ofrece (no se usa en BC).
 */
export function ImagePanel({ item, onSetImageOptions }: ImagePanelProps): ReactNode {
  const [value, setValue] = useState(item.value ?? '');
  const [mimeType, setMimeType] = useState(item.mimeType ?? 'image/png');

  useEffect(() => {
    setValue(item.value ?? '');
    setMimeType(item.mimeType ?? 'image/png');
  }, [item.id, item.value, item.mimeType]);

  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Imagen</span>
        <Badge variant="outline">{item.source ?? 'sin origen'}</Badge>
      </div>

      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Origen de la imagen</Label>
        <select
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={item.source ?? 'Database'}
          onChange={(event) =>
            onSetImageOptions({ source: event.target.value as ImageOptionsPatch['source'] })
          }
        >
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">
          {item.source === 'External' ? 'URL' : 'Campo / expresión'}
        </Label>
        <Input
          className="h-7 font-mono text-xs"
          placeholder={item.source === 'External' ? 'https://…' : '=Fields!Picture.Value'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            if (value !== (item.value ?? '')) onSetImageOptions({ value });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value !== (item.value ?? '')) onSetImageOptions({ value });
          }}
        />
      </div>

      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Tipo MIME</Label>
        <Input
          className="h-7 font-mono text-xs"
          value={mimeType}
          onChange={(event) => setMimeType(event.target.value)}
          onBlur={() => {
            if (mimeType !== (item.mimeType ?? 'image/png')) onSetImageOptions({ mimeType });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && mimeType !== (item.mimeType ?? 'image/png')) {
              onSetImageOptions({ mimeType });
            }
          }}
        />
      </div>

      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Ajuste</Label>
        <select
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={item.sizing ?? 'FitProportional'}
          onChange={(event) => onSetImageOptions({ sizing: event.target.value })}
        >
          {SIZINGS.map((sizing) => (
            <option key={sizing} value={sizing}>
              {sizing}
            </option>
          ))}
        </select>
      </div>

      <Separator />
      <p className="text-[11px] text-muted-foreground">
        En el lienzo se dibuja un placeholder: el contenido real (campo de BC o URL) solo se
        resuelve al renderizar el informe.
      </p>
    </div>
  );
}
