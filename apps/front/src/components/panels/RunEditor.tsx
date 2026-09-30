import type { StylePatch, TextRunDto } from '@rdlc-designer/contracts';
import { ArrowDown, ArrowUp, Bold, Copy, Italic, Trash2, Underline, WholeWord } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { useDeferredColor } from '@/hooks/useDeferredColor';
import { isExpressionRun } from '@/lib/textEditor';
import { toPt } from '@/lib/style';
import { ExpressionEditor } from './ExpressionEditor';

export interface RunEditorProps {
  /** Posición 1-based para la etiqueta. */
  position: number;
  run: TextRunDto;
  /** Id del `<datalist>` compartido con las fuentes del sistema. */
  fontListId: string;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onValue: (value: string) => void;
  /** Etiqueta de BC (`<Label>`); vacío = quitarla. */
  onLabel: (label: string) => void;
  onStyle: (patch: StylePatch) => void;
  onToggleKind: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}

/**
 * Un TextRun del editor de texto: valor (texto o expresión) y su formato
 * (fuente, tamaño, negrita/cursiva/subrayado, color, resaltado).
 *
 * El valor se edita siempre en un `Input`: **Monaco no se monta por run** (con
 * 20+ runs montar un editor por cada expresión bloqueaba el diálogo); el botón
 * `Σ` abre el editor de expresión con una única instancia.
 */
export function RunEditor({
  position,
  run,
  fontListId,
  canRemove,
  canMoveUp,
  canMoveDown,
  onValue,
  onLabel,
  onStyle,
  onToggleKind,
  onDuplicate,
  onMove,
  onRemove,
}: RunEditorProps): ReactNode {
  const isExpression = isExpressionRun(run);
  const style = run.style;

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {position}
        </Badge>
        <Badge variant={isExpression ? 'default' : 'outline'} className="text-[10px]">
          {isExpression ? 'expresión' : 'texto'}
        </Badge>
        <input
          className="h-5 w-40 rounded-md border bg-background px-1 font-mono text-[10px]"
          value={run.label ?? ''}
          placeholder="etiqueta (Label)"
          title="Etiqueta de Business Central (<Label>): BC muestra esta etiqueta en lugar de la expresión"
          aria-label={`Etiqueta del run ${position}`}
          onChange={(event) => onLabel(event.target.value)}
        />
        {isExpression && (run.label ?? '') !== '' ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">{run.value}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            title={isExpression ? 'Convertir en texto' : 'Convertir en expresión'}
            aria-label={isExpression ? 'Convertir en texto' : 'Convertir en expresión'}
            onClick={onToggleKind}
          >
            <WholeWord />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Duplicar run"
            aria-label="Duplicar run"
            onClick={onDuplicate}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Subir run"
            aria-label="Subir run"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Bajar run"
            aria-label="Bajar run"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Eliminar run"
            aria-label="Eliminar run"
            disabled={!canRemove}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="mt-2">
        {isExpression ? (
          /* Expresión: Monaco inline con resaltado y autocompletado (el bloque
             muestra solo el párrafo activo, no hay problema de instancias). */
          <ExpressionEditor
            value={run.value}
            mode="expression"
            ariaLabel={`Expresión del run ${position}`}
            onCommit={onValue}
          />
        ) : (
          <Input
            className="h-7 font-mono text-xs"
            value={run.value}
            aria-label={`Valor del run ${position}`}
            onChange={(event) => onValue(event.target.value)}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          list={fontListId}
          className="h-6 w-28 rounded-md border bg-background px-1 text-[11px]"
          value={style?.fontFamily ?? ''}
          placeholder="(heredada)"
          aria-label={`Fuente del run ${position}`}
          onChange={(event) => onStyle({ fontFamily: event.target.value })}
        />

        <NumberInput
          className="h-6 w-14 shrink-0"
          value={style?.fontSize ? Math.round(toPt(style.fontSize) * 10) / 10 : null}
          label={`Tamaño del run ${position}`}
          title="Tamaño (pt): flechas o arrastre"
          axis="x"
          min={4}
          max={72}
          step={1}
          perPx={0.1}
          placeholder="pt"
          onCommit={(pt) => onStyle({ fontSize: { value: pt, unit: 'pt' } })}
        />

        <Button
          variant={style?.fontWeight === 'Bold' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title="Negrita"
          aria-label={`Negrita del run ${position}`}
          onClick={() => onStyle({ fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' })}
        >
          <Bold />
        </Button>
        <Button
          variant={style?.fontStyle === 'Italic' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title="Cursiva"
          aria-label={`Cursiva del run ${position}`}
          onClick={() =>
            onStyle({ fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' })
          }
        >
          <Italic />
        </Button>
        <Button
          variant={style?.textDecoration === 'Underline' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title="Subrayado"
          aria-label={`Subrayado del run ${position}`}
          onClick={() =>
            onStyle({
              textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline',
            })
          }
        >
          <Underline />
        </Button>

        <RunColorField
          title="Color de texto"
          ariaLabel={`Color del run ${position}`}
          value={style?.color}
          fallback="#111827"
          onChange={(color) => onStyle({ color })}
        />
        <RunColorField
          title="Resaltado"
          ariaLabel={`Resaltado del run ${position}`}
          value={style?.backgroundColor}
          fallback="#ffffff"
          highlight
          onChange={(backgroundColor) => onStyle({ backgroundColor })}
        />
      </div>
    </div>
  );
}

/** Selector de color del run con commit diferido (arrastrar no envía un comando por paso). */
function RunColorField({
  title,
  ariaLabel,
  value,
  fallback,
  highlight,
  onChange,
}: {
  title: string;
  ariaLabel: string;
  value?: string;
  fallback: string;
  highlight?: boolean;
  onChange: (color: string) => void;
}): ReactNode {
  const { color, change } = useDeferredColor(value, fallback, onChange);

  return (
    <label
      title={title}
      className="flex h-6 w-8 cursor-pointer items-center justify-center rounded-md border bg-background text-[11px] font-bold hover:bg-muted"
    >
      <span
        className={highlight ? 'rounded-sm px-0.5' : ''}
        style={highlight ? { backgroundColor: color } : { color }}
      >
        A
      </span>
      <input
        type="color"
        className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
        value={color}
        aria-label={ariaLabel}
        onChange={(event) => change(event.target.value)}
      />
    </label>
  );
}
