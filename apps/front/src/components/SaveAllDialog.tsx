import { useT } from '@rdlc-designer/i18n/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ClosingTab, PendingResolution } from '@/lib/windowClose';
import { fileBasename } from '@/lib/windowTitle';

export interface SaveAllDialogProps {
  /** Pestañas sucias pendientes de resolver; `null` = diálogo cerrado. */
  tabs: readonly ClosingTab[] | null;
  /** `window`: salir de la aplicación; `tabs`: cerrar varias pestañas (menú contextual). */
  scope?: 'window' | 'tabs';
  onResolve: (resolution: PendingResolution) => void;
}

/**
 * Guarda del cierre de ventana con **varias** pestañas sucias (bloque C):
 * «Guardar todas» las guarda en orden y, al primer fallo, cancela el cierre y
 * deja activa la pestaña que falló con su error visible; «Descartar todas» sale
 * sin guardar; «Cancelar» aborta el cierre. La lista de ficheros permite ver de
 * un vistazo qué trabajo está en juego.
 */
export function SaveAllDialog({
  tabs,
  scope = 'window',
  onResolve,
}: SaveAllDialogProps): ReactNode {
  const t = useT();
  if (!tabs || tabs.length === 0) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Esc / clic fuera = cancelar (no se pierde nada).
        if (!open) onResolve('cancel');
      }}
    >
      <DialogContent showCloseButton={false} data-testid="save-all-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogs.unsavedChanges.title')}</DialogTitle>
          <DialogDescription>
            {t(scope === 'tabs' ? 'dialogs.saveAll.tabs' : 'dialogs.saveAll.window', {
              count: tabs.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 list-disc overflow-y-auto pl-5 font-mono text-xs text-muted-foreground">
          {tabs.map((tab) => (
            <li key={tab.sessionId} className="truncate" title={tab.path}>
              {fileBasename(tab.path)}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve('cancel')}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={() => onResolve('discard')}>
            {t('dialogs.saveAll.discardAll')}
          </Button>
          <Button onClick={() => onResolve('save')}>{t('dialogs.saveAll.saveAll')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
