import type { LintFindingDto, ProjectionDto } from '@rdlc-designer/contracts';
import { useT, useTranslator } from '@rdlc-designer/i18n/react';
import { CircleCheck, Info, OctagonX, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { LINT_SEVERITY_KEYS, lintMessage, sortLintFindings, type LintSeverity } from '@/lib/lint';
import { findItem } from '@/lib/projection';

export interface ProblemsPanelProps {
  findings: LintFindingDto[];
  projection: ProjectionDto;
  /** Selecciona (y revela en la jerarquía) el item de un hallazgo. */
  onSelectItem: (id: string) => void;
  onClose: () => void;
}

const SEVERITY_ICONS: Record<LintSeverity, LucideIcon> = {
  error: OctagonX,
  warning: TriangleAlert,
  hint: Info,
};

const SEVERITY_CLASSES: Record<LintSeverity, string> = {
  error: 'text-destructive',
  warning: 'text-amber-700 dark:text-amber-400',
  hint: 'text-muted-foreground',
};

/**
 * Panel «Problemas» (lint de BC) en la franja inferior, sobre el pie. Los
 * hallazgos van ordenados por severidad; los que tienen un item existente
 * llevan a él al pulsarlos.
 */
export function ProblemsPanel({
  findings,
  projection,
  onSelectItem,
  onClose,
}: ProblemsPanelProps): ReactNode {
  const t = useT();
  const translator = useTranslator();
  const sorted = sortLintFindings(findings);

  return (
    <section
      aria-label={t('lint.title')}
      className="flex max-h-56 min-h-0 shrink-0 flex-col overflow-hidden border-t bg-background text-sm"
    >
      <header className="flex items-center gap-2 border-b px-3 py-1">
        <span className="font-medium">{t('lint.title')}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={t('lint.hide')}
          title={t('lint.hide')}
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </header>

      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
          <CircleCheck aria-hidden className="size-4 text-emerald-700 dark:text-emerald-400" />
          {t('lint.empty')}
        </p>
      ) : (
        // `relative`: los `sr-only` de las filas son absolutos; sin contenedor propio
        // salen del panel y alargan el scroll de toda la página.
        <ul className="relative min-h-0 flex-1 overflow-y-auto">
          {sorted.map((finding, index) => {
            const Icon = SEVERITY_ICONS[finding.severity];
            const severityLabel = t(LINT_SEVERITY_KEYS[finding.severity]);
            const itemName = finding.itemId;
            const selectable =
              itemName !== undefined && findItem(projection, itemName) !== undefined;
            const body = (
              <>
                <Icon
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 ${SEVERITY_CLASSES[finding.severity]}`}
                />
                <span className="sr-only">{severityLabel}:</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{lintMessage(finding, translator.tUnsafe)}</span>
                  {itemName !== undefined || finding.location !== undefined ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[itemName, finding.location].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={`${finding.rule}-${finding.itemId ?? ''}-${index}`}>
                {selectable ? (
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => onSelectItem(itemName)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-3 py-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
