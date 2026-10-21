import type { StylePatch, TextRunDto, TextboxDto } from '@rdlc-designer/contracts';
import type { Translator } from '@rdlc-designer/i18n';
import { useT } from '@rdlc-designer/i18n/react';
import { PencilLine } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { commonEffectiveFormat } from '@/lib/textFormat';
import { isSimpleText } from '@/lib/textEditor';
import { ExpressionEditor } from './ExpressionEditor';
import { FormatField } from './FormatField';

interface TextPanelProps {
  item: TextboxDto;
  /** Edita UN TextRun (texto plano o `=expresión`); commit con Enter o al salir. */
  onSetText: (p: number, r: number, value: string) => void;
  /** Etiqueta de diseñador del run (`<Label>`); `null` la quita. */
  onSetLabel: (p: number, r: number, label: string | null) => void;
  /** Estilo del item (fuente, colores, alineación, viñetas). */
  onSetStyle: (patch: StylePatch) => void;
  /** Abre el editor de texto (párrafos → runs). */
  onOpenEditor: () => void;
}

/**
 * Panel de texto/expresión. El caso **simple** (un párrafo, un run) se edita
 * aquí mismo (valor y **etiqueta** `<Label>`); el **texto mixto** (varios
 * párrafos o runs) se edita en el editor de texto que abre el botón (y el menú
 * contextual del item).
 */
export function TextPanel({
  item,
  onSetText,
  onSetLabel,
  onSetStyle,
  onOpenEditor,
}: TextPanelProps): ReactNode {
  const t = useT();
  const simple = isSimpleText(item.paragraphs);
  const firstRun = item.paragraphs[0]?.runs[0];
  const runCount = item.paragraphs.reduce((acc, paragraph) => acc + paragraph.runs.length, 0);

  return (
    <div className="flex flex-col border-t">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t('text.panel.title')}</span>
          <Badge variant="outline">
            {t('text.document.mixedBadge', {
              paragraphs: item.paragraphs.length,
              runs: runCount,
            })}
          </Badge>
        </div>

        {simple && firstRun ? (
          <RunField
            index="1.1"
            label={firstRun.label}
            value={firstRun.value}
            onCommit={(value) => onSetText(0, 0, value)}
            onLabel={(label) => onSetLabel(0, 0, label)}
          />
        ) : (
          /* Caso mixto sin nota: el badge de arriba y el botón de abajo ya
             hacen el trabajo (barrido de microcopy). */
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {item.paragraphs.slice(0, 4).map((paragraph, p) => (
              <li key={p} className="truncate">
                <span className="font-medium">{t('text.panel.paragraph', { index: p + 1 })}</span>{' '}
                {paragraph.runs.map((run) => runSummary(t, run)).join(' · ')}
              </li>
            ))}
            {item.paragraphs.length > 4 ? <li>…</li> : null}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t('text.panel.formatLabel')}</span>
          {/* Efectivo (run > párrafo > item); con runs distintos muestra «Mixto»
              y el cambio lo aplica el comando a todos los runs. Las expresiones
              se editan con Monaco; las cadenas .NET, con el campo simple. */}
          <FormatField
            value={commonEffectiveFormat(item.paragraphs, item.style)}
            onChange={(format) => onSetStyle({ format })}
            ariaLabel={t('text.panel.formatAria')}
          />
        </div>

        <Button variant="outline" size="xs" className="self-start" onClick={onOpenEditor}>
          <PencilLine /> {t('text.panel.openEditor')}
        </Button>

        <Separator />
        <p className="text-[11px] text-muted-foreground">{t('text.panel.hint')}</p>
      </div>
    </div>
  );
}

/** Resumen corto de un run para el caso mixto. */
function runSummary(t: Translator['t'], run: TextRunDto): string {
  if (run.value.trimStart().startsWith('=')) {
    return run.label !== undefined && run.label !== ''
      ? `[${run.label}]`
      : t('text.document.expressionSummary');
  }
  return run.value === '' ? t('text.document.emptyRun') : run.value;
}

function RunField({
  index,
  label,
  value,
  onCommit,
  onLabel,
}: {
  index: string;
  /** Etiqueta de diseñador del run (`<Label>`). */
  label?: string;
  value: string;
  onCommit: (value: string) => void;
  onLabel: (label: string | null) => void;
}): ReactNode {
  const t = useT();
  // Borrador mientras se teclea: un cambio de la proyección no pisa el texto.
  const [draft, setDraft] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const labelText = labelDraft ?? label ?? '';

  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const commitDraftValue = (next: string): void => {
    if (next !== value) onCommit(next);
    setDraft(null);
  };
  const commitLabel = (): void => {
    if (labelDraft !== null) {
      const next = labelDraft.trim();
      if (next !== (label ?? '')) onLabel(next === '' ? null : next);
    }
    setLabelDraft(null);
  };

  const isExpression = value.trimStart().startsWith('=');

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {index}
        </Badge>
        <input
          className="h-6 w-36 rounded-md border bg-background px-1 font-mono text-[10px]"
          value={labelText}
          placeholder={t('text.run.labelPlaceholder')}
          title={t('text.run.labelTitle')}
          aria-label={t('text.run.labelAria', { index })}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitLabel();
            if (event.key === 'Escape') setLabelDraft(null);
          }}
        />
        {isExpression ? (
          <Badge className="text-[10px]">{t('text.run.kindExpression')}</Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">{t('text.run.kindText')}</span>
        )}
      </div>
      {isExpression ? (
        <ExpressionEditor
          value={value}
          mode="expression"
          ariaLabel={t('text.run.expressionAria', { index })}
          onCommit={commitDraftValue}
        />
      ) : (
        <Input
          className="h-7 font-mono text-xs"
          value={text}
          aria-label={t('text.run.valueAria', { index })}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      )}
    </div>
  );
}
