import type { ReactNode } from 'react';
import { useState } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import { ReportPropertiesForm, type ReportPropertiesFormProps } from './ReportPropertiesForm';
import { reportPropertiesSignature } from './reportPropertiesSignature';

export type ReportPropertiesPanelProps = Omit<ReportPropertiesFormProps, 'variant'>;

/**
 * Propiedades del informe en la columna derecha, cuando no hay nada
 * seleccionado: mismas acciones que el diálogo «Informe…», sin salir del
 * inspector. La `key` de la huella remonta el borrador si el documento cambia
 * por fuera (undo, arrastre de la página en el lienzo); la pestaña activa vive
 * aquí para no perderse en esos remontes (BUG-37).
 */
export function ReportPropertiesPanel({
  projection,
  ...form
}: ReportPropertiesPanelProps): ReactNode {
  const t = useT();
  const [tab, setTab] = useState('page');
  return (
    <section aria-label={t('report.properties.title')} className="flex flex-col">
      <header className="flex flex-col gap-1 border-b p-3">
        <h2 className="text-sm font-semibold">{t('report.properties.title')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('report.properties.subtitle', { name: projection.reportName })}
        </p>
      </header>
      <ReportPropertiesForm
        key={reportPropertiesSignature(projection)}
        projection={projection}
        {...form}
        tab={tab}
        onTabChange={setTab}
        variant="panel"
      />
    </section>
  );
}
