import type { StylePatch, TextRunDto } from '@rdlc-designer/contracts';
import { useT } from '@rdlc-designer/i18n/react';
import { ArrowDown, ArrowUp, Bold, Copy, Italic, Trash2, Underline } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { isExpressionRun } from '@/lib/textEditor';
import { toPt } from '@/lib/style';
import { ColorButton } from './ColorButton';
import { ExpressionEditor, type ExpressionEditorHandle } from './ExpressionEditor';
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
  /** Editor del valor, para darle el foco desde fuera (clic en su expresión del textarea). */
  valueRef?: Ref<ExpressionEditorHandle>;
}

/** Rótulo visible de un grupo de controles del fragmento. */
const CAPTION = 'text-[11px] text-muted-foreground';

/**
 * Un TextRun del editor de texto: tipo (texto | expresión), etiqueta de BC,
 * valor y su formato (fuente, tamaño, negrita/cursiva/subrayado, color,
 * resaltado y `<Format>`).
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
  valueRef,
}: RunEditorProps): ReactNode {
  const t = useT();
  const isExpression = isExpressionRun(run);
  const style = run.style;

  return (
    <div
      data-rdlc-run-index={position - 1}
      className="rounded-md border bg-background p-2 transition-colors focus-within:border-ring/70"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {position}
        </Badge>

        {/* El tipo se ve y se cambia en el mismo control: el pulsado es el vigente. */}
        <div
          role="group"
          aria-label={t('text.run.kindAria', { index: position })}
          className="inline-flex items-center gap-px rounded-md border p-px"
        >
          <Button
            variant={isExpression ? 'ghost' : 'default'}
            size="xs"
            className="h-5 px-1.5 text-[11px]"
            aria-pressed={!isExpression}
            title={isExpression ? t('text.run.toText') : undefined}
            onClick={() => {
              if (isExpression) onToggleKind();
            }}
          >
            {t('text.run.asText')}
          </Button>
          <Button
            variant={isExpression ? 'default' : 'ghost'}
            size="xs"
            className="h-5 px-1.5 text-[11px]"
            aria-pressed={isExpression}
            title={isExpression ? undefined : t('text.run.toExpression')}
            onClick={() => {
              if (!isExpression) onToggleKind();
            }}
          >
            {t('text.run.asExpression')}
          </Button>
        </div>

        <label className={`flex items-center gap-1 ${CAPTION}`}>
          {t('text.run.labelCaption')}
          <input
            className="h-6 w-40 rounded-md border bg-background px-1 font-mono text-[11px] text-foreground"
            value={run.label ?? ''}
            placeholder={t('text.run.labelNone')}
            title={t('text.run.labelTitle')}
            aria-label={t('text.run.labelAria', { index: position })}
            onChange={(event) => onLabel(event.target.value)}
          />
        </label>

        <div className="ml-auto flex items-center gap-0.5">
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
          ref={valueRef}
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

      <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-[auto_minmax(13.5rem,1fr)]">
        <div className="flex flex-col gap-1">
          <span className={CAPTION}>{t('text.run.fontCaption')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
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
              aria-pressed={style?.fontWeight === 'Bold'}
              onClick={() =>
                onStyle({ fontWeight: style?.fontWeight === 'Bold' ? 'Normal' : 'Bold' })
              }
            >
              <Bold />
            </Button>
            <Button
              variant={style?.fontStyle === 'Italic' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title={t('text.run.italic')}
              aria-label={t('text.run.italicAria', { index: position })}
              aria-pressed={style?.fontStyle === 'Italic'}
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
              aria-pressed={style?.textDecoration === 'Underline'}
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
          </div>
        </div>

        {/* Formato (`<Format>`) del run; vacío = heredar del párrafo/item. */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className={CAPTION}>{t('text.run.formatCaption')}</span>
          <FormatField
            value={style?.format}
            onChange={(format) => onStyle({ format })}
            ariaLabel={t('text.run.formatAria', { index: position })}
            placeholder={t('text.run.formatPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
