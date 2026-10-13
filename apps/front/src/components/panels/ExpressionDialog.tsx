import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResizableDialogContent,
} from '@/components/ui/dialog';
import { ExpressionEditor } from './ExpressionEditor';

export interface ExpressionDialogProps {
  /** Título del diálogo (p. ej. «Expresión de visibilidad»). */
  title: string;
  /** Expresión actual (vacía si aún no hay). */
  value: string;
  onClose: () => void;
  /** Se llama al confirmar (con el valor del editor). */
  onApply: (value: string) => void;
}

/**
 * Diálogo para editar una expresión RDL con Monaco **con números de línea y
 * todo** (plegado, scroll, autocompletado): lo que en el panel va inline aquí se
 * edita cómodo. Se monta al abrir, así el borrador nace del valor actual. Marco
 * redimensionable estándar (BUG-63): cabecera y pie fijos, scroll en el cuerpo
 * para que Monaco tenga sitio.
 */
export function ExpressionDialog({
  title,
  value,
  onClose,
  onApply,
}: ExpressionDialogProps): ReactNode {
  // El commit del editor (blur o Ctrl+Intro) puede llegar en el mismo gesto que
  // el click en «Aplicar»: el ref garantiza el valor más reciente.
  const draftRef = useRef(value);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResizableDialogContent className="max-h-[90vh] max-w-2xl sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Expresión RDL con resaltado y autocompletado. Ctrl+Intro o «Aplicar» para confirmar.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pr-1">
          <ExpressionEditor
            value={value}
            mode="code"
            ariaLabel={`Editor de ${title}`}
            onSubmit={(value) => onApply(value)}
            onCommit={(next) => {
              draftRef.current = next;
            }}
          />
        </DialogBody>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onApply(draftRef.current)}>Aplicar</Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
