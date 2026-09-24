import type { StylePatch, TextRunDto } from '@rdlc-designer/contracts';
import { ArrowDown, ArrowUp, Bold, Copy, Italic, Trash2, Underline, WholeWord } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isExpressionRun } from '@/lib/textEditor';
import { toHexColor, toPt } from '@/lib/style';
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

        <Input
          className="h-6 w-12 text-[11px] tabular-nums"
          type="number"
          min={4}
          max={72}
          title="Tamaño (pt)"
          aria-label={`Tamaño del run ${position}`}
          value={style?.fontSize ? Math.round(toPt(style.fontSize) * 10) / 10 : ''}
          placeholder="pt"
          onChange={(event) => {
            const value = Number.parseFloat(event.target.value);
            if (Number.isFinite(value) && value > 0) onStyle({ fontSize: { value, unit: 'pt' } });
          }}
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

        <label
          title="Color de texto"
          className="flex h-6 w-8 cursor-pointer items-center justify-center rounded-md border bg-background text-[11px] font-bold hover:bg-muted"
        >
          <span style={{ color: toHexColor(style?.color, '#111827') }}>A</span>
          <input
            type="color"
            className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
            value={toHexColor(style?.color, '#111827')}
            aria-label={`Color del run ${position}`}
            onChange={(event) => onStyle({ color: event.target.value.toUpperCase() })}
          />
        </label>
        <label
          title="Resaltado"
          className="flex h-6 w-8 cursor-pointer items-center justify-center rounded-md border bg-background text-[11px] font-bold hover:bg-muted"
        >
          <span
            className="rounded-sm px-0.5"
            style={{ backgroundColor: toHexColor(style?.backgroundColor, '#ffffff') }}
          >
            A
          </span>
          <input
            type="color"
            className="h-3.5 w-3.5 cursor-pointer border-0 bg-transparent p-0"
            value={toHexColor(style?.backgroundColor, '#ffffff')}
            aria-label={`Resaltado del run ${position}`}
            onChange={(event) => onStyle({ backgroundColor: event.target.value.toUpperCase() })}
          />
        </label>
      </div>
    </div>
  );
}
