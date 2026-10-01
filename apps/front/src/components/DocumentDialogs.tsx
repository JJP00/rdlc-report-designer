import type {
  Length,
  ParagraphDto,
  ProjectionDto,
  RdlcCommand,
  TablixDto,
  TablixFilterDto,
  TablixMemberDto,
  TextboxDto,
} from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { ConflictDialog } from '@/components/ConflictDialog';
import { GroupPropertiesDialog } from '@/components/panels/GroupPropertiesDialog';
import { ReportPropertiesDialog } from '@/components/panels/ReportPropertiesDialog';
import { TablixFiltersDialog } from '@/components/panels/TablixFiltersDialog';
import { TextEditorDialog } from '@/components/panels/TextEditorDialog';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import type { PendingIntent, PendingResolution } from '@/hooks/useDocumentCore';
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
  onSetRegionHeight: (region: 'pageHeader' | 'pageFooter' | 'body', height: Length) => void;
  onSetHeaderFooterOptions: (
    region: 'pageHeader' | 'pageFooter',
    options: { printOnFirstPage?: boolean; printOnLastPage?: boolean },
  ) => void;
  onSetReportCode: (code: string) => void;
  /** Textbox en edición (editor de texto); `undefined` = cerrado. */
  editingText: TextboxDto | undefined;
  onEditingTextOpenChange: (open: boolean) => void;
  onApplyParagraphs: (id: string, paragraphs: ParagraphDto[]) => void;
  /** «Propiedades del grupo» abiertas; `null` = cerrado. */
  groupProperties: GroupPropertiesRequest | null;
  onCloseGroupProperties: () => void;
  onApplyGroupProperties: (commands: RdlcCommand[]) => void;
  /** Tablix cuyos «Filtros…» están abiertos; `null` = cerrado. */
  filtersTablix: TablixDto | null;
  onCloseTablixFilters: () => void;
  onApplyTablixFilters: (filters: TablixFilterDto[]) => void;
  /** Guarda de cambios sin guardar (abrir/crear/cerrar/salir). */
  pendingIntent: PendingIntent | null;
  onResolvePending: (resolution: PendingResolution) => void;
  /** Conflicto de fichero (recargar / sobrescribir / guardar como). */
  conflict: string | null;
  conflictOpen: boolean;
  onConflictOpenChange: (open: boolean) => void;
  onReloadFromDisk: () => void;
  onOverwriteConflict: () => void;
  onSaveAsConflict: () => void;
}

/** Diálogos del documento: propiedades del informe, propiedades del grupo y texto. */
export function DocumentDialogs({
  projection,
  propertiesOpen,
  onPropertiesOpenChange,
  onSetPageSize,
  onSetPageMargins,
  onSetRegionHeight,
  onSetHeaderFooterOptions,
  onSetReportCode,
  editingText,
  onEditingTextOpenChange,
  onApplyParagraphs,
  groupProperties,
  onCloseGroupProperties,
  onApplyGroupProperties,
  filtersTablix,
  onCloseTablixFilters,
  onApplyTablixFilters,
  pendingIntent,
  onResolvePending,
  conflict,
  conflictOpen,
  onConflictOpenChange,
  onReloadFromDisk,
  onOverwriteConflict,
  onSaveAsConflict,
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
          onSetRegionHeight={onSetRegionHeight}
          onSetHeaderFooterOptions={onSetHeaderFooterOptions}
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

      {filtersTablix ? (
        <TablixFiltersDialog
          filters={filtersTablix.filters ?? []}
          onApply={onApplyTablixFilters}
          onClose={onCloseTablixFilters}
        />
      ) : null}

      <TextEditorDialog
        item={editingText}
        onOpenChange={onEditingTextOpenChange}
        onApply={onApplyParagraphs}
      />

      <UnsavedChangesDialog intent={pendingIntent} onResolve={onResolvePending} />
      <ConflictDialog
        path={conflict}
        open={conflictOpen}
        onOpenChange={onConflictOpenChange}
        onReload={onReloadFromDisk}
        onOverwrite={onOverwriteConflict}
        onSaveAs={onSaveAsConflict}
      />
    </>
  );
}
