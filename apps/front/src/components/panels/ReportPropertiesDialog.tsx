import type { Length, ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toCm } from '@/lib/projection';
import { ExpressionEditor } from './ExpressionEditor';

interface ReportPropertiesDialogProps {
  projection: ProjectionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetPageSize: (width: Length, height: Length) => void;
  onSetPageMargins: (margins: { top: Length; bottom: Length; left: Length; right: Length }) => void;
  /** Alto de la banda de página (encabezado/pie). */
  onSetRegionHeight: (region: 'pageHeader' | 'pageFooter' | 'body', height: Length) => void;
  /** Ancho de la sección (`ReportSection > Width`), que manda en el cuerpo. */
  onSetSectionWidth: (width: Length) => void;
  /** Impresión del encabezado/pie en la primera/última página. */
  onSetHeaderFooterOptions: (
    region: 'pageHeader' | 'pageFooter',
    options: { printOnFirstPage?: boolean; printOnLastPage?: boolean },
  ) => void;
  onSetReportCode: (code: string) => void;
}

/** Presets de papel en cm (vertical). */
const PAPER_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'A4', width: 21, height: 29.7 },
  { name: 'Letter', width: 21.59, height: 27.94 },
  { name: 'Legal', width: 21.59, height: 35.56 },
];

/**
 * Propiedades del informe: Configurar página (tamaño, orientación, márgenes)
 * y Código VB. Cada "Aplicar" emite comandos (atrás queda el journal de undo).
 */
