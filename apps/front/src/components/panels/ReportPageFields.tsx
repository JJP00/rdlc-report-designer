import { useT } from '@rdlc-designer/i18n/react';
import { Plus, RectangleHorizontal, RectangleVertical, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { PAPER_PRESETS, type BandDraft, type MarginSide } from './pageDraft';

/** Papel: tamaño (presets) y orientación. */
export function PaperFields({
  uid,
  selectedPaper,
  landscape,
  onSelectPaper,
  onSetOrientation,
}: {
  uid: string;
  selectedPaper: string;
  landscape: boolean;
  onSelectPaper: (name: string) => void;
  onSetOrientation: (landscape: boolean) => void;
}): ReactNode {
  const t = useT();
  const orientationName = `${uid}-orientation`;
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{t('report.paper.label')}</Label>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid w-44 gap-1">
          <Label htmlFor={`${uid}-paper-size`} className="text-[11px] text-muted-foreground">
            {t('report.paper.size')}
          </Label>
          <select
            id={`${uid}-paper-size`}
            className="h-8 rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
            aria-label={t('report.paper.sizeAria')}
            value={selectedPaper}
            onChange={(event) => onSelectPaper(event.target.value)}
          >
            {PAPER_PRESETS.map((preset) => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
            <option value="custom">{t('report.paper.custom')}</option>
          </select>
        </div>

        <div className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t('report.paper.orientation')}</span>
          <div
            role="radiogroup"
            aria-label={t('report.paper.orientationAria')}
            className="flex h-8 items-center gap-3"
          >
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="radio"
                name={orientationName}
                className="accent-primary"
                checked={!landscape}
                onChange={() => onSetOrientation(false)}
                aria-label={t('report.paper.portrait')}
              />
              <RectangleVertical className="size-4 text-muted-foreground" />
              {t('report.paper.portrait')}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="radio"
                name={orientationName}
                className="accent-primary"
                checked={landscape}
                onChange={() => onSetOrientation(true)}
                aria-label={t('report.paper.landscape')}
              />
              <RectangleHorizontal className="size-4 text-muted-foreground" />
              {t('report.paper.landscape')}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ancho y alto de la página. */
export function PageSizeFields({
  width,
  height,
  onWidth,
  onHeight,
}: {
  width: number;
  height: number;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField label={t('report.page.width')} value={width} onChange={onWidth} axis="x" />
      <NumberField label={t('report.page.height')} value={height} onChange={onHeight} axis="y" />
    </div>
  );
}

/** Márgenes: arriba, abajo, izquierda y derecha. */
export function MarginFields({
  margins,
  onChange,
}: {
  margins: Record<MarginSide, number>;
  onChange: (side: MarginSide, value: number) => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{t('report.page.margins')}</Label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('common.top')}
          value={margins.top}
          axis="y"
          onChange={(value) => onChange('top', value)}
        />
        <NumberField
          label={t('common.bottom')}
          value={margins.bottom}
          axis="y"
          onChange={(value) => onChange('bottom', value)}
        />
        <NumberField
          label={t('common.left')}
          value={margins.left}
          axis="x"
          onChange={(value) => onChange('left', value)}
        />
        <NumberField
          label={t('common.right')}
          value={margins.right}
          axis="x"
          onChange={(value) => onChange('right', value)}
        />
      </div>
    </div>
  );
}

/** Encabezado y pie de página: alto, impresión e inserción/borrado. */
export function BandFields({
  uid,
  variant,
  header,
  footer,
  onHeader,
  onFooter,
}: {
  uid: string;
  variant: 'dialog' | 'panel';
  header: BandDraft;
  footer: BandDraft;
  onHeader: (patch: Partial<BandDraft>) => void;
  onFooter: (patch: Partial<BandDraft>) => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{t('report.page.headerFooter')}</Label>
      {/* En el inspector (320 px) las tarjetas van en vertical: en dos
            columnas la etiqueta larga saltaba de línea y descuadraba el campo. */}
      <div className={variant === 'panel' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <RegionFields
          idPrefix={`${uid}-header`}
          title={t('report.region.headerTitle')}
          name={t('report.region.headerName')}
          band={header}
          onChange={onHeader}
        />
        <RegionFields
          idPrefix={`${uid}-footer`}
          title={t('report.region.footerTitle')}
          name={t('report.region.footerName')}
          band={footer}
          onChange={onFooter}
        />
      </div>
    </div>
  );
}

/** Ancho de la sección y alto del cuerpo. */
export function BodyFields({
  width,
  height,
  onWidth,
  onHeight,
}: {
  width: number;
  height: number;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{t('report.page.body')}</Label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t('report.page.bodyWidth')} value={width} axis="x" onChange={onWidth} />
        <NumberField
          label={t('report.page.bodyHeight')}
          value={height}
          axis="y"
          onChange={onHeight}
        />
      </div>
    </div>
  );
}

/** Alto, impresión e inserción/borrado de una banda de página (encabezado o pie). */
function RegionFields({
  idPrefix,
  title,
  name,
  band,
  onChange,
}: {
  idPrefix: string;
  /** Etiqueta de la banda («Encabezado»/«Pie»). */
  title: string;
  /** Nombre de la banda para las frases («encabezado»/«pie»). */
  name: string;
  band: BandDraft;
  onChange: (patch: Partial<BandDraft>) => void;
}): ReactNode {
  const t = useT();
  const { present } = band;
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <Button
          variant={present ? 'ghost' : 'outline'}
          size="xs"
          aria-label={
            present
              ? t('report.region.removeAria', { name })
              : t('report.region.insertAria', { name })
          }
          title={
            present
              ? t('report.region.removeTitle', { name })
              : t('report.region.insertTitle', { name })
          }
          onClick={() => onChange({ present: !present })}
        >
          {present ? (
            <>
              <Trash2 /> {t('report.region.remove')}
            </>
          ) : (
            <>
              <Plus /> {t('report.region.insert')}
            </>
          )}
        </Button>
      </div>
      {present ? (
        <>
          <NumberField
            label={t('report.region.height', { name })}
            value={band.height}
            onChange={(height) => onChange({ height })}
            axis="y"
          />
          <CheckField
            id={`${idPrefix}-first`}
            label={t('report.region.firstPage')}
            ariaLabel={t('report.region.printFirstAria', { name })}
            checked={band.first}
            onChange={(first) => onChange({ first })}
          />
          <CheckField
            id={`${idPrefix}-last`}
            label={t('report.region.lastPage')}
            ariaLabel={t('report.region.printLastAria', { name })}
            checked={band.last}
            onChange={(last) => onChange({ last })}
          />
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t('report.region.empty', { name })}</p>
      )}
    </div>
  );
}

/** Checkbox con etiqueta (los flags de impresión de las bandas). */
function CheckField({
  id,
  label,
  ariaLabel,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): ReactNode {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox
        id={id}
        aria-label={ariaLabel}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
      />
      {label}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  axis,
  invert,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Eje del arrastre del `NumberInput` estándar. */
  axis?: 'x' | 'y';
  invert?: boolean;
}): ReactNode {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <NumberInput
        className="h-7 flex-1 text-xs"
        value={value}
        label={label}
        axis={axis}
        invert={invert}
        min={0}
        onCommit={onChange}
      />
    </div>
  );
}
