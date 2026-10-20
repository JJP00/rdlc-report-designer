/**
 * Idioma efectivo del proceso main y traductor vigente.
 *
 * Orden de resolución (`docs/features/0005-i18n.md`): `RDLC_LOCALE` (dev/QA) →
 * preferencia guardada → idioma del SO → inglés. `set()` persiste la
 * preferencia y **cambia en caliente** el traductor de los diálogos nativos;
 * el renderer recibe el aviso por el resultado del canal `setLocale`.
 */
import type { LocaleResult } from '@rdlc-designer/contracts';
import {
  createTranslator,
  LOCALES,
  resolveEffectiveLocale,
  resolvePreferredLocale,
  type Locale,
  type Translator,
} from '@rdlc-designer/i18n';
import type { LocalePreferencePort } from '../../application/ports/out/LocalePreferencePort.js';

export class LocaleRuntime {
  private saved: string | null = null;
  private current: Translator;

  constructor(
    private readonly preference: LocalePreferencePort,
    private readonly env: string | undefined,
    private readonly system: string,
  ) {
    this.current = this.create();
  }

  /** Lee la preferencia guardada; llamar antes de crear la ventana. */
  async init(): Promise<void> {
    this.saved = await this.preference.read();
    this.current = this.create();
  }

  /** Traductor vigente (cambia en caliente con `set`). */
  get translator(): Translator {
    return this.current;
  }

  /** Etiqueta del idioma efectivo (`en`, `es` o `qps-ploc` en desarrollo). */
  get locale(): string {
    return this.current.locale;
  }

  snapshot(): LocaleResult {
    return {
      ok: true,
      locale: this.locale,
      preferred: resolvePreferredLocale({ env: this.env, saved: this.saved, system: this.system }),
      system: this.system,
      locales: [...LOCALES],
    };
  }

  /** Persiste la preferencia y aplica el idioma en caliente. */
  async set(locale: Locale): Promise<LocaleResult> {
    this.saved = locale;
    await this.preference.write(locale);
    this.current = this.create();
    return this.snapshot();
  }

  private create(): Translator {
    return createTranslator(
      resolveEffectiveLocale({ env: this.env, saved: this.saved, system: this.system }),
    );
  }
}
