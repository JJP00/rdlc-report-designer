import type { Length, ParagraphDto, ProjectionDto, TextboxDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { TextEditorDialog } from '@/components/panels/TextEditorDialog';

export interface DocumentDialogsProps {
  projection: ProjectionDto | null;
  propertiesOpen: boolean;
  onPropertiesOpenChange: (open: boolean) => void;
  onSetPageSize: (width: Length, height: Length) => void;
  onSetPageMargins: (margins: { top: Length; bottom: Length; left: Length; right: Length }) => void;
  onSetReportCode: (code: string) => void;
  /** Textbox en edición (editor de texto); `undefined` = cerrado. */
  editingText: TextboxDto | undefined;
  onEditingTextOpenChange: (open: boolean) => void;
  onApplyParagraphs: (id: string, paragraphs: ParagraphDto[]) => void;
}

/** Diálogos del documento: propiedades del informe y editor de texto. */
export function DocumentDialogs({
  projection,
  propertiesOpen,
  onPropertiesOpenChange,
  onSetPageSize,
  onSetPageMargins,
  onSetReportCode,
  editingText,
  onEditingTextOpenChange,
  onApplyParagraphs,
}: DocumentDialogsProps): ReactNode {
  return (
    <>
      {projection ? (
        <ReportPropertiesDialog
          projection={projection}
          open={propertiesOpen}
          onOpenChange={onPropertiesOpenChange}
          onSetPageSize={onSetPageSize}
          onSetPageMargins={onSetPageMargins}
          onSetReportCode={onSetReportCode}
        />
      ) : null}

      <TextEditorDialog
        item={editingText}
        onOpenChange={onEditingTextOpenChange}
        onApply={onApplyParagraphs}
      />
    </>
  );
}
