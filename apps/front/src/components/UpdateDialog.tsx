import type { UpdateState } from '@rdlc-designer/contracts';
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
import { useUpdaterContext, type UpdaterController } from '@/hooks/updaterContext';

/**
 * Diálogo de actualización (Fichero → Buscar actualizaciones… o aviso del
 * arranque). Muestra la versión ofrecida con las notas de la release y deja
 * elegir: actualizar ahora, más tarde (la oferta sigue en el menú Fichero) u
 * omitir esa versión. En instalaciones que no se actualizan en sitio
 * (portable/MSI/zip) solo enlaza a la página de descargas.
 */
export function UpdateDialog(): ReactNode {
  const t = useT();
  const updater = useUpdaterContext();
  const state = updater?.state;
  if (!updater || !state || state.status === 'idle') return null;

  const close = (): void => updater.setDialogOpen(false);

  return (
    <Dialog open={updater.dialogOpen} onOpenChange={updater.setDialogOpen}>
      <DialogContent className="sm:max-w-lg" data-testid="update-dialog">
        <DialogHeader>
          <DialogTitle>{titleOf(state, t)}</DialogTitle>
          <DialogDescription>{descriptionOf(state, t)}</DialogDescription>
        </DialogHeader>

        {state.status === 'downloading' ? <Progress percent={state.percent ?? 0} /> : null}
        {state.status === 'error' && state.errorMessage ? (
          <p className="font-mono text-xs break-all text-muted-foreground">{state.errorMessage}</p>
        ) : null}
        {state.version && state.status !== 'error' ? <ReleaseNotes notes={state.notes} /> : null}

        <DialogFooter>
          <UpdateActions state={state} updater={updater} close={close} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botones del pie según el estado de la actualización (el primero toma el foco). */
function UpdateActions({
  state,
  updater,
  close,
}: {
  state: UpdateState;
  updater: UpdaterController;
  close: () => void;
}): ReactNode {
  const t = useT();
  const later = (
    <Button variant="outline" onClick={close}>
      {t('dialogs.update.later')}
    </Button>
  );
  const skip = (
    <Button variant="ghost" onClick={() => void updater.skip()}>
      {t('dialogs.update.skip')}
    </Button>
  );

  switch (state.status) {
    case 'available':
      return (
        <>
          {state.canInstall ? (
            <Button autoFocus onClick={() => void updater.download()}>
              {t('dialogs.update.download')}
            </Button>
          ) : (
            <Button autoFocus onClick={() => void updater.openReleasePage()}>
              {t('dialogs.update.openReleasePage')}
            </Button>
          )}
          {later}
          {skip}
        </>
      );
    case 'downloading':
      return later;
    case 'downloaded':
      return (
        <>
          <Button autoFocus onClick={() => void updater.install()}>
            {t('dialogs.update.restart')}
          </Button>
          {later}
        </>
      );
    case 'error':
      return (
        <>
          <Button autoFocus onClick={() => void updater.check()}>
            {t('dialogs.update.retry')}
          </Button>
          <Button variant="outline" onClick={close}>
            {t('common.close')}
          </Button>
        </>
      );
    case 'upToDate':
    case 'checking':
      return (
        <Button variant="outline" onClick={close}>
          {t('common.close')}
        </Button>
      );
    default:
      return null;
  }
}

type Translate = ReturnType<typeof useT>;

function titleOf(state: UpdateState, t: Translate): string {
  switch (state.status) {
    case 'available':
    case 'downloading':
      return t('dialogs.update.availableTitle', { version: state.version ?? '' });
    case 'downloaded':
      return t('dialogs.update.readyTitle', { version: state.version ?? '' });
    case 'error':
      return t('dialogs.update.errorTitle');
    default:
      return t('dialogs.update.title');
  }
}

function descriptionOf(state: UpdateState, t: Translate): string {
  switch (state.status) {
    case 'checking':
      return t('dialogs.update.checking');
    case 'upToDate':
      return t('dialogs.update.upToDate', { version: state.currentVersion });
    case 'available':
      return state.canInstall
        ? t('dialogs.update.availableDescription', { current: state.currentVersion })
        : t('dialogs.update.notInstallable');
    case 'downloading':
      return t('dialogs.update.downloading', {
        version: state.version ?? '',
        percent: state.percent ?? 0,
      });
    case 'downloaded':
      return t('dialogs.update.readyDescription');
    case 'error':
      return t('dialogs.update.errorDescription');
    default:
      return '';
  }
}

function Progress({ percent }: { percent: number }): ReactNode {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Notas de la release de GitHub como **texto plano**: nunca HTML ni Markdown
 * interpretado (el contenido viene de la red).
 */
function ReleaseNotes({ notes }: { notes: string | null | undefined }): ReactNode {
  const t = useT();
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">
        {t('dialogs.update.notesHeading')}
      </h3>
      <div
        tabIndex={0}
        className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs break-words whitespace-pre-wrap"
      >
        {notes ?? t('dialogs.update.noNotes')}
      </div>
    </section>
  );
}
