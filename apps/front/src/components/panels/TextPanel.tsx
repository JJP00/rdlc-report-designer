import type { StylePatch, TextboxDto } from '@rdlc-designer/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FormatToolbar } from './FormatToolbar';

interface TextPanelProps {
  item: TextboxDto;
  /** Edita UN TextRun (texto plano o `=expresión`); commit con Enter o al salir. */
  onSetText: (p: number, r: number, value: string) => void;
  /** Estilo del item (fuente, colores, alineación, viñetas). */
  onSetStyle: (patch: StylePatch) => void;
}

/**
 * Panel de texto/expresión. F1: edición por run (cubre el caso simple y el
 * texto mixto); el editor rich-text completo llegará con el dominio `expression`.
 */
export function TextPanel({ item, onSetText, onSetStyle }: TextPanelProps): ReactNode {
  return (
    <div className="flex flex-col border-t">
      <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Texto y expresión</span>
        <Badge variant="outline">
          {item.paragraphs.length} párr. ·{' '}
          {item.paragraphs.reduce((acc, paragraph) => acc + paragraph.runs.length, 0)} run(s)
        </Badge>
      </div>

      {item.paragraphs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Este textbox no tiene párrafos.</p>
      ) : null}

      {item.paragraphs.map((paragraph, p) => (
        <div key={`p${p}`} className="flex flex-col gap-2">
          {item.paragraphs.length > 1 ? (
            <div className="text-[11px] font-medium text-muted-foreground">Párrafo {p + 1}</div>
          ) : null}
          {paragraph.runs.map((run, r) => (
            <RunField
              key={`${p}.${r}`}
              index={`${p}.${r}`}
              label={run.label}
              value={run.value}
              onCommit={(value) => onSetText(p, r, value)}
            />
          ))}
        </div>
      ))}

      <Separator />
      <p className="text-[11px] text-muted-foreground">
        Texto plano o expresión con <code>=Fields!Campo.Value</code>,{' '}
        <code>=Parameters!X.Value</code>… El autocompletado con la lista de variables llega con el
        dominio <code>expression</code>.
      </p>
      </div>
    </div>
  );
}

function RunField({
  index,
  label,
  value,
  onCommit,
}: {
  index: string;
  /** Etiqueta de diseñador del run (`<Label>`); se muestra, no se edita. */
  label?: string;
  value: string;
  onCommit: (value: string) => void;
}): ReactNode {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = (): void => {
    if (text !== value) onCommit(text);
  };

  const isExpression = value.trimStart().startsWith('=');

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {index}
        </Badge>
        {label !== undefined ? (
          <Badge variant="outline" className="text-[10px]">
            [{label}]
          </Badge>
        ) : null}
        {isExpression ? (
          <Badge className="text-[10px]">expresión</Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">texto</span>
        )}
      </div>
      <Input
        className="h-7 font-mono text-xs"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}
