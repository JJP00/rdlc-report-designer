import type { ReactNode } from 'react';
import {
  ReportPropertiesForm,
  reportPropertiesSignature,
  type ReportPropertiesFormProps,
} from './ReportPropertiesForm';

export type ReportPropertiesPanelProps = Omit<ReportPropertiesFormProps, 'variant'>;

/**
 * Propiedades del informe en la columna derecha, cuando no hay nada
 * seleccionado: mismas acciones que el diálogo «Informe…», sin salir del
 * inspector. La `key` de la huella remonta el borrador si el documento cambia
 * por fuera (undo, arrastre de la página en el lienzo).
 */
export function ReportPropertiesPanel({
  projection,
  ...form
}: ReportPropertiesPanelProps): ReactNode {
  return (
    <section aria-label="Propiedades del informe" className="flex flex-col">
      <header className="flex flex-col gap-1 border-b p-3">
        <h2 className="text-sm font-semibold">Propiedades del informe</h2>
        <p className="text-xs text-muted-foreground">
          Configuración de página y código VB del informe ({projection.reportName}).
        </p>
      </header>
      <ReportPropertiesForm
        key={reportPropertiesSignature(projection)}
        projection={projection}
        {...form}
        variant="panel"
      />
    </section>
  );
}
