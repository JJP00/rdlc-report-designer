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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toCm } from '@/lib/projection';

interface ReportPropertiesDialogProps {
  projection: ProjectionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetPageSize: (width: Length, height: Length) => void;
  onSetPageMargins: (margins: {
    top: Length;
    bottom: Length;
    left: Length;
    right: Length;
  }) => void;
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
  onSetReportCode,
}: ReportPropertiesDialogProps): ReactNode {
  const [width, setWidth] = useState(toCm(projection.page.width));
  const [height, setHeight] = useState(toCm(projection.page.height));
  const [margins, setMargins] = useState({
    top: toCm(projection.page.margins.top),
    bottom: toCm(projection.page.margins.bottom),
    left: toCm(projection.page.margins.left),
    right: toCm(projection.page.margins.right),
  });
  const [code, setCode] = useState(projection.meta.code.text);

  // Sincroniza con el documento al abrir (o cuando cambia por fuera).
  useEffect(() => {
    if (!open) return;
    setWidth(toCm(projection.page.width));
    setHeight(toCm(projection.page.height));
    setMargins({
      top: toCm(projection.page.margins.top),
      bottom: toCm(projection.page.margins.bottom),
      left: toCm(projection.page.margins.left),
      right: toCm(projection.page.margins.right),
    });
    setCode(projection.meta.code.text);
  }, [open, projection]);

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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propiedades del informe</DialogTitle>
          <DialogDescription>
            Configuración de página y código VB del informe ({projection.reportName}).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="page">
          <TabsList>
            <TabsTrigger value="page">Configurar página</TabsTrigger>
            <TabsTrigger value="code">Código</TabsTrigger>
          </TabsList>

          <TabsContent value="page" className="flex flex-col gap-4 pt-2">
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
              <NumberField label="Ancho (cm)" value={width} onChange={setWidth} />
              <NumberField label="Alto (cm)" value={height} onChange={setHeight} />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">Márgenes (cm)</Label>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Superior"
                  value={margins.top}
                  onChange={(value) => setMargins((m) => ({ ...m, top: value }))}
                />
                <NumberField
                  label="Inferior"
                  value={margins.bottom}
                  onChange={(value) => setMargins((m) => ({ ...m, bottom: value }))}
                />
                <NumberField
                  label="Izquierdo"
                  value={margins.left}
                  onChange={(value) => setMargins((m) => ({ ...m, left: value }))}
                />
                <NumberField
                  label="Derecho"
                  value={margins.right}
                  onChange={(value) => setMargins((m) => ({ ...m, right: value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={applyPage}>Aplicar</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="code" className="flex flex-col gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Bloque <code>&lt;Code&gt;</code> VB (funciones <code>Code.</code>). Se reemplaza como
              un todo: un paso de undo.
            </p>
            <Textarea
              className="min-h-[320px] font-mono text-xs"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
            />
            <DialogFooter>
              <Button
                onClick={() => {
                  onSetReportCode(code);
                }}
              >
                Aplicar
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): ReactNode {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs tabular-nums"
        type="number"
        step="0.1"
        value={value}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

function cmLength(value: number): Length {
  return { value: Math.round(value * 10000) / 10000, unit: 'cm' };
}
