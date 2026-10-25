import type { Length, ProjectionDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpressionEditor } from './ExpressionEditor';
import { usePageDraft } from './pageDraft';
import {
  BandFields,
  BodyFields,
  MarginFields,
  PageSizeFields,
  PaperFields,
} from './ReportPageFields';

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
  const t = useT();
  const page = usePageDraft(projection, {
    onSetPageSize,
    onSetPageMargins,
    onSetRegionHeight,
    onSetSectionWidth,
    onSetHeaderFooterOptions,
    onSetRegionPresent,
  });
  const [code, setCode] = useState(() => projection.meta.code.text);
  /** Pestaña activa (controlada desde el panel para sobrevivir a remontes). */
  const [internalTab, setInternalTab] = useState('page');
  const activeTab = tab ?? internalTab;
  const changeTab = onTabChange ?? setInternalTab;

  // Cambio externo del `<Code>` (undo, recarga): el búfer del editor se
  // sincroniza sin remontar el formulario, así «Aplicar» no resetea la pestaña
  // ni los borradores de página (BUG-37). Al aplicar el propio formulario el
  // valor no cambia, así que no pisa el búfer.
  useEffect(() => {
    setCode(projection.meta.code.text);
  }, [projection.meta.code.text]);

  // Identificadores únicos por instancia: el formulario se monta a la vez en
  // el diálogo «Informe…» y en el panel del inspector, y con ids/nombres
  // repetidos los radios compartían grupo (la selección «saltaba» de uno a
  // otro) y las etiquetas apuntaban al control equivocado.
  const uid = useId();

  /** Botón «Aplicar» de la pestaña activa: el pie del diálogo es común. */
  const applyButton =
    activeTab === 'code' ? (
      <Button
        title={t('report.applyShortcut')}
        onClick={() => {
          onSetReportCode(code);
        }}
      >
        {t('report.apply')}
      </Button>
    ) : (
      <Button onClick={page.applyPage}>{t('report.apply')}</Button>
    );

  const pageTab = (
    <TabsContent
      value="page"
      className="flex flex-col gap-4 pt-2"
      onKeyDown={(event) => {
        // Ctrl+Intro = Aplicar la página (teclado completo en el diálogo).
        // Diferido: el campo enfocado confirma su borrador en este mismo
        // keydown; aplicar en el acto mandaría el valor viejo (BUG-34).
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          page.requestApply();
        }
      }}
    >
      <PaperFields
        uid={uid}
        selectedPaper={page.selectedPaper}
        landscape={page.landscape}
        onSelectPaper={page.selectPaper}
        onSetOrientation={page.setOrientation}
      />
      <PageSizeFields
        width={page.width}
        height={page.height}
        onWidth={page.setWidth}
        onHeight={page.setHeight}
      />
      <MarginFields margins={page.margins} onChange={page.setMargin} />
      <BandFields
        uid={uid}
        variant={variant}
        header={page.header}
        footer={page.footer}
        onHeader={page.patchHeader}
        onFooter={page.patchFooter}
      />
      <BodyFields
        width={page.bodyWidth}
        height={page.bodyHeight}
        onWidth={page.setBodyWidth}
        onHeight={page.setBodyHeight}
      />

      {variant === 'panel' ? (
        <PanelFooter>
          <Button onClick={page.applyPage}>{t('report.apply')}</Button>
        </PanelFooter>
      ) : null}
    </TabsContent>
  );

  const codeTab = (
    <TabsContent value="code" className="flex flex-col gap-2 pt-2">
      <p className="text-xs text-muted-foreground">{t('report.code.note')}</p>
      <ExpressionEditor
        value={code}
        mode="code"
        ariaLabel={t('report.code.aria')}
        onCommit={setCode}
        onSubmit={(value) => {
          // Ctrl+Intro: commit + aplicar el código recién leído del editor.
          setCode(value);
          onSetReportCode(value);
        }}
      />
      {variant === 'panel' ? (
        <PanelFooter>
          <Button
            title={t('report.applyShortcut')}
            onClick={() => {
              onSetReportCode(code);
            }}
          >
            {t('report.apply')}
          </Button>
        </PanelFooter>
      ) : null}
    </TabsContent>
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={changeTab}
      className={variant === 'panel' ? 'gap-3 p-3' : 'min-h-0 flex-1 flex-col gap-3'}
    >
      <TabsList>
        <TabsTrigger value="page">{t('report.tab.page')}</TabsTrigger>
        <TabsTrigger value="code">{t('report.tab.code')}</TabsTrigger>
      </TabsList>

      {variant === 'dialog' ? (
        <DialogBody className="pr-1">
          {pageTab}
          {codeTab}
        </DialogBody>
      ) : (
        <>
          {pageTab}
          {codeTab}
        </>
      )}

      {variant === 'dialog' ? (
        <DialogFooter className="shrink-0">{applyButton}</DialogFooter>
      ) : null}
    </Tabs>
  );
}

/** Pie del panel del inspector: fijo abajo al recorrerlo. */
function PanelFooter({ children }: { children: ReactNode }): ReactNode {
  // `sticky bottom-0`: «Aplicar» sigue a la vista al recorrer el inspector.
  // Fondo opaco: el contenido que queda debajo del pie no se transparenta.
  return (
    <div className="sticky bottom-0 -mx-3 -mb-3 flex flex-col-reverse gap-2 border-t bg-background p-3 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
