import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReportPropertiesForm, type ReportPropertiesFormProps } from './ReportPropertiesForm';

export interface ReportPropertiesDialogProps extends Omit<ReportPropertiesFormProps, 'variant'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Propiedades del informe en diálogo (botón «Informe…»): Configurar página
 * (tamaño, orientación, márgenes, encabezado/pie) y Código VB. El formulario se
 * monta al abrir: los borradores parten del documento y no se pierden cuando
 * llega una proyección nueva mientras se edita.
 */
export function ReportPropertiesDialog({
  open,
  onOpenChange,
  ...form
}: ReportPropertiesDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" resizable>
        <DialogHeader>
          <DialogTitle>Propiedades del informe</DialogTitle>
          <DialogDescription>
            Configuración de página y código VB del informe ({form.projection.reportName}).
          </DialogDescription>
        </DialogHeader>

        <ReportPropertiesForm {...form} />
      </DialogContent>
    </Dialog>
  );
}
