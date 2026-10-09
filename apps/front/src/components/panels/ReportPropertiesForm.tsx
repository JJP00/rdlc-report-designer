import type { Length, ProjectionDto } from '@rdlc-designer/contracts';
import { Plus, RectangleHorizontal, RectangleVertical, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toCm } from '@/lib/projection';
import { ExpressionEditor } from './ExpressionEditor';

export interface ReportPropertiesFormProps {
  projection: ProjectionDto;
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
  /** Inserta o quita la banda de página (`PageHeader`/`PageFooter`). */
  onSetRegionPresent: (region: 'pageHeader' | 'pageFooter', present: boolean) => void;
  onSetReportCode: (code: string) => void;
  /** `dialog` ajusta el pie al marco del diálogo; `panel` al inspector lateral. */
  variant?: 'dialog' | 'panel';
  /** Pestaña activa; el panel la mantiene fuera del remonte por huella (BUG-37). */
  tab?: string;
  onTabChange?: (tab: string) => void;
}

/** Presets de papel en cm (vertical), como la lista de Report Builder. */
const PAPER_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'Letter', width: 21.59, height: 27.94 },
  { name: 'Tabloid', width: 27.94, height: 43.18 },
  { name: 'Legal', width: 21.59, height: 35.56 },
  { name: 'Statement', width: 13.97, height: 21.59 },
  { name: 'Executive', width: 18.41, height: 26.67 },
  { name: 'A3', width: 29.7, height: 42 },
  { name: 'A4', width: 21, height: 29.7 },
  { name: 'A5', width: 14.8, height: 21 },
  { name: 'A6', width: 10.5, height: 14.8 },
  { name: '215 x 330', width: 21.5, height: 33 },
  { name: '9 x 11', width: 22.86, height: 27.94 },
  { name: 'B4', width: 25, height: 35.3 },
  { name: '5 x 7', width: 12.7, height: 17.78 },
  { name: 'B6', width: 12.5, height: 17.6 },
  { name: '8 x 10', width: 20.32, height: 25.4 },
  { name: 'Postcard', width: 10.16, height: 15.24 },
  { name: 'Oversized A4', width: 22.7, height: 31.7 },
];

/** Tolerancia para reconocer un preset (cm). */
const PAPER_TOLERANCE_CM = 0.05;

/** Alto por defecto de una banda recién insertada (igual que el dominio). */
const DEFAULT_BAND_CM = 1.25;

/** Nombre del preset que corresponde a esas medidas en esa orientación. */
function paperNameFor(width: number, height: number): string {
  const landscape = width > height;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= PAPER_TOLERANCE_CM;
  const preset = PAPER_PRESETS.find((candidate) =>
    landscape
      ? near(width, candidate.height) && near(height, candidate.width)
      : near(width, candidate.width) && near(height, candidate.height),
  );
  return preset?.name ?? 'custom';
}

/**
 * Huella de lo que edita el formulario (página). El panel lateral la usa como
 * `key`: si el documento cambia por fuera (undo, arrastre de la página en el
 * lienzo), el borrador se remonta con los valores vigentes; los cambios que no
 * toca el formulario (mover un item, p. ej.) no lo reinician.
 *
 * El bloque `<Code>` **no** entra en la huella: aplicarlo cambiaba la huella y
 * remontaba el formulario, reseteando la pestaña activa y los borradores de
 * página sin aplicar (BUG-37). El búfer del editor se sincroniza con un efecto.
 */
export function reportPropertiesSignature(projection: ProjectionDto): string {
  const { page } = projection;
  return JSON.stringify([
    page.width,
    page.height,
    page.margins,
    page.header.present,
    page.header.height,
    page.header.printOnFirstPage,
    page.header.printOnLastPage,
    page.footer.present,
    page.footer.height,
    page.footer.printOnFirstPage,
    page.footer.printOnLastPage,
    page.body.width,
    page.body.height,
  ]);
}

