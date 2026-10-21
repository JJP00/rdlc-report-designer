import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  FORMAT_PRESETS,
  GENERAL_FORMAT,
  formatPresetId,
  isExpressionFormat,
  normalizeFormatInput,
  presetValue,
  type FormatSelection,
} from '@/lib/textFormat';
import { ExpressionEditor } from './ExpressionEditor';

export interface FormatFieldProps {
  /** Formato vigente: cadena, `undefined` (General) o `'mixed'` (discrepan los runs). */
  value: FormatSelection;
  /** Nuevo formato; `null` vuelve a General (quitar el `<Format>`). */
  onChange: (format: string | null) => void;
  /** Etiqueta accesible del selector (el editor añade «: cadena o expresión»). */
  ariaLabel: string;
  /** Texto de hueco cuando no hay formato (solo el campo literal). */
  placeholder?: string;
  className?: string;
}

/**
 * Campo de formato (`<Format>`) en columna: **selector de presets** .NET arriba
 * y **editor** debajo — Monaco si el valor es una expresión de BC
 * (`=Fields!…`, con resaltado y autocompletado), campo simple si es una cadena
 * (`N2`, `#,##0.00;(#,##0.00)`). Los presets confirman al vuelo; el texto, con
 * Enter o al salir, y se envía **sin escapar** (comillas intactas). «Mixto»
 * solo aparece como valor vigente: elegir algo lo aplica a todo.
 */
export function FormatField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
}: FormatFieldProps): ReactNode {
  const t = useT();
  // Aviso común (el título del `<select>` y del editor).
  const formatTitle = t('toolbar.formatField.title');
  const fieldAriaLabel = t('toolbar.formatField.ariaLabel', { label: ariaLabel });
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Modo manual del selector mientras se teclea (`null` = sigue al valor). */
  const [manual, setManual] = useState<'custom' | 'expression' | null>(null);
  /** Texto local mientras el valor confirmado no ha vuelto del documento. */
  const [draft, setDraft] = useState<string | null>(null);
  /** El siguiente montaje de Monaco recibe el foco (acción del usuario). */
  const [focusEditor, setFocusEditor] = useState(false);
  /**
   * Último valor confirmado localmente: la proyección tarda en volver y el
   * mismo commit (p. ej. el blur del editor al desmontarse) no debe mandar el
   * comando dos veces (el undo solo desharía el duplicado).
   */
  const lastSentRef = useRef<string | null | undefined>(undefined);

  /** Valor confirmado (`'mixed'` no tiene un valor único). */
  const current = value === 'mixed' ? undefined : value;
  const text = draft ?? current ?? '';
  const expression = isExpressionFormat(text);
  const selected = manual ?? formatPresetId(value);

  // El borrador se suelta cuando el valor confirmado ya lo refleja: el cambio
  // de editor (literal ↔ Monaco) no parpadea durante el viaje de ida y vuelta.
  useEffect(() => {
    if (draft === null) return;
    if (normalizeFormatInput(draft) === (current ?? null)) setDraft(null);
  }, [draft, current]);

  // La petición de foco se consume en el mismo render que monta Monaco.
  useEffect(() => {
    if (focusEditor) setFocusEditor(false);
  }, [focusEditor]);

  // El valor confirmado volvió del documento: el próximo commit vuelve a
  // compararse contra él.
  useEffect(() => {
    lastSentRef.current = undefined;
  }, [value]);

  const focusInput = (): void => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  /** Solo se lanza el cambio si hay algo que cambiar (Mixto no tiene valor único). */
  const commitValue = (next: string | null): void => {
    if (lastSentRef.current === next) return;
    if (value !== 'mixed' && next === (current ?? null)) return;
    lastSentRef.current = next;
    onChange(next);
  };

  /** Commit del editor (Enter o pérdida de foco). */
  const commitEditor = (raw: string): void => {
    const next = normalizeFormatInput(raw);
    commitValue(next);
    setManual(null);
    // El texto confirmado queda de borrador hasta que la proyección lo
    // devuelva: así no se salta del editor al campo literal y vuelta.
    setDraft(next ?? '');
  };

  /** Commit del campo literal: un `=…` confirmado pasa a editarse con Monaco. */
  const commitDraft = (): void => {
    if (draft === null) return;
    const next = normalizeFormatInput(draft);
    commitValue(next);
    if (next !== null && isExpressionFormat(next)) {
      setManual('expression');
      setFocusEditor(true);
    } else {
      setManual(null);
    }
  };

  const changeSelection = (id: string): void => {
    if (id === 'general') {
      setDraft(null);
      setManual(null);
      commitValue(GENERAL_FORMAT);
      return;
    }
    const preset = presetValue(id);
    if (preset !== undefined) {
      setDraft(null);
      setManual(null);
      commitValue(preset);
      return;
    }
    // Personalizado… / Expresión…: se edita en el editor sin confirmar.
    if (id === 'expression') {
      setManual('expression');
      setDraft(isExpressionFormat(text) ? text : `=${text}`);
      setFocusEditor(true);
      return;
    }
    setManual('custom');
    // El campo literal no edita expresiones: si el valor vigente lo es, se
    // parte de vacío.
    setDraft(current !== undefined && !isExpressionFormat(current) ? current : '');
    focusInput();
  };

  return (
    <div data-rdlc-format-field="" className={cn('flex flex-col gap-1.5', className)}>
      <select
        className="h-7 w-full rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
        value={selected}
        aria-label={ariaLabel}
        title={formatTitle}
        onChange={(event) => changeSelection(event.target.value)}
      >
        {value === 'mixed' ? (
          <option value="mixed" disabled>
            {t('toolbar.formatField.mixed')}
          </option>
        ) : null}
        <option value="general">{t('toolbar.formatField.generalNoFormat')}</option>
        {FORMAT_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {t(preset.labelKey)}
          </option>
        ))}
        <option value="custom">{t('toolbar.formatField.custom')}</option>
        <option value="expression">{t('toolbar.formatField.expression')}</option>
      </select>

      {expression ? (
        <div data-rdlc-format-expression="">
          <ExpressionEditor
            value={text}
            mode="expression"
            ariaLabel={fieldAriaLabel}
            autoFocus={focusEditor}
            onCommit={commitEditor}
          />
        </div>
      ) : (
        <Input
          ref={inputRef}
          data-rdlc-format-literal=""
          className="h-7 border-input px-1 font-mono text-xs"
          value={text}
          placeholder={placeholder ?? t('toolbar.formatField.general')}
          aria-label={fieldAriaLabel}
          title={formatTitle}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft();
            if (event.key === 'Escape') {
              setDraft(null);
              setManual(null);
            }
          }}
        />
      )}
    </div>
  );
}
