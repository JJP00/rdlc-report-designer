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
  const t = useT();
  if (!path) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="conflict-dialog">
        <DialogHeader>
          <DialogTitle>{t('dialogs.conflict.title')}</DialogTitle>
          <DialogDescription>
            <span className="font-mono break-all">{path}</span> {t('dialogs.conflict.description')}
          </DialogDescription>
        </DialogHeader>
        {/* Orden de lectura/teclado y foco inicial seguros: «Guardar como…» es
            la acción primaria (no destructiva) y la primera; sobrescribir queda
            como secundaria. `flex-col` también en móvil para que el orden visual
            coincida con el del DOM. */}
        <DialogFooter className="flex-col items-stretch sm:flex-col">
          <Button autoFocus onClick={onSaveAs}>
            {t('dialogs.conflict.saveAs')}
          </Button>
          <Button variant="outline" onClick={onOverwrite}>
            {t('dialogs.conflict.overwrite')}
          </Button>
          <Button variant="outline" onClick={onReload}>
            {t('dialogs.conflict.reload')}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('dialogs.conflict.later')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