/**
 * Propiedades del informe: Configurar página (tamaño, orientación, márgenes,
 * encabezado/pie) y Código VB. Cada "Aplicar" emite comandos (atrás queda el
 * journal de undo). El formulario no se resincroniza solo: el contenedor decide
 * cuándo remontarlo (el diálogo al abrir, el panel con la huella).
 */
export function ReportPropertiesForm({
  projection,
  onSetPageSize,
  onSetPageMargins,
  onSetRegionHeight,
  onSetSectionWidth,
  onSetHeaderFooterOptions,
  onSetRegionPresent,
  onSetReportCode,
  variant = 'dialog',
  tab,
  onTabChange,
}: ReportPropertiesFormProps): ReactNode {
  const [width, setWidth] = useState(() => toCm(projection.page.width));
  const [height, setHeight] = useState(() => toCm(projection.page.height));
  const [margins, setMargins] = useState(() => ({
    top: toCm(projection.page.margins.top),
    bottom: toCm(projection.page.margins.bottom),
    left: toCm(projection.page.margins.left),
    right: toCm(projection.page.margins.right),
  }));
  // Presencia original de cada banda: solo se envía el comando si cambia al Aplicar.
  const initialPresent = useRef({
    header: projection.page.header.present !== false,
    footer: projection.page.footer.present !== false,
  }).current;
  // Altos vigentes al montar (y tras cada «Aplicar»): solo se envía el comando
  // si el usuario cambió el valor; si no, una banda corta (0,6 cm) se quedaría
  // como está en lugar de crecer al mínimo del editor.
  const appliedHeights = useRef({
    header: toCm(projection.page.header.height),
    footer: toCm(projection.page.footer.height),
  }).current;
  const [headerPresent, setHeaderPresent] = useState(initialPresent.header);
  const [footerPresent, setFooterPresent] = useState(initialPresent.footer);
  // En RDL los flags de impresión valen `true` por defecto si no se declaran.
  // El mínimo (`DEFAULT_BAND_CM`) solo se propone al **insertar** una banda ausente.
  const [headerHeight, setHeaderHeight] = useState(() =>
    initialPresent.header
      ? appliedHeights.header
      : Math.max(appliedHeights.header, DEFAULT_BAND_CM),
  );
  const [headerFirst, setHeaderFirst] = useState(
    () => projection.page.header.printOnFirstPage ?? true,
  );
  const [headerLast, setHeaderLast] = useState(
    () => projection.page.header.printOnLastPage ?? true,
  );
  const [footerHeight, setFooterHeight] = useState(() =>
    initialPresent.footer
      ? appliedHeights.footer
      : Math.max(appliedHeights.footer, DEFAULT_BAND_CM),
  );
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
  /** Pestaña activa (controlada desde el panel para sobrevivir a remontes). */
  const [internalTab, setInternalTab] = useState('page');
  const activeTab = tab ?? internalTab;
  const changeTab = onTabChange ?? setInternalTab;
  /**
   * Ctrl+Intro pide un aplicar **diferido**: el `NumberInput` confirma su
   * borrador en el mismo keydown (setState aún sin propagar) y aplicar aquí en
   * el acto leería el valor viejo (BUG-34). El contador dispara el aplicar en
   * el efecto posterior al render, ya con el estado confirmado.
   */
  const [applyRequest, setApplyRequest] = useState(0);

  // Cambio externo del `<Code>` (undo, recarga): el búfer del editor se
  // sincroniza sin remontar el formulario, así «Aplicar» no resetea la pestaña
  // ni los borradores de página (BUG-37). Al aplicar el propio formulario el
  // valor no cambia, así que no pisa el búfer.
  useEffect(() => {
    setCode(projection.meta.code.text);
  }, [projection.meta.code.text]);

  const landscape = width > height;
  const selectedPaper = paperNameFor(width, height);
  // Identificadores únicos por instancia: el formulario se monta a la vez en
  // el diálogo «Informe…» y en el panel del inspector, y con ids/nombres
  // repetidos los radios compartían grupo (la selección «saltaba» de uno a
  // otro) y las etiquetas apuntaban al control equivocado.
  const uid = useId();
  const orientationName = `${uid}-orientation`;

  /** Cambia de orientación intercambiando ancho y alto. */
  const setOrientation = (nextLandscape: boolean): void => {
    if (nextLandscape === landscape) return;
    setWidth(height);
    setHeight(width);
  };

  /** Aplica un preset conservando la orientación actual. */
  const selectPaper = (name: string): void => {
    const preset = PAPER_PRESETS.find((candidate) => candidate.name === name);
    if (!preset) return; // «Custom»: no toca las medidas.
    setWidth(landscape ? preset.height : preset.width);
    setHeight(landscape ? preset.width : preset.height);
  };

  const applyPage = (): void => {
    onSetPageSize(cmLength(width), cmLength(height));
    onSetPageMargins({
      top: cmLength(margins.top),
      bottom: cmLength(margins.bottom),
      left: cmLength(margins.left),
      right: cmLength(margins.right),
    });
    // Insertar/quitar la banda solo si el usuario lo cambió (el valor aplicado
    // pasa a ser la referencia para el siguiente «Aplicar»).
    if (headerPresent !== initialPresent.header) {
      onSetRegionPresent('pageHeader', headerPresent);
      initialPresent.header = headerPresent;
    }
    if (footerPresent !== initialPresent.footer) {
      onSetRegionPresent('pageFooter', footerPresent);
      initialPresent.footer = footerPresent;
    }
    if (headerPresent) {
      if (headerHeight !== appliedHeights.header) {
        onSetRegionHeight('pageHeader', cmLength(headerHeight));
        appliedHeights.header = headerHeight;
      }
      onSetHeaderFooterOptions('pageHeader', {
        printOnFirstPage: headerFirst,
        printOnLastPage: headerLast,
      });
    }
    if (footerPresent) {
      if (footerHeight !== appliedHeights.footer) {
        onSetRegionHeight('pageFooter', cmLength(footerHeight));
        appliedHeights.footer = footerHeight;
      }
      onSetHeaderFooterOptions('pageFooter', {
        printOnFirstPage: footerFirst,
        printOnLastPage: footerLast,
      });
    }
    onSetSectionWidth(cmLength(bodyWidth));
    onSetRegionHeight('body', cmLength(bodyHeight));
  };

  // El aplicar diferido de Ctrl+Intro usa siempre el `applyPage` del último
  // render (con los setState del keydown ya confirmados).
  const applyPageRef = useRef(applyPage);
  useEffect(() => {
    applyPageRef.current = applyPage;
  });
  useEffect(() => {
    if (applyRequest > 0) applyPageRef.current();
  }, [applyRequest]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={changeTab}
      className={variant === 'panel' ? 'gap-3 p-3' : undefined}
    >
      <TabsList>
        <TabsTrigger value="page">Configurar página</TabsTrigger>
        <TabsTrigger value="code">Código</TabsTrigger>
      </TabsList>

      <TabsContent
        value="page"
        className="flex flex-col gap-4 pt-2"
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar la página (teclado completo en el diálogo).
          // Diferido: el campo enfocado confirma su borrador en este mismo
          // keydown; aplicar en el acto mandaría el valor viejo (BUG-34).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            setApplyRequest((request) => request + 1);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Papel</Label>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid w-44 gap-1">
              <Label htmlFor={`${uid}-paper-size`} className="text-[11px] text-muted-foreground">
                Tamaño
              </Label>
              <select
                id={`${uid}-paper-size`}
                className="h-8 rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
                aria-label="Tamaño de papel"
                value={selectedPaper}
                onChange={(event) => selectPaper(event.target.value)}
              >
                {PAPER_PRESETS.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">Orientación</span>
              <div
                role="radiogroup"
                aria-label="Orientación del papel"
                className="flex h-8 items-center gap-3"
              >
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name={orientationName}
                    className="accent-primary"
                    checked={!landscape}
                    onChange={() => setOrientation(false)}
                    aria-label="Vertical"
                  />
                  <RectangleVertical className="size-4 text-muted-foreground" />
                  Vertical
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name={orientationName}
                    className="accent-primary"
                    checked={landscape}
                    onChange={() => setOrientation(true)}
                    aria-label="Horizontal"
                  />
                  <RectangleHorizontal className="size-4 text-muted-foreground" />
                  Horizontal
                </label>
              </div>
            </div>
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
          {/* En el inspector (320 px) las tarjetas van en vertical: en dos
              columnas la etiqueta larga saltaba de línea y descuadraba el campo. */}
          <div
            className={variant === 'panel' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}
          >
            <RegionFields
              idPrefix={`${uid}-header`}
              title="Encabezado"
              present={headerPresent}
              onTogglePresent={() => setHeaderPresent((value) => !value)}
              height={headerHeight}
              onHeight={setHeaderHeight}
              first={headerFirst}
              onFirst={setHeaderFirst}
              last={headerLast}
              onLast={setHeaderLast}
            />
            <RegionFields
              idPrefix={`${uid}-footer`}
              title="Pie"
              present={footerPresent}
              onTogglePresent={() => setFooterPresent((value) => !value)}
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

        <FormFooter variant={variant}>
          <Button onClick={applyPage}>Aplicar</Button>
        </FormFooter>
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
        <FormFooter variant={variant}>
          <Button
            title="Aplicar (Ctrl+Intro)"
            onClick={() => {
              onSetReportCode(code);
            }}
          >
            Aplicar
          </Button>
        </FormFooter>
      </TabsContent>
    </Tabs>
  );
}

/** Pie del formulario: en el diálogo, el pie estándar; en el panel, fijo abajo. */
function FormFooter({
  variant,
  children,
}: {
  variant: 'dialog' | 'panel';
  children: ReactNode;
}): ReactNode {
  if (variant === 'dialog') return <DialogFooter>{children}</DialogFooter>;
  // `sticky bottom-0`: «Aplicar» sigue a la vista al recorrer el inspector.
  // Fondo opaco: el contenido que queda debajo del pie no se transparenta.
  return (
    <div className="sticky bottom-0 -mx-3 -mb-3 flex flex-col-reverse gap-2 border-t bg-background p-3 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}

/** Alto, impresión e inserción/borrado de una banda de página (encabezado o pie). */
function RegionFields({
  idPrefix,
  title,
  present,
  onTogglePresent,
  height,
  onHeight,
  first,
  onFirst,
  last,
  onLast,
}: {
  idPrefix: string;
  title: string;
  present: boolean;
  onTogglePresent: () => void;
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        <Button
          variant={present ? 'ghost' : 'outline'}
          size="xs"
          aria-label={present ? `Quitar el ${name}` : `Insertar el ${name}`}
          title={
            present
              ? `Quitar el ${name} del informe (se puede deshacer)`
              : `Insertar un ${name} nuevo`
          }
          onClick={onTogglePresent}
        >
          {present ? (
            <>
              <Trash2 /> Quitar
            </>
          ) : (
            <>
              <Plus /> Insertar
            </>
          )}
        </Button>
      </div>
      {present ? (
        <>
          <NumberField
            label={`Alto del ${name} (cm)`}
            value={height}
            onChange={onHeight}
            axis="y"
          />
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
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sin {name}. Pulsa «Insertar» y luego «Aplicar» para añadirlo.
        </p>
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

function cmLength(value: number): Length {
  return { value: Math.round(value * 10000) / 10000, unit: 'cm' };
}
