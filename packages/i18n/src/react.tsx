/**
 * Binding React del paquete (subpath `@rdlc-designer/i18n/react`).
 *
 * El idioma lo resuelve el main (preferencia → SO → EN) y llega al renderer
 * **antes del primer render**; el cambio desde el menú se aplica en caliente y
 * se persiste con `persist` (el renderer no conoce el transporte).
 *
 * - `t`: traductor del idioma **efectivo** (`qps-ploc` incluido en dev).
 * - `preference`: lo que marca el menú «Idioma» (nunca el pseudo-idioma).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LOCALES, normalizeLocale, type Locale } from './locale.js';
import { createTranslatorFor, type Translator } from './translate.js';

export interface I18nContextValue {
  /** Idioma efectivo (`en`, `es` o `qps-ploc` en desarrollo). */
  locale: string;
  /** Preferencia persistible que marca el menú. */
  preference: Locale;
  locales: readonly Locale[];
  t: Translator['t'];
  translator: Translator;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** Idioma efectivo ya resuelto por el main. */
  initialLocale: string;
  /** Preferencia que marca el menú («Fichero → Idioma»). */
  initialPreference: Locale;
  /** Persiste la preferencia (en la app: `window.api.setLocale`). */
  persist?: (locale: Locale) => void | Promise<void>;
  children: ReactNode;
}

export function I18nProvider({
  initialLocale,
  initialPreference,
  persist,
  children,
}: I18nProviderProps): ReactNode {
  const [state, setState] = useState({ locale: initialLocale, preference: initialPreference });
  const translator = useMemo(() => createTranslatorFor(state.locale), [state.locale]);

  useEffect(() => {
    // El pseudo-idioma no se expone a lectores de pantalla: `lang` real.
    document.documentElement.lang = normalizeLocale(state.locale) ?? 'en';
  }, [state.locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setState({ locale: next, preference: next });
      void persist?.(next);
    },
    [persist],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: state.locale,
      preference: state.preference,
      locales: LOCALES,
      t: translator.t,
      translator,
      setLocale,
    }),
    [state, translator, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('Los hooks de i18n requieren <I18nProvider>');
  return value;
}

/** Función de traducción (`t('toolbar.file.new')`). */
export function useT(): Translator['t'] {
  return useI18nContext().t;
}

/** Traductor completo (para `translateError` y claves dinámicas). */
export function useTranslator(): Translator {
  return useI18nContext().translator;
}

/** Preferencia, idiomas disponibles y cambio en caliente (Fichero → Idioma). */
export function useLocale(): {
  locale: Locale;
  locales: readonly Locale[];
  setLocale: (locale: Locale) => void;
} {
  const { preference, locales, setLocale } = useI18nContext();
  return { locale: preference, locales, setLocale };
}