export function ReportPropertiesDialog({
  projection,
  open,
  onOpenChange,
  onSetPageSize,
  onSetPageMargins,
  onSetRegionHeight,
  onSetSectionWidth,
  onSetHeaderFooterOptions,
  onSetReportCode,
}: ReportPropertiesDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propiedades del informe</DialogTitle>
          <DialogDescription>
            Configuración de página y código VB del informe ({projection.reportName}).
          </DialogDescription>
        </DialogHeader>

        {/* El formulario se monta al abrir: los borradores parten del documento
            y no se pierden cuando llega una proyección nueva mientras se edita. */}
        <ReportPropertiesForm
          projection={projection}
          onSetPageSize={onSetPageSize}
          onSetPageMargins={onSetPageMargins}
          onSetRegionHeight={onSetRegionHeight}
          onSetSectionWidth={onSetSectionWidth}
          onSetHeaderFooterOptions={onSetHeaderFooterOptions}
          onSetReportCode={onSetReportCode}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReportPropertiesForm({
  projection,
  onSetPageSize,
  onSetPageMargins,
  onSetRegionHeight,
  onSetSectionWidth,
  onSetHeaderFooterOptions,
  onSetReportCode,
}: Omit<ReportPropertiesDialogProps, 'open' | 'onOpenChange'>): ReactNode {
  const [width, setWidth] = useState(() => toCm(projection.page.width));
  const [height, setHeight] = useState(() => toCm(projection.page.height));
  const [margins, setMargins] = useState(() => ({
    top: toCm(projection.page.margins.top),
    bottom: toCm(projection.page.margins.bottom),
    left: toCm(projection.page.margins.left),
    right: toCm(projection.page.margins.right),
  }));
  // En RDL los flags de impresión valen `true` por defecto si no se declaran.
  const [headerHeight, setHeaderHeight] = useState(() => toCm(projection.page.header.height));
  const [headerFirst, setHeaderFirst] = useState(
    () => projection.page.header.printOnFirstPage ?? true,
  );
  const [headerLast, setHeaderLast] = useState(
    () => projection.page.header.printOnLastPage ?? true,
  );
  const [footerHeight, setFooterHeight] = useState(() => toCm(projection.page.footer.height));
  const [footerFirst, setFooterFirst] = useState(
    () => projection.page.footer.printOnFirstPage ?? true,
  );
  const [footerLast, setFooterLast] = useState(
    () => projection.page.footer.printOnLastPage ?? true,
  );
  /** Alto del cuerpo (`Body > Height`); también se arrastra en el lienzo (U10). */
  const [bodyHeight, setBodyHeight] = useState(() => toCm(projection.page.body.height));
  /** Ancho de la sección (`ReportSection > Width`); también se arrastra (U10). */
  const [bodyWidth, setBodyWidth] = useState(() => toCm(projection.page.body.width));
  const [code, setCode] = useState(() => projection.meta.code.text);

  const landscape = width > height;
  const toggleOrientation = (): void => {
    setWidth(height);
    setHeight(width);
  };

  const applyPage = (): void => {
    onSetPageSize(cmLength(width), cmLength(height));
    onSetPageMargins({
      top: cmLength(margins.top),
      bottom: cmLength(margins.bottom),
      left: cmLength(margins.left),
      right: cmLength(margins.right),
    });
    onSetRegionHeight('pageHeader', cmLength(headerHeight));
    onSetRegionHeight('pageFooter', cmLength(footerHeight));
    onSetSectionWidth(cmLength(bodyWidth));
    onSetRegionHeight('body', cmLength(bodyHeight));
    onSetHeaderFooterOptions('pageHeader', {
      printOnFirstPage: headerFirst,
      printOnLastPage: headerLast,
    });
    onSetHeaderFooterOptions('pageFooter', {
      printOnFirstPage: footerFirst,
      printOnLastPage: footerLast,
    });
  };

  return (
    <Tabs defaultValue="page">
      <TabsList>
        <TabsTrigger value="page">Configurar página</TabsTrigger>
        <TabsTrigger value="code">Código</TabsTrigger>
      </TabsList>

      <TabsContent
        value="page"
        className="flex flex-col gap-4 pt-2"
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar la página (teclado completo en el diálogo).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            applyPage();
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Papel</Label>
          <div className="flex gap-2">
            {PAPER_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }}
              >
                {preset.name}
              </Button>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={toggleOrientation}>
              {landscape ? 'Vertical' : 'Horizontal'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Ancho (cm)" value={width} onChange={setWidth} axis="x" />
          <NumberField label="Alto (cm)" value={height} onChange={setHeight} axis="y" />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Márgenes (cm)</Label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Superior"
              value={margins.top}
              axis="y"
              onChange={(value) => setMargins((m) => ({ ...m, top: value }))}
            />
            <NumberField
              label="Inferior"
              value={margins.bottom}
              axis="y"
              onChange={(value) => setMargins((m) => ({ ...m, bottom: value }))}
            />
            <NumberField
              label="Izquierdo"
              value={margins.left}
              axis="x"
              onChange={(value) => setMargins((m) => ({ ...m, left: value }))}
            />
            <NumberField
              label="Derecho"
              value={margins.right}
              axis="x"
              onChange={(value) => setMargins((m) => ({ ...m, right: value }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Encabezado y pie</Label>
          <div className="grid grid-cols-2 gap-3">
            <RegionFields
              idPrefix="header"
              title="Encabezado"
              height={headerHeight}
              onHeight={setHeaderHeight}
              first={headerFirst}
              onFirst={setHeaderFirst}
              last={headerLast}
              onLast={setHeaderLast}
            />
            <RegionFields
              idPrefix="footer"
              title="Pie"
              height={footerHeight}
              onHeight={setFooterHeight}
              first={footerFirst}
              onFirst={setFooterFirst}
              last={footerLast}
              onLast={setFooterLast}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Cuerpo</Label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Ancho del cuerpo (cm)"
              value={bodyWidth}
              axis="x"
              onChange={setBodyWidth}
            />
            <NumberField
              label="Alto del cuerpo (cm)"
              value={bodyHeight}
              axis="y"
              onChange={setBodyHeight}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={applyPage}>Aplicar</Button>
        </DialogFooter>
      </TabsContent>

      <TabsContent value="code" className="flex flex-col gap-2 pt-2">
        <p className="text-xs text-muted-foreground">
          Bloque <code>&lt;Code&gt;</code> VB (funciones <code>Code.</code>). Se reemplaza como un
          todo: un paso de undo.
        </p>
        <ExpressionEditor
          value={code}
          mode="code"
          ariaLabel="Código VB del informe"
          onCommit={setCode}
          onSubmit={(value) => {
            // Ctrl+Intro: commit + aplicar el código recién leído del editor.
            setCode(value);
            onSetReportCode(value);
          }}
        />
        <DialogFooter>
          <Button
            title="Aplicar (Ctrl+Intro)"
            onClick={() => {
              onSetReportCode(code);
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </TabsContent>
    </Tabs>
  );
}

/** Alto e impresión de una banda de página (encabezado o pie). */
function RegionFields({
  idPrefix,
  title,
  height,
  onHeight,
  first,
  onFirst,
  last,
  onLast,
}: {
  idPrefix: string;
  title: string;
  height: number;
  onHeight: (value: number) => void;
  first: boolean;
  onFirst: (value: boolean) => void;
  last: boolean;
  onLast: (value: boolean) => void;
}): ReactNode {
  const name = title.toLowerCase();
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
      <NumberField label={`Alto del ${name} (cm)`} value={height} onChange={onHeight} axis="y" />
      <CheckField
        id={`${idPrefix}-first`}
        label="Primera página"
        ariaLabel={`Imprimir el ${name} en la primera página`}
        checked={first}
        onChange={onFirst}
      />
      <CheckField
        id={`${idPrefix}-last`}
        label="Última página"
        ariaLabel={`Imprimir el ${name} en la última página`}
        checked={last}
        onChange={onLast}
      />
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

function cmLength(value: number): Length {
  return { value: Math.round(value * 10000) / 10000, unit: 'cm' };
}
