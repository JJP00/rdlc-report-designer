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
  onResolve: (resolution: PendingResolution) => void;
}

/**
 * Guarda del cierre de ventana con **varias** pestañas sucias (bloque C):
 * «Guardar todas» las guarda en orden y, al primer fallo, cancela el cierre y
 * deja activa la pestaña que falló con su error visible; «Descartar todas» sale
 * sin guardar; «Cancelar» aborta el cierre. La lista de ficheros permite ver de
 * un vistazo qué trabajo está en juego.
 */
export function SaveAllDialog({ tabs, onResolve }: SaveAllDialogProps): ReactNode {
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
          <DialogTitle>Cambios sin guardar</DialogTitle>
          <DialogDescription>
            Vas a salir de la aplicación y hay {tabs.length} informes con cambios sin guardar. Si
            alguno no se puede guardar, el cierre se cancela y su error queda a la vista.
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
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => onResolve('discard')}>
            Descartar todas
          </Button>
          <Button onClick={() => onResolve('save')}>Guardar todas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
