/**
 * Preferencias de actualización persistidas (patrón `LocalePreferencePort`):
 * hoy solo la versión que el usuario eligió omitir.
 */
export const UPDATE_PREFERENCE_PORT = Symbol('UpdatePreferencePort');

export interface UpdatePreferencePort {
  /** Versión omitida por el usuario, o `null` si no hay. */
  readSkippedVersion(): Promise<string | null>;
  /** Persiste la versión omitida (un fallo de disco no debe romper la app). */
  writeSkippedVersion(version: string): Promise<void>;
}
