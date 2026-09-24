import type { ProjectionDto } from '@rdlc-designer/contracts';
import { useEffect } from 'react';
import type { CanvasHit } from '@/lib/hit';
import { TEST_HOOKS_ENABLED } from '@/lib/testHooks';

/**
 * Ganchos de diagnóstico para los E2E de Playwright (solo dev/e2e): la
 * proyección viva y el último hit del click derecho. El `SelectionFrame` y el
 * lienzo publican el resto (`__rdlcSelection`, `__rdlcCell`, `__rdlcStage`…).
 */
export function useQaHooks(projection: ProjectionDto | null, menuHit: CanvasHit | null): void {
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcProjection?: ProjectionDto | null }).__rdlcProjection = projection;
  }, [projection]);

  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    (window as Window & { __rdlcMenuHit?: CanvasHit | null }).__rdlcMenuHit = menuHit;
  }, [menuHit]);
}
