import { useT } from '@rdlc-designer/i18n/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Red de seguridad del renderer (BUG-43): sin ella, cualquier error de render
 * desmonta la app entera y deja una pantalla en blanco sin rastro. Aquí se
 * muestra un aviso con el mensaje y el **component stack** va a la consola (y
 * al log del main vía `console-message`).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[render] error no capturado:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return <ErrorFallback error={error} />;
  }
}

/** Aviso de la red de seguridad; en su propio componente para poder usar `useT`. */
function ErrorFallback({ error }: { error: Error }): ReactNode {
  const t = useT();

  return (
    <div
      role="alert"
      className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground"
    >
      <h1 className="text-sm font-semibold">{t('app.fatal.title')}</h1>
      <p className="max-w-md text-xs text-muted-foreground">{t('app.fatal.hint')}</p>
      {/* El mensaje del error es diagnóstico en runtime: no se traduce. */}
      <p className="max-w-md text-xs text-muted-foreground/80">{error.message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        {t('common.reloadInterface')}
      </button>
    </div>
  );
}
