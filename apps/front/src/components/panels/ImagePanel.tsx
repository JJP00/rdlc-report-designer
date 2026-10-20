import type { EmbeddedImageDto, ImageDto, StylePatch } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ExpressionEditor } from './ExpressionEditor';

export interface ImageOptionsPatch {
  source?: 'External' | 'Embedded' | 'Database' | null;
  value?: string | null;
  mimeType?: string | null;
  sizing?: string | null;
}

interface ImagePanelProps {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
  /** Padding (y otros estilos) del item. */
  onSetStyle: (patch: StylePatch) => void;
  /** Catálogo `<EmbeddedImages>` del informe (desplegable de `Source=Embedded`). */
  embeddedImages?: EmbeddedImageDto[];
}

/** Origen (`Source` del RDL); el valor no se traduce, la pista sí. */
const SOURCES = [
  { value: 'Database', label: 'image.source.database' },
  { value: 'External', label: 'image.source.external' },
  { value: 'Embedded', label: 'image.source.embedded' },
] as const;

/** MIME del diálogo de Report Builder (+ valor actual si es otro). */
const MIME_TYPES = ['image/bmp', 'image/jpeg', 'image/gif', 'image/png', 'image/x-png'];

const SIZINGS = [
  { value: 'AutoSize', label: 'image.sizing.autoSize.label', help: 'image.sizing.autoSize.help' },
  { value: 'Fit', label: 'image.sizing.fit.label', help: 'image.sizing.fit.help' },
  {
    value: 'FitProportional',
    label: 'image.sizing.fitProportional.label',
    help: 'image.sizing.fitProportional.help',
  },
  { value: 'Clip', label: 'image.sizing.clip.label', help: 'image.sizing.clip.help' },
] as const;

/**
 * Propiedades de una imagen, como los diálogos de Report Builder: origen y
 * campo/expresión, MIME (desplegable estándar) y tamaño de visualización
 * (radios). El padding vive en el panel de propiedades (G12) y el ToolTip no se
 * ofrece (no se usa en BC).
 */
export function ImagePanel({
  item,
  onSetImageOptions,
  embeddedImages = [],
}: ImagePanelProps): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('image.title')}</span>
        <Badge variant="outline">{item.source ?? t('image.noSource')}</Badge>
      </div>

      {/* ------------------------------ origen ------------------------------ */}
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">{t('image.source.label')}</Label>
        <select
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={item.source ?? 'Database'}
          aria-label={t('image.source.label')}
          onChange={(event) =>
            onSetImageOptions({ source: event.target.value as ImageOptionsPatch['source'] })
          }
        >
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>

      <ValueSection
        item={item}
        embeddedImages={embeddedImages}
        onSetImageOptions={onSetImageOptions}
      />

      <MimeSection item={item} onSetImageOptions={onSetImageOptions} />

      {/* ----------------------- tamaño de visualización -------------------- */}
      <div className="grid gap-1.5">
        <Label className="text-[11px] text-muted-foreground">{t('image.sizing.label')}</Label>
        {SIZINGS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="radio"
              className="mt-0.5"
              name={`sizing-${item.id}`}
              checked={(item.sizing ?? 'FitProportional') === option.value}
              onChange={() => onSetImageOptions({ sizing: option.value })}
            />
            <span>
              <span className="font-medium">{t(option.label)}</span>
              <span className="block text-[11px] text-muted-foreground">{t(option.help)}</span>
            </span>
          </label>
        ))}
      </div>

      <Separator />
      <p className="text-[11px] text-muted-foreground">{t('image.canvasNote')}</p>
    </div>
  );
}

function FxToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (active: boolean) => void;
}): ReactNode {
  const t = useT();
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-xs"
      title={active ? t('image.fx.isExpression') : t('image.fx.convert')}
      onClick={() => onToggle(!active)}
    >
      <span className="text-[11px] italic leading-none">fx</span>
    </Button>
  );
}

function ensureExpression(text: string): string {
  const trimmed = text.trimStart();
  return trimmed.startsWith('=') ? text : text.length === 0 ? '=' : `=${text}`;
}

