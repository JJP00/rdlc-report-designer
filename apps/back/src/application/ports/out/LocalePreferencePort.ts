/**
 * Preferencia de idioma persistida (patrón `RecentFilesPort`): la necesita el
 * main **antes de crear la ventana** (diálogos nativos), así que no puede vivir
 * en el renderer.
 */
export const LOCALE_PREFERENCE_PORT = Symbol('LocalePreferencePort');

export interface LocalePreferencePort {
  /** Preferencia guardada (etiqueta BCP 47 o `null` si no hay). */
  read(): Promise<string | null>;
  /** Persiste la preferencia (un fallo de disco no debe romper la app). */
  write(locale: string): Promise<void>;
}
