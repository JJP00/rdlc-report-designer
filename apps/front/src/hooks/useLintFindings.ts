import type { LintFindingDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect, useRef, useState } from 'react';

/** Retardo del recálculo tras un cambio de la proyección (ms). */
export const LINT_DEBOUNCE_MS = 600;

export interface UseLintFindingsOptions {
  /** Sesión de la pestaña activa (null sin documento). */
  sessionId: string | null;
  /** Proyección vigente: cada cambio (comando, deshacer, recarga) pide un nuevo lint. */
  projection: ProjectionDto | null;
  /** false sin backend (navegador de desarrollo): no se pide nada. */
  enabled: boolean;
}

/**
 * Hallazgos del lint de BC del documento de la sesión. Pide el lint al activar
 * el informe y, tras cada cambio de la proyección, con un debounce. Las
 * respuestas de una sesión anterior o de una petición superada se descartan.
 * Un fallo del IPC cuenta como «sin hallazgos»: nunca lanza a la interfaz.
 */
export function useLintFindings({
  sessionId,
  projection,
  enabled,
}: UseLintFindingsOptions): LintFindingDto[] {
  const [result, setResult] = useState<{ sessionId: string; findings: LintFindingDto[] } | null>(
    null,
  );
  /** Sesión de la última petición: la primera de cada sesión sale sin esperar. */
  const lastSession = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || sessionId === null || projection === null) return;

    const delay = lastSession.current === sessionId ? LINT_DEBOUNCE_MS : 0;
    lastSession.current = sessionId;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void requestLint(sessionId).then((findings) => {
        if (!cancelled) setResult({ sessionId, findings });
      });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, sessionId, projection]);

  // Un resultado de otra sesión no se muestra (la pestaña activa cambió).
  return result !== null && result.sessionId === sessionId ? result.findings : [];
}

async function requestLint(sessionId: string): Promise<LintFindingDto[]> {
  try {
    const response = await window.api.lint(sessionId);
    return response?.ok === true && Array.isArray(response.findings) ? response.findings : [];
  } catch {
    return [];
  }
}
