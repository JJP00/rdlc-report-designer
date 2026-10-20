import type { Translator } from '@rdlc-designer/i18n';
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
import type { PendingIntent } from '@/lib/windowClose';
import { fileBasename } from '@/lib/windowTitle';

export interface UnsavedChangesDialogProps {
  /** Intención que perdería cambios; `null` = diálogo cerrado. */
  intent: SingleTabIntent | null;
  onResolve: (resolution: 'save' | 'discard' | 'cancel') => void;
}

/** Guardas de una sola pestaña; el cierre con varias usa `SaveAllDialog`. */
export type SingleTabIntent = Extract<PendingIntent, { kind: 'close' | 'windowClose' }>;

interface IntentCopy {
  /** Qué va a pasar (segunda frase, tras «tiene cambios sin guardar»). */
  description: string;
  /** Acción destructiva con el contexto exacto. */
  discard: string;
  /** Acción segura: guardar y seguir. */
  save: string;
}

/**
 * Copia por intención: cada salida nombra exactamente qué se pierde y qué
 * ocurre después. El botón de guardar nunca se llama solo «Guardar»: encadena
 * la acción que el usuario pidió («Guardar y cerrar»). Con pestañas, la guarda
 * solo existe al **cerrar** una pestaña o la ventana: abrir/nuevo ya no pierde
 * nada (el documento anterior se queda en su pestaña).
 */
function copyForIntent(intent: SingleTabIntent, t: Translator['t']): IntentCopy {
  switch (intent.kind) {
    case 'close':
      return {
        description: t('dialogs.unsavedChanges.close', { name: fileBasename(intent.path) }),
        discard: t('common.closeWithoutSaving'),
        save: t('dialogs.unsavedChanges.saveAndClose'),
      };
    case 'windowClose':
      return {
        description: t('dialogs.unsavedChanges.windowClose', { name: fileBasename(intent.path) }),
        discard: t('common.leaveWithoutSaving'),
        save: t('dialogs.unsavedChanges.saveAndLeave'),
      };
  }
}

/**
 * Guarda de trabajo sin guardar (abrir/crear/cerrar/salir): sustituye al
 * `window.confirm` nativo para hablar el mismo lenguaje que el resto de
 * diálogos y ofrecer la salida segura (guardar) además de descartar.
 */
export function UnsavedChangesDialog({ intent, onResolve }: UnsavedChangesDialogProps): ReactNode {
  const t = useT();
  if (!intent) return null;
  const copy = copyForIntent(intent, t);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Esc / clic fuera = cancelar (no se pierde nada).
        if (!open) onResolve('cancel');
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid="unsaved-changes-dialog"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t('dialogs.unsavedChanges.title')}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve('cancel')}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={() => onResolve('discard')}>
            {copy.discard}
          </Button>
          <Button onClick={() => onResolve('save')}>{copy.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
