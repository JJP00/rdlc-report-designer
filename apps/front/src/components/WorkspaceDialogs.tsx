import type { TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { DocumentDialogs, type GroupPropertiesRequest } from '@/components/DocumentDialogs';
import type { DocumentCore } from '@/hooks/useDocumentCore';
import type { ItemEditing } from '@/hooks/useItemEditing';

export interface WorkspaceDialogsProps {
  core: DocumentCore;
  items: ItemEditing;
  /** Propiedades del informe abiertas. */
  propertiesOpen: boolean;
  onPropertiesOpenChange: (open: boolean) => void;
  /** Textbox en edición (editor de texto); `undefined` = cerrado. */
  editingText: TextboxDto | undefined;
  onEditingTextOpenChange: (open: boolean) => void;
  /** Grupo cuyas «Propiedades» están abiertas. */
  groupProperties: GroupPropertiesRequest | null;
  onCloseGroupProperties: () => void;
  /** Tablix cuyos filtros están abiertos. */
  filtersTablix: TablixDto | null;
  onCloseTablixFilters: () => void;
  /** Diálogo de conflicto visible (lo abre también el aviso superior). */
  conflictOpen: boolean;
  onConflictOpenChange: (open: boolean) => void;
}

/**
 * Todos los diálogos de trabajo del shell (informe, grupo, filtros, texto,
 * cambios sin guardar y conflicto) cableados con el núcleo y la edición. Vive
 * fuera de `App` para que el shell no engorde con el cableado de cada diálogo.
 */
export function WorkspaceDialogs({
  core,
  items,
  propertiesOpen,
  onPropertiesOpenChange,
  editingText,
  onEditingTextOpenChange,
  groupProperties,
  onCloseGroupProperties,
  filtersTablix,
  onCloseTablixFilters,
  conflictOpen,
  onConflictOpenChange,
}: WorkspaceDialogsProps): ReactNode {
  const resolveConflict = (action: 'reload' | 'overwrite' | 'saveAs'): void => {
    if (action === 'reload') {
      void core.reloadFromDisk();
      return;
    }
    const saving = action === 'overwrite' ? core.save() : core.saveAs();
    void saving.then((saved) => {
      if (saved) onConflictOpenChange(false);
    });
  };

  return (
    <DocumentDialogs
      projection={core.doc?.projection ?? null}
      propertiesOpen={propertiesOpen}
      onPropertiesOpenChange={onPropertiesOpenChange}
      onSetPageSize={items.setPageSize}
      onSetPageMargins={items.setPageMargins}
      onSetRegionHeight={items.setRegionHeight}
      onSetSectionWidth={items.setSectionWidth}
      onSetHeaderFooterOptions={items.setHeaderFooterOptions}
      onSetRegionPresent={items.setRegionPresent}
      onSetReportCode={items.setReportCode}
      editingText={editingText}
      onEditingTextOpenChange={onEditingTextOpenChange}
      onApplyParagraphs={items.setParagraphs}
      groupProperties={groupProperties}
      onCloseGroupProperties={onCloseGroupProperties}
      onApplyGroupProperties={items.applyGroupProperties}
      filtersTablix={filtersTablix}
      onCloseTablixFilters={onCloseTablixFilters}
      onApplyTablixFilters={(filters) => {
        if (filtersTablix) items.setTablixFilters(filtersTablix.id, filters);
      }}
      pendingIntent={core.pendingIntent}
      onResolvePending={core.resolvePending}
      conflict={core.conflict}
      conflictOpen={conflictOpen}
      onConflictOpenChange={onConflictOpenChange}
      onReloadFromDisk={() => resolveConflict('reload')}
      onOverwriteConflict={() => resolveConflict('overwrite')}
      onSaveAsConflict={() => resolveConflict('saveAs')}
    />
  );
}
