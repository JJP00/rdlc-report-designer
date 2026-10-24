import type { UpdateState } from '@rdlc-designer/contracts';
import { createContext, useContext } from 'react';

/** Superficie de las actualizaciones que consumen la toolbar y el diálogo. */
export interface UpdaterController {
  /** Estado vigente (`null` hasta la primera respuesta del main o sin puente). */
  state: UpdateState | null;
  /** El diálogo de actualización está abierto. */
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  /** Hay una versión ofrecida (disponible, descargando o lista para instalar). */
  hasPending: boolean;
  /** Fichero → Buscar actualizaciones…: abre el diálogo y comprueba. */
  check: () => Promise<void>;
  /** Fichero → «Actualización disponible…»: reabre el diálogo sin comprobar de nuevo. */
  openDialog: () => void;
  download: () => Promise<void>;
  /** Reinicia e instala (el main pasa por la guarda de cambios sin guardar). */
  install: () => Promise<void>;
  skip: () => Promise<void>;
  openReleasePage: () => Promise<void>;
}

/** Sin proveedor (tests aislados de la toolbar) las actualizaciones no existen. */
export const UpdaterContext = createContext<UpdaterController | null>(null);

export function useUpdaterContext(): UpdaterController | null {
  return useContext(UpdaterContext);
}
