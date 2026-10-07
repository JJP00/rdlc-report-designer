import * as React from 'react';
import { cn } from 'cn';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { createPortal } from 'react-dom';

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
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

/** Lado de la agarradera de la esquina (px). */
const GRIP_SIZE = 16;
/** Tamaño mínimo de un diálogo redimensionable (px). */
const MIN_DIALOG_WIDTH = 320;
const MIN_DIALOG_HEIGHT = 220;
/** Proporción máxima del viewport al redimensionar. */
const MAX_DIALOG_WIDTH_RATIO = 0.95;
const MAX_DIALOG_HEIGHT_RATIO = 0.9;

/** ¿El evento viene de la agarradera (portal fuera del contenido)? */
function isGripEvent(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-rdlc-dialog-grip]') !== null;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  resizable = false,
  style,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** El usuario puede cambiar el tamaño arrastrando la esquina inferior derecha. */
  resizable?: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  /** Elemento real del contenido (callback ref): dispara la medición al montar. */
  const [contentEl, setContentEl] = React.useState<HTMLDivElement | null>(null);
  const setContent = React.useCallback((node: HTMLDivElement | null): void => {
    contentRef.current = node;
    setContentEl(node);
  }, []);
  const dragRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  /** Esquina inferior derecha del diálogo en coordenadas de pantalla (px). */
  const [corner, setCorner] = React.useState<{ x: number; y: number } | null>(null);

  // La agarradera vive en un portal (si estuviera dentro del contenido, el
  // scroll del diálogo se la llevaría): se recoloca midiendo la esquina real.
  React.useLayoutEffect(() => {
    if (!resizable || !contentEl) return;
    const update = (): void => {
      const rect = contentEl.getBoundingClientRect();
      setCorner({
        x: Math.min(rect.right, window.innerWidth) - GRIP_SIZE + 2,
        y: Math.min(rect.bottom, window.innerHeight) - GRIP_SIZE + 2,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(contentEl);
    window.addEventListener('resize', update);
    // La animación de entrada es `transform` (no dispara el observer).
    const settle = window.setTimeout(update, 200);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.clearTimeout(settle);
      // El diálogo cerró (Radix desmonta su contenido, no este componente):
      // la agarradera se va con él para no quedar flotando sobre la app.
      setCorner(null);
    };
  }, [resizable, contentEl]);

  const clampSize = (width: number, height: number): { width: number; height: number } => ({
    width: Math.min(Math.max(width, MIN_DIALOG_WIDTH), window.innerWidth * MAX_DIALOG_WIDTH_RATIO),
    height: Math.min(
      Math.max(height, MIN_DIALOG_HEIGHT),
      window.innerHeight * MAX_DIALOG_HEIGHT_RATIO,
    ),
  });

  const resizeBy = (dx: number, dy: number): void => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSize(clampSize(rect.width + dx, rect.height + dy));
  };

  // La agarradera es un botón de la esquina: su conducta no debe cerrar el
  // diálogo (Radix lo trata como interacción «fuera» al ser un portal).
  const keepGrip = (event: { target: EventTarget | null; preventDefault(): void }): boolean => {
    if (!isGripEvent(event.target)) return false;
    event.preventDefault();
    return true;
  };

  const grip =
    resizable && corner
      ? createPortal(
          <div
            data-rdlc-dialog-grip=""
            role="separator"
            aria-label="Redimensionar el diálogo"
            aria-orientation="horizontal"
            title="Arrastra para redimensionar (doble clic: tamaño original)"
            tabIndex={-1}
            style={{
              position: 'fixed',
              left: corner.x,
              top: corner.y,
              zIndex: 60,
              pointerEvents: 'auto',
            }}
            className="flex size-4 cursor-se-resize items-end justify-end text-muted-foreground/70 outline-none hover:text-foreground"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const rect = contentRef.current?.getBoundingClientRect();
              if (!rect) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                width: rect.width,
                height: rect.height,
              };
            }}
            onPointerMove={(event) => {
              const start = dragRef.current;
              if (!start) return;
              setSize(
                clampSize(
                  start.width + (event.clientX - start.x),
                  start.height + (event.clientY - start.y),
                ),
              );
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            onDoubleClick={() => setSize(null)}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={setContent}
          data-slot="dialog-content"
          // Al redimensionar, los topes `max-w`/`max-h` (con breakpoints) se
          // anulan en línea: son clases y `max-w-none` no gana a `sm:max-w-sm`.
          style={
            size
              ? {
                  ...style,
                  width: size.width,
                  height: size.height,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
              : style
          }
          className={cn(
            'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            // Al redimensionar, el contenido scrollea si no cabe. Los diálogos
            // con scroll propio (editor de texto) lo sobreescriben con su clase.
            resizable && 'overflow-y-auto',
            className,
          )}
          onPointerDownOutside={(event) => {
            if (keepGrip(event)) return;
            onPointerDownOutside?.(event);
          }}
          onInteractOutside={(event) => {
            if (keepGrip(event)) return;
            onInteractOutside?.(event);
          }}
          onFocusOutside={(event) => {
            if (keepGrip(event)) return;
            onFocusOutside?.(event);
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
                aria-label="Cerrar"
              >
                <XIcon />
                <span className="sr-only">Cerrar</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
      {/* Fuera de `DialogPortal`: Radix envuelve cada hijo suyo en un Slot y un
          portal de React no es un elemento válido para él (rompía el render). */}
      {grip}
    </>
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
          <Button variant="outline">Close</Button>
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
