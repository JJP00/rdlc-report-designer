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

export interface ConflictDialogProps {
  /** Ruta del fichero que cambió por fuera; `null` = sin conflicto. */
  path: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Descarta los cambios locales y adopta lo que hay en disco. */
  onReload: () => void;
  /** Guarda los cambios locales encima de lo que hay en disco. */
  onOverwrite: () => void;
  /** Guarda los cambios locales en otro fichero. */
  onSaveAs: () => void;
}

/**
 * Conflicto de fichero: el fichero cambió en disco mientras había cambios
 * locales. El backend nunca pisa el trabajo en silencio; aquí el usuario elige
 * una de las tres salidas (recargar / sobrescribir / guardar como) o lo deja
 * para después (el aviso sigue en la banda superior).
 */
export function ConflictDialog({
  path,
  open,
  onOpenChange,
  onReload,
  onOverwrite,
  onSaveAs,
}: ConflictDialogProps): ReactNode {
  if (!path) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="conflict-dialog">
        <DialogHeader>
          <DialogTitle>El fichero cambió en disco</DialogTitle>
          <DialogDescription>
            <span className="font-mono break-all">{path}</span> se modificó por fuera (otra app o
            una sincronización) y tienes cambios sin guardar. Nada se ha perdido todavía: elige qué
            versión conservar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-col sm:items-stretch">
          <Button onClick={onOverwrite}>Guardar y sobrescribir el fichero</Button>
          <Button variant="outline" onClick={onSaveAs}>
            Guardar como…
          </Button>
          <Button variant="outline" onClick={onReload}>
            Recargar desde disco (descartar mis cambios)
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Ahora no
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