function ValueSection({
  item,
  embeddedImages,
  onSetImageOptions,
}: {
  item: ImageDto;
  embeddedImages: EmbeddedImageDto[];
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}): ReactNode {
  const t = useT();
  // Borrador mientras se escribe: un cambio externo no pisa el texto.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? item.value ?? '';
  const isExpression = value.trimStart().startsWith('=');

  const commit = (): void => {
    if (draft !== null && draft !== (item.value ?? '')) onSetImageOptions({ value: draft });
    setDraft(null);
  };

  // Incrustada: el `<Value>` debe ser el nombre de una entrada del catálogo.
  if (item.source === 'Embedded' && embeddedImages.length > 0) {
    const options =
      item.value && !embeddedImages.some((image) => image.name === item.value)
        ? [...embeddedImages, { name: item.value }]
        : embeddedImages;
    return (
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">{t('image.embedded.label')}</Label>
        <select
          className="h-7 rounded-md border bg-background px-1 font-mono text-xs"
          value={item.value ?? ''}
          aria-label={t('image.embedded.label')}
          onChange={(event) => {
            const picked = embeddedImages.find((image) => image.name === event.target.value);
            onSetImageOptions({
              value: event.target.value,
              ...(picked?.mimeType ? { mimeType: picked.mimeType } : {}),
            });
          }}
        >
          {item.value ? null : <option value="">{t('image.embedded.choose')}</option>}
          {options.map((image) => (
            <option key={image.name} value={image.name}>
              {image.mimeType
                ? t('image.embedded.option', { name: image.name, mimeType: image.mimeType })
                : image.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">
          {item.source === 'External' ? 'URL' : t('image.value.fieldLabel')}
        </Label>
        <FxToggle
          active={isExpression}
          onToggle={(next) => {
            const updated = next ? ensureExpression(value) : stripExpression(value);
            setDraft(null);
            onSetImageOptions({ value: updated });
          }}
        />
      </div>
      {isExpression ? (
        <ExpressionEditor
          value={value}
          mode="expression"
          ariaLabel={t('image.value.expressionAria')}
          onCommit={(next) => {
            if (next !== (item.value ?? '')) onSetImageOptions({ value: next });
          }}
        />
      ) : (
        <Input
          className="h-7 font-mono text-xs"
          placeholder={item.source === 'External' ? 'https://…' : '=Fields!Picture.Value'}
          value={value}
          aria-label={t('image.value.aria')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      )}
    </div>
  );
}

function MimeSection({
  item,
  onSetImageOptions,
}: {
  item: ImageDto;
  onSetImageOptions: (patch: ImageOptionsPatch) => void;
}): ReactNode {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const mimeType = draft ?? item.mimeType ?? 'image/png';
  const isExpression = mimeType.trimStart().startsWith('=');
  const options = MIME_TYPES.includes(mimeType) ? MIME_TYPES : [...MIME_TYPES, mimeType];

  const commit = (): void => {
    if (draft !== null && draft !== (item.mimeType ?? '')) onSetImageOptions({ mimeType: draft });
    setDraft(null);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{t('image.mime.label')}</Label>
        <FxToggle
          active={isExpression}
          onToggle={(next) => {
            const updated = next ? ensureExpression(mimeType) : stripExpression(mimeType);
            setDraft(null);
            onSetImageOptions({ mimeType: updated });
          }}
        />
      </div>
      {isExpression ? (
        <Input
          className="h-7 font-mono text-xs"
          value={mimeType}
          aria-label={t('image.mime.expressionAria')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      ) : (
        <select
          className="h-7 rounded-md border bg-background px-1 font-mono text-xs"
          value={mimeType}
          aria-label={t('image.mime.label')}
          onChange={(event) => onSetImageOptions({ mimeType: event.target.value })}
        >
          {options.map((mime) => (
            <option key={mime} value={mime}>
              {mime}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function stripExpression(text: string): string {
  return text.trimStart().startsWith('=') ? text.trimStart().slice(1).trim() : text;
}
