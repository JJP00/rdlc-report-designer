import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@rdlc-designer/i18n/react';
import type { Locale } from '@rdlc-designer/i18n';
import { App } from './App';
import { BenchPage } from './BenchPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root en index.html');

// `?bench=972` → página de benchmark (solo dev).
const benchCount = new URLSearchParams(window.location.search).get('bench');

/**
 * Idioma de arranque: lo resuelve el main (preferencia → SO → EN) y se pide
 * **antes del primer render** para que no haya parpadeo de idioma. Sin puente
 * (renderer suelto en el navegador) se arranca en inglés.
 */
async function loadLocale(): Promise<{ locale: string; preference: Locale }> {
  try {
    const result = await window.api?.getLocale();
    if (result?.ok) return { locale: result.locale, preference: result.preferred };
  } catch {
    // Sin puente o main caído: fallback neutro.
  }
  return { locale: 'en', preference: 'en' };
}

async function renderApp(rootElement: HTMLElement): Promise<void> {
  const { locale, preference } = await loadLocale();

  const root = createRoot(rootElement);
  const page =
    benchCount !== null ? (
      <BenchPage count={Number.parseInt(benchCount, 10) || 972} />
    ) : (
      <StrictMode>
        <App />
      </StrictMode>
    );

  root.render(
    <I18nProvider
      initialLocale={locale}
      initialPreference={preference}
      persist={(next) => {
        void window.api?.setLocale(next);
      }}
    >
      <ErrorBoundary>{page}</ErrorBoundary>
    </I18nProvider>,
  );
}

void renderApp(container);
