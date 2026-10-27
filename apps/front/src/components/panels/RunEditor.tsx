import type { StylePatch, TextRunDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { ArrowDown, ArrowUp, Bold, Copy, Italic, Trash2, Underline, WholeWord } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { isExpressionRun } from '@/lib/textEditor';
import { toPt } from '@/lib/style';
import { ColorButton } from './ColorButton';
import { ExpressionEditor } from './ExpressionEditor';
import { FormatField } from './FormatField';

export interface RunEditorProps {
  /** Posición 1-based para la etiqueta. */
  position: number;
  run: TextRunDto;
  /** Id del `<datalist>` compartido con las fuentes disponibles en Business Central. */
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
 * El valor se edita siempre en Monaco, sea texto o `=expresión`: escribir el
 * `=` no cambia de editor ni pierde el foco. El diálogo solo monta los runs del
 * **párrafo activo** (con 20+ runs montar un editor por cada uno lo bloqueaba).
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
  const t = useT();
  const isExpression = isExpressionRun(run);
  const style = run.style;

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {position}
        </Badge>
        <Badge variant={isExpression ? 'default' : 'outline'} className="text-[10px]">
          {isExpression ? t('text.run.kindExpression') : t('text.run.kindText')}
        </Badge>
        <input
          className="h-5 w-40 rounded-md border bg-background px-1 font-mono text-[10px]"
          value={run.label ?? ''}
          placeholder={t('text.run.labelPlaceholder')}
          title={t('text.run.labelTitle')}
          aria-label={t('text.run.labelAria', { index: position })}
          onChange={(event) => onLabel(event.target.value)}
        />
        {isExpression && (run.label ?? '') !== '' ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">{run.value}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            title={isExpression ? t('text.run.toText') : t('text.run.toExpression')}
            aria-label={isExpression ? t('text.run.toText') : t('text.run.toExpression')}
            onClick={onToggleKind}
          >
            <WholeWord />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('text.run.duplicate')}
            aria-label={t('text.run.duplicate')}
            onClick={onDuplicate}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('text.run.up')}
            aria-label={t('text.run.up')}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('text.run.down')}
            aria-label={t('text.run.down')}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('text.run.remove')}
            aria-label={t('text.run.remove')}
            disabled={!canRemove}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="mt-2">
        {/* Cada tecla llega al borrador: el textarea del documento lo refleja
            al momento, como con el texto. */}
        <ExpressionEditor
          value={run.value}
          mode="expression"
          ariaLabel={
            isExpression
              ? t('text.run.expressionAria', { index: position })
              : t('text.run.valueAria', { index: position })
          }
          onChange={onValue}
          onCommit={(next) => {
            if (next !== run.value) onValue(next);
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          list={fontListId}
          className="h-6 w-28 rounded-md border bg-background px-1 text-[11px]"
          value={style?.fontFamily ?? ''}
          placeholder={t('text.run.fontPlaceholder')}
          aria-label={t('text.run.fontAria', { index: position })}
          onChange={(event) => onStyle({ fontFamily: event.target.value })}
        />

        <NumberInput
          className="h-6 w-14 shrink-0"
          value={style?.fontSize ? Math.round(toPt(style.fontSize)) : null}
          label={t('text.run.sizeAria', { index: position })}
          title={t('text.run.sizeTitle')}
          axis="x"
          min={4}
          max={72}
          step={1}
          perPx={0.1}
          decimals={0}
          placeholder="pt"
          onCommit={(pt) => onStyle({ fontSize: { value: Math.round(pt), unit: 'pt' } })}
        />

        <Button
          variant={style?.fontWeight === 'Bold' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title={t('text.run.bold')}
          aria-label={t('text.run.boldAria', { index: position })}
          onClick={() => onStyle({ fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' })}
        >
          <Bold />
        </Button>
        <Button
          variant={style?.fontStyle === 'Italic' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title={t('text.run.italic')}
          aria-label={t('text.run.italicAria', { index: position })}
          onClick={() =>
            onStyle({ fontStyle: style?.fontStyle === 'Italic' ? 'Normal' : 'Italic' })
          }
        >
          <Italic />
        </Button>
        <Button
          variant={style?.textDecoration === 'Underline' ? 'secondary' : 'ghost'}
          size="icon-xs"
          title={t('text.run.underline')}
          aria-label={t('text.run.underlineAria', { index: position })}
          onClick={() =>
            onStyle({
              textDecoration: style?.textDecoration === 'Underline' ? 'None' : 'Underline',
            })
          }
        >
          <Underline />
        </Button>

        <ColorButton
          title={t('text.run.color')}
          ariaLabel={t('text.run.colorAria', { index: position })}
          size="sm"
          value={style?.color}
          fallback="#111827"
          onChange={(color) => onStyle({ color })}
        />
        <ColorButton
          title={t('text.run.highlight')}
          ariaLabel={t('text.run.highlightAria', { index: position })}
          size="sm"
          value={style?.backgroundColor}
          fallback="#ffffff"
          highlight
          onChange={(backgroundColor) => onStyle({ backgroundColor })}
        />

        {/* Formato (`<Format>`) del run; vacío = heredar del párrafo/item. */}
        <FormatField
          className="min-w-[13.5rem] flex-1"
          value={style?.format}
          onChange={(format) => onStyle({ format })}
          ariaLabel={t('text.run.formatAria', { index: position })}
          placeholder={t('text.run.formatPlaceholder')}
        />
      </div>
    </div>
  );
}
