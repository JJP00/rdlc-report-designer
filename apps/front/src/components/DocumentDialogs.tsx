import type {
  Length,
  ParagraphDto,
  ProjectionDto,
  RdlcCommand,
  TablixMemberDto,
  TextboxDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { GroupPropertiesDialog } from '@/components/panels/GroupPropertiesDialog';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { TextEditorDialog } from '@/components/panels/TextEditorDialog';
import { flattenItems } from '@/lib/projection';

/** Grupo cuyas «Propiedades» están abiertas (estado de UI, no del documento). */
export interface GroupPropertiesRequest {
  tablixId: string;
  axis: 'row' | 'column';
  member: TablixMemberDto;
}

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
  /** «Propiedades del grupo» abiertas; `null` = cerrado. */
  groupProperties: GroupPropertiesRequest | null;
  onCloseGroupProperties: () => void;
  onApplyGroupProperties: (commands: RdlcCommand[]) => void;
}

/** Diálogos del documento: propiedades del informe, propiedades del grupo y texto. */
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
  groupProperties,
  onCloseGroupProperties,
  onApplyGroupProperties,
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

      {projection && groupProperties ? (
        <GroupPropertiesDialog
          tablixId={groupProperties.tablixId}
          axis={groupProperties.axis}
          member={groupProperties.member}
          meta={projection.meta}
          itemNames={flattenItems(projection).map((item) => item.id)}
          onApply={onApplyGroupProperties}
          onClose={onCloseGroupProperties}
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
