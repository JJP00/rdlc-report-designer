import type { StylePatch, TextRunDto, TextboxDto } from '@rdlc-designer/contracts';
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
  const simple = isSimpleText(item.paragraphs);
  const firstRun = item.paragraphs[0]?.runs[0];

  return (
    <div className="flex flex-col border-t">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Texto y expresión</span>
          <Badge variant="outline">
            {item.paragraphs.length} párr. ·{' '}
            {item.paragraphs.reduce((acc, paragraph) => acc + paragraph.runs.length, 0)}{' '}
            fragmento(s)
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
          <>
            <p className="text-xs text-muted-foreground">
              Este textbox tiene texto mixto (varios párrafos o fragmentos). Ábrelo en el editor de
              texto para escribir, insertar expresiones o cambiar el formato de cada fragmento.
            </p>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {item.paragraphs.slice(0, 4).map((paragraph, p) => (
                <li key={p} className="truncate">
                  <span className="font-medium">Párrafo {p + 1}:</span>{' '}
                  {paragraph.runs.map(runSummary).join(' · ')}
                </li>
              ))}
              {item.paragraphs.length > 4 ? <li>…</li> : null}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Formato</span>
          {/* Efectivo (run > párrafo > item); con runs distintos muestra «Mixto»
              y el cambio lo aplica el comando a todos los runs. Las expresiones
              se editan con Monaco; las cadenas .NET, con el campo simple. */}
          <FormatField
            value={commonEffectiveFormat(item.paragraphs, item.style)}
            onChange={(format) => onSetStyle({ format })}
            ariaLabel="Formato del textbox"
          />
        </div>

        <Button variant="outline" size="xs" className="self-start" onClick={onOpenEditor}>
          <PencilLine /> Abrir editor de texto
        </Button>

        <Separator />
        <p className="text-[11px] text-muted-foreground">
          Texto plano o expresión con <code>=Fields!Campo.Value</code>,{' '}
          <code>=Parameters!X.Value</code>… Las expresiones se editan en Monaco con resaltado y
          autocompletado (Ctrl+Espacio): campos, parámetros, funciones de <code>Code.</code>,
          Globals! y User!. El panel de variables inserta en la posición del cursor.
        </p>
      </div>
    </div>
  );
}

/** Resumen corto de un run para el caso mixto. */
function runSummary(run: TextRunDto): string {
  if (run.value.trimStart().startsWith('=')) {
    return run.label !== undefined && run.label !== '' ? `[${run.label}]` : '[expresión]';
  }
  return run.value === '' ? '(vacío)' : run.value;
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
          placeholder="etiqueta (Label)"
          title="Etiqueta de Business Central (<Label>): BC muestra esta etiqueta en lugar de la expresión"
          aria-label={`Etiqueta del run ${index}`}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitLabel();
            if (event.key === 'Escape') setLabelDraft(null);
          }}
        />
        {isExpression ? (
          <Badge className="text-[10px]">expresión</Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">texto</span>
        )}
      </div>
      {isExpression ? (
        <ExpressionEditor
          value={value}
          mode="expression"
          ariaLabel={`Expresión del run ${index}`}
          onCommit={commitDraftValue}
        />
      ) : (
        <Input
          className="h-7 font-mono text-xs"
          value={text}
          aria-label={`Valor del run ${index}`}
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
