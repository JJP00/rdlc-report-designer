import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@rdlc-designer/i18n/react';
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
import { ExpressionEditor, type ExpressionEditorHandle } from './ExpressionEditor';

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
 * y **editor** Monaco debajo, para la cadena (`N2`, `#,##0.00;(#,##0.00)`) y
 * para la expresión de BC (`=Fields!…`, con resaltado y autocompletado): el `=`
 * no cambia de editor. Los presets confirman al vuelo; el texto, con Enter o al
 * salir, y se envía **sin escapar** (comillas intactas); Escape lo descarta.
 * «Mixto» solo aparece como valor vigente: elegir algo lo aplica a todo.
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
  const editorRef = useRef<ExpressionEditorHandle | null>(null);
  /** Modo manual del selector mientras se teclea (`null` = sigue al valor). */
  const [manual, setManual] = useState<'custom' | 'expression' | null>(null);
  /** Texto local mientras el valor confirmado no ha vuelto del documento. */
  const [draft, setDraft] = useState<string | null>(null);
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

  // El borrador se suelta cuando el valor confirmado ya lo refleja: el editor
  // no vuelve al valor anterior durante el viaje de ida y vuelta.
  useEffect(() => {
    if (draft === null) return;
    if (normalizeFormatInput(draft) === (current ?? null)) setDraft(null);
  }, [draft, current]);

  // El valor confirmado volvió del documento: el próximo commit vuelve a
  // compararse contra él.
  useEffect(() => {
    lastSentRef.current = undefined;
  }, [value]);

  /** Foco al editor tras el render que le pasa el borrador nuevo. */
  const focusEditor = (caret: 'all' | 'end'): void => {
    requestAnimationFrame(() => editorRef.current?.focus(caret));
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
    // Entrar y salir sin tocar nada no confirma: con «Mixto» el editor vacío
    // pondría todos los runs en General.
    if (draft === null && raw === text) return;
    const next = normalizeFormatInput(raw);
    commitValue(next);
    setManual(null);
    // El texto confirmado queda de borrador hasta que la proyección lo
    // devuelva: así el editor no vuelve un instante al valor anterior.
    setDraft(next ?? '');
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
      focusEditor('end');
      return;
    }
    setManual('custom');
    // Una cadena parte del valor vigente; si es una expresión, de vacío.
    setDraft(current !== undefined && !isExpressionFormat(current) ? current : '');
    focusEditor('all');
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

      {/* Un solo editor: los atributos dicen qué contiene (cadena o expresión). */}
      <div
        title={formatTitle}
        data-rdlc-format-expression={expression ? '' : undefined}
        data-rdlc-format-literal={expression ? undefined : ''}
      >
        <ExpressionEditor
          ref={editorRef}
          value={text}
          mode="expression"
          ariaLabel={fieldAriaLabel}
          placeholder={placeholder ?? t('toolbar.formatField.general')}
          onCommit={commitEditor}
          onCancel={() => {
            setDraft(null);
            setManual(null);
          }}
        />
      </div>
    </div>
  );
}
