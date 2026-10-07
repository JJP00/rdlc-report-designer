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
import type { PendingIntent } from '@/hooks/useDocumentCore';

export interface UnsavedChangesDialogProps {
  /** Intención que perdería cambios; `null` = diálogo cerrado. */
  intent: PendingIntent | null;
  onResolve: (resolution: 'save' | 'discard' | 'cancel') => void;
}

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
 * la acción que el usuario pidió («Guardar y abrir»).
 */
function copyForIntent(intent: PendingIntent): IntentCopy {
  switch (intent.kind) {
    case 'open':
    case 'openPath':
      return {
        description: 'El informe abierto tiene cambios sin guardar y vas a abrir otro.',
        discard: 'Abrir sin guardar',
        save: 'Guardar y abrir',
      };
    case 'new':
      return {
        description: 'El informe abierto tiene cambios sin guardar y vas a crear uno nuevo.',
        discard: 'Crear sin guardar',
        save: 'Guardar y crear',
      };
    case 'close':
      return {
        description: 'Vas a cerrar el informe y hay cambios sin guardar.',
        discard: 'Cerrar sin guardar',
        save: 'Guardar y cerrar',
      };
    case 'windowClose':
      return {
        description: 'Vas a salir de la aplicación y hay cambios sin guardar.',
        discard: 'Salir sin guardar',
        save: 'Guardar y salir',
      };
  }
}

/**
 * Guarda de trabajo sin guardar (abrir/crear/cerrar/salir): sustituye al
 * `window.confirm` nativo para hablar el mismo lenguaje que el resto de
 * diálogos y ofrecer la salida segura (guardar) además de descartar.
 */
export function UnsavedChangesDialog({ intent, onResolve }: UnsavedChangesDialogProps): ReactNode {
  if (!intent) return null;
  const copy = copyForIntent(intent);
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
          <DialogTitle>Cambios sin guardar</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve('cancel')}>
            Cancelar
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
