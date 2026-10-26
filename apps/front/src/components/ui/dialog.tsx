import * as React from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import { cn } from 'cn';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

/** Tamaño mínimo de un diálogo redimensionable (px). */
const MIN_DIALOG_WIDTH = 320;
const MIN_DIALOG_HEIGHT = 220;
/** Proporción máxima del viewport que puede ocupar un diálogo redimensionado. */
const MAX_DIALOG_WIDTH_RATIO = 0.95;
const MAX_DIALOG_HEIGHT_RATIO = 0.9;

interface DialogSize {
  width: number;
  height: number;
}

/**
 * Contenido de un diálogo, opcionalmente **redimensionable**.
 *
 * Con `resizable`, el marco no scrollea: la agarradera vive en su esquina
 * inferior derecha (dentro del propio contenido, BUG-61) y el scroll es
 * responsabilidad del cuerpo (`DialogBody`, ver `ResizableDialogContent`).
 *
 * El diálogo no pierde el centro al redimensionar (decisión del usuario,
 * 2026-10-13): como ambos lados crecen por igual, el delta del puntero se
 * aplica **doblado** para que el borde agarrado siga al cursor 1:1 mientras el
 * centro y la esquina opuesta se mueven simétricamente (BUG-60). El tamaño es
 * una *preferencia* recortada por el viewport (`min(px, 95vw/90vh)`), así que
 * al encoger la ventana se recorta y al crecer se recupera (BUG-62); al cerrar
 * se vuelve al estado original (BUG-65).
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  resizable = false,
  style,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** El usuario puede cambiar el tamaño arrastrando la esquina inferior derecha. */
  resizable?: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  /** Elemento que tenía el foco al abrir: al cerrar se le devuelve (UX 20). */
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  /** Rectángulo y puntero al empezar el arrastre de la agarradera. */
  const dragRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  /** Tamaño preferido por el usuario (px); el viewport lo recorta (BUG-62). */
  const [size, setSize] = React.useState<DialogSize | null>(null);
  const t = useT();

  // Al cerrar, Radix desmonta el contenido (este contenedor sigue montado): el
  // tamaño vuelve al estado original, así el diálogo reabre como la primera vez
  // (BUG-65). El diálogo está siempre centrado: no hay posición que reiniciar.
  const setContent = React.useCallback((node: HTMLDivElement | null): void => {
    contentRef.current = node;
    if (node === null) setSize(null);
  }, []);

  const clampSize = (width: number, height: number): DialogSize => ({
    width: Math.min(Math.max(width, MIN_DIALOG_WIDTH), window.innerWidth * MAX_DIALOG_WIDTH_RATIO),
    height: Math.min(
      Math.max(height, MIN_DIALOG_HEIGHT),
      window.innerHeight * MAX_DIALOG_HEIGHT_RATIO,
    ),
  });

  /** Redimensiona con el teclado (flechas en la agarradera). */
  const resizeBy = (dx: number, dy: number): void => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const base = size ?? clampSize(rect.width, rect.height);
    setSize(clampSize(base.width + dx, base.height + dy));
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // El tamaño actual se congela como preferencia explícita; a partir de ahí
    // manda el delta del puntero.
    const start = clampSize(rect.width, rect.height);
    setSize(start);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: start.width,
      height: start.height,
    };
  };

  /**
   * BUG-60: el diálogo está centrado, así que cada píxel del puntero se
   * reparte entre los dos lados. Para que el borde agarrado siga al cursor 1:1
   * sin que el centro se mueva, el tamaño crece el **doble** del delta: el
   * borde agarrado avanza `dx` y el opuesto retrocede `dx`.
   */
  const continueResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setSize(clampSize(start.width + dx * 2, start.height + dy * 2));
  };

  // El tamaño preferido con tope de viewport va en CSS: al encoger la ventana
  // se recorta solo y al crecer vuelve la preferencia (BUG-62). Los topes en
  // línea (`maxWidth`/`maxHeight: none`) siguen anulando las clases `max-w`/`max-h`.
  const sizeStyle: React.CSSProperties = size
    ? {
        width: `min(${size.width}px, ${MAX_DIALOG_WIDTH_RATIO * 100}vw)`,
        height: `min(${size.height}px, ${MAX_DIALOG_HEIGHT_RATIO * 100}vh)`,
        maxWidth: 'none',
        maxHeight: 'none',
      }
    : {};

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setContent}
        data-slot="dialog-content"
        style={{ ...style, ...sizeStyle }}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          // Marco sin scroll: la agarradera es un hijo absoluto y no puede
          // irse con el scroll (BUG-61); el cuerpo es quien scrollea.
          resizable && 'overflow-hidden',
          className,
        )}
        // El disparador se captura antes de que Radix mueva el foco al
        // diálogo; al cerrar con Esc o con un botón se le devuelve, en vez
        // de dejarlo en `body` (hallazgo UX 20).
        onOpenAutoFocus={(event) => {
          const active = document.activeElement;
          returnFocusRef.current = active instanceof HTMLElement ? active : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef.current;
          if (target?.isConnected) target.focus();
          onCloseAutoFocus?.(event);
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
              aria-label={t('common.close')}
            >
              <XIcon />
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
        {resizable && (
          <div
            data-rdlc-dialog-grip=""
            role="separator"
            aria-label={t('lib.dialog.resizeAria')}
            aria-orientation="horizontal"
            title={t('lib.dialog.resizeTitle')}
            tabIndex={-1}
            className="absolute right-0 bottom-0 z-10 flex size-4 cursor-se-resize items-end justify-end text-muted-foreground/70 outline-none select-none hover:text-foreground"
            onPointerDown={startResize}
            onPointerMove={continueResize}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            // Doble clic: vuelve al tamaño original (el diálogo ya está centrado).
            onDoubleClick={() => {
              setSize(null);
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 48 : 16;
              const delta: [number, number] | undefined = (
                {
                  ArrowRight: [step, 0],
                  ArrowLeft: [-step, 0],
                  ArrowDown: [0, step],
                  ArrowUp: [0, -step],
                } as Record<string, [number, number] | undefined>
              )[event.key];
              if (!delta) return;
              event.preventDefault();
              resizeBy(delta[0], delta[1]);
            }}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
              <path
                d="M15 6 6 15M15 10l-5 5M15 14l-1 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Marco estándar de un diálogo redimensionable (BUG-63): columna con la
 * cabecera y el pie fijos y **solo el cuerpo** con scroll. La agarradera de la
 * esquina la pinta `DialogContent` dentro del marco.
 *
 * Uso:
 * ```tsx
 * <ResizableDialogContent className="max-h-[90vh] max-w-3xl sm:max-w-3xl">
 *   <DialogHeader className="shrink-0">…</DialogHeader>
 *   <DialogBody className="pr-1">…</DialogBody>
 *   <DialogFooter>…</DialogFooter>
 * </ResizableDialogContent>
 * ```
 */
function ResizableDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return <DialogContent {...props} resizable className={cn('flex flex-col', className)} />;
}

/**
 * Cuerpo de un diálogo redimensionable: el único contenedor con scroll (el
 * marco no scrollea para que la agarradera no se mueva, BUG-61).
 */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('min-h-0 flex-1 overflow-y-auto', className)}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  const t = useT();

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:flex-wrap sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t('common.close')}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  ResizableDialogContent,
};
