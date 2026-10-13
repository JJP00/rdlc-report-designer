import type { RdlcCommand, ReportMetaDto, TablixMemberDto } from '@rdlc-designer/contracts';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResizableDialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  groupPropertiesCommands,
  groupPropertiesDraft,
  isGroupPropertiesValid,
  newExpressionDraft,
  newSortDraft,
  variableForExpression,
  type GroupPageBreakDraft,
  type GroupPropertiesDraft,
  type GroupSortDraft,
} from '@/lib/groupProperties';
import { variableEntries, type VariableEntry } from '@/lib/variables';
import { ExpressionDialog } from './ExpressionDialog';

/**
 * «Propiedades del grupo» (F2.b.2), como el diálogo de Report Builder pero
 * limitado a lo que edita el diseñador: **General** (nombre + expresiones con
 * desplegable de variables y `fx`), **Saltos de página**, **Ordenación** y
 * **Visibilidad** (mostrar/ocultar + expresión, y `ToggleItem`).
 *
 * El formulario se monta al abrir y «Aplicar» manda **solo las secciones que
 * cambiaron** (cada una es un paso de undo). Marco redimensionable estándar
 * (BUG-63): cabecera y pie fijos, scroll en `DialogBody`.
 */
export interface GroupPropertiesDialogProps {
  tablixId: string;
  axis: 'row' | 'column';
  member: TablixMemberDto;
  meta: ReportMetaDto;
  /** Items del informe (para el desplegable del `ToggleItem`). */
  itemNames: string[];
  onApply: (commands: RdlcCommand[]) => void;
  onClose: () => void;
}

export function GroupPropertiesDialog({
  tablixId,
  axis,
  member,
  meta,
  itemNames,
  onApply,
  onClose,
}: GroupPropertiesDialogProps): ReactNode {
  const [initial] = useState(() => groupPropertiesDraft(member));
  const [draft, setDraft] = useState(initial);
  const variables = variableEntries(meta);
  const valid = isGroupPropertiesValid(draft);

  const apply = (): void => {
    onApply(groupPropertiesCommands(tablixId, axis, member.path, initial, draft));
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResizableDialogContent
        className="max-h-[90vh] max-w-3xl sm:max-w-3xl"
        onKeyDown={(event) => {
          // Ctrl+Intro = Aplicar (teclado completo en el diálogo).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && valid) {
            event.preventDefault();
            apply();
          }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Propiedades del grupo{member.name ? ` · ${member.name}` : ''}</DialogTitle>
          <DialogDescription>
            Expresiones, saltos de página, ordenación y visibilidad del grupo. «Aplicar» envía solo
            las secciones modificadas.
          </DialogDescription>
        </DialogHeader>

        <Tabs orientation="vertical" defaultValue="general" className="min-h-0 flex-1 gap-4">
          <TabsList className="shrink-0">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="breaks">Saltos de página</TabsTrigger>
            <TabsTrigger value="sorting">Ordenación</TabsTrigger>
            <TabsTrigger value="visibility">Visibilidad</TabsTrigger>
          </TabsList>
          <DialogBody className="pr-1">
            <TabsContent value="general">
              <GeneralTab member={member} variables={variables} draft={draft} setDraft={setDraft} />
            </TabsContent>
            <TabsContent value="breaks">
              <PageBreaksTab draft={draft} setDraft={setDraft} />
            </TabsContent>
            <TabsContent value="sorting">
              <SortingTab variables={variables} draft={draft} setDraft={setDraft} />
            </TabsContent>
            <TabsContent value="visibility">
              <VisibilityTab draft={draft} setDraft={setDraft} itemNames={itemNames} />
            </TabsContent>
          </DialogBody>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button title="Aplicar (Ctrl+Intro)" onClick={apply} disabled={!valid}>
            Aplicar
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}

interface TabProps {
  draft: GroupPropertiesDraft;
  setDraft: (update: (current: GroupPropertiesDraft) => GroupPropertiesDraft) => void;
}

function GeneralTab({
  variables,
  draft,
  setDraft,
}: TabProps & { member: TablixMemberDto; variables: VariableEntry[] }): ReactNode {
  const [fxIndex, setFxIndex] = useState<number | null>(null);

  const setExpression = (index: number, expression: string): void => {
    setDraft((current) => ({
      ...current,
      expressions: current.expressions.map((row, position) =>
        position === index ? { ...row, expression } : row,
      ),
    }));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label htmlFor="group-name">Nombre</Label>
        <Input
          id="group-name"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        />
        <p className="text-[11px] text-muted-foreground">
          Único en el informe. Renombrar el grupo <strong>no reescribe</strong> las expresiones de
          ámbito existentes (`Sum(…, "Grupo")`): revísalas si las usas.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Expresiones de grupo</Label>
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                expressions: [...current.expressions, newExpressionDraft('')],
              }))
            }
          >
            <Plus /> Añadir
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          La primera es «Group on»; las siguientes acotan más el grupo («And on»).
        </p>

        {draft.expressions.map((row, index) => (
          <div key={row.id} className="flex items-center gap-1">
            <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
              {index === 0 ? 'Group on' : 'And on'}
            </span>
            <VariableSelect
              variables={variables}
              value={row.expression}
              onChange={(next) => setExpression(index, next)}
              ariaLabel={
                index === 0 ? 'Expresión de grupo' : `Expresión de grupo adicional ${index}`
              }
            />
            <FxButton
              label={`Editar la expresión ${index + 1} con el editor`}
              onClick={() => setFxIndex(index)}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Eliminar la expresión ${index + 1}`}
              title="Eliminar esta expresión"
              disabled={draft.expressions.length <= 1}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  expressions: current.expressions.filter((_, position) => position !== index),
                }))
              }
              className="text-muted-foreground/70 hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      {fxIndex !== null ? (
        <ExpressionDialog
          title={`Expresión de grupo ${fxIndex + 1}`}
          value={draft.expressions[fxIndex]?.expression ?? ''}
          onClose={() => setFxIndex(null)}
          onApply={(value) => {
            setFxIndex(null);
            if (value.trim() !== '') setExpression(fxIndex, value);
          }}
        />
      ) : null}
    </div>
  );
}

function PageBreaksTab({ draft, setDraft }: TabProps): ReactNode {
  const toggle = (key: keyof GroupPageBreakDraft) => (checked: boolean) =>
    setDraft((current) => ({
      ...current,
      pageBreaks: { ...current.pageBreaks, [key]: checked },
    }));

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">
        Las opciones se escriben como `PageBreak → BreakLocation` del grupo.
      </legend>
      <CheckField
        id="break-between"
        label="Entre cada instancia del grupo"
        checked={draft.pageBreaks.between}
        onChange={toggle('between')}
      />
      <div className="ml-6 grid gap-3">
        <CheckField
          id="break-start"
          label="También al inicio del grupo"
          checked={draft.pageBreaks.start}
          onChange={toggle('start')}
        />
        <CheckField
          id="break-end"
          label="También al final del grupo"
          checked={draft.pageBreaks.end}
          onChange={toggle('end')}
        />
      </div>
    </fieldset>
  );
}

function SortingTab({
  variables,
  draft,
  setDraft,
}: TabProps & { variables: VariableEntry[] }): ReactNode {
  const [fxIndex, setFxIndex] = useState<number | null>(null);

  const update = (index: number, patch: Partial<GroupSortDraft>): void =>
    setDraft((current) => ({
      ...current,
      sorting: current.sorting.map((sort, position) =>
        position === index ? { ...sort, ...patch } : sort,
      ),
    }));

  const move = (index: number, delta: number): void =>
    setDraft((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.sorting.length) return current;
      const sorting = [...current.sorting];
      const [sort] = sorting.splice(index, 1);
      sorting.splice(target, 0, sort!);
      return { ...current, sorting };
    });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Columnas de ordenación</Label>
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              sorting: [...current.sorting, newSortDraft()],
            }))
          }
        >
          <Plus /> Añadir
        </Button>
      </div>

      {draft.sorting.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sin ordenación: el grupo respeta el orden del dataset.
        </p>
      ) : null}

      {draft.sorting.map((sort, index) => (
        <div key={sort.id} className="flex items-center gap-1">
          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
            {index === 0 ? 'Ordenar por' : 'Y por'}
          </span>
          <VariableSelect
            variables={variables}
            value={sort.expression}
            onChange={(expression) => update(index, { expression })}
            ariaLabel={`Expresión de ordenación ${index + 1}`}
          />
          <select
            aria-label={`Dirección de la ordenación ${index + 1}`}
            value={sort.direction}
            onChange={(event) =>
              update(index, { direction: event.target.value as GroupSortDraft['direction'] })
            }
            className="h-7 shrink-0 rounded-md border bg-background px-1 text-xs"
          >
            <option value="Ascending">A → Z</option>
            <option value="Descending">Z → A</option>
          </select>
          <FxButton
            label={`Editar la ordenación ${index + 1} con el editor`}
            onClick={() => setFxIndex(index)}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Subir la ordenación ${index + 1}`}
            title="Subir"
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Bajar la ordenación ${index + 1}`}
            title="Bajar"
            disabled={index === draft.sorting.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Eliminar la ordenación ${index + 1}`}
            title="Eliminar"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                sorting: current.sorting.filter((_, position) => position !== index),
              }))
            }
            className="text-muted-foreground/70 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      {fxIndex !== null ? (
        <ExpressionDialog
          title={`Ordenación ${fxIndex + 1}`}
          value={draft.sorting[fxIndex]?.expression ?? ''}
          onClose={() => setFxIndex(null)}
          onApply={(value) => {
            setFxIndex(null);
            if (value.trim() !== '') update(fxIndex, { expression: value });
          }}
        />
      ) : null}
    </div>
  );
}

function VisibilityTab({
  draft,
  setDraft,
  itemNames,
}: TabProps & { itemNames: string[] }): ReactNode {
  const [fxOpen, setFxOpen] = useState(false);
  const mode = draft.hidden === null ? 'show' : draft.hidden === true ? 'hide' : 'expression';

  const setMode = (next: 'show' | 'hide' | 'expression'): void =>
    setDraft((current) => ({
      ...current,
      hidden:
        next === 'show'
          ? null
          : next === 'hide'
            ? true
            : typeof current.hidden === 'string'
              ? current.hidden
              : '=',
    }));

  const toggleItem = draft.toggleItem;

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">
          Cuando el informe se ejecuta por primera vez
        </legend>
        <RadioField
          name="group-visibility"
          value="show"
          label="Mostrar"
          checked={mode === 'show'}
          onChange={() => setMode('show')}
        />
        <RadioField
          name="group-visibility"
          value="hide"
          label="Ocultar"
          checked={mode === 'hide'}
          onChange={() => setMode('hide')}
        />
        <div className="flex items-center gap-1">
          <RadioField
            name="group-visibility"
            value="expression"
            label="Mostrar u ocultar según una expresión"
            checked={mode === 'expression'}
            onChange={() => setMode('expression')}
          />
          <FxButton label="Editar la expresión de visibilidad" onClick={() => setFxOpen(true)} />
        </div>
        {typeof draft.hidden === 'string' && draft.hidden !== '=' ? (
          <code className="ml-6 truncate text-[11px] text-muted-foreground">{draft.hidden}</code>
        ) : null}
      </fieldset>

      <div className="grid gap-1">
        <CheckField
          id="toggle-item"
          label="La visibilidad se puede alternar con este elemento del informe"
          checked={toggleItem !== null}
          onChange={(checked) =>
            setDraft((current) => ({
              ...current,
              toggleItem: checked ? (current.toggleItem ?? itemNames[0] ?? '') : null,
            }))
          }
        />
        <select
          aria-label="Elemento que alterna la visibilidad"
          value={toggleItem ?? ''}
          disabled={toggleItem === null}
          onChange={(event) =>
            setDraft((current) => ({ ...current, toggleItem: event.target.value }))
          }
          className="ml-6 h-7 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
        >
          <option value="" disabled>
            — elegir elemento —
          </option>
          {itemNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {fxOpen ? (
        <ExpressionDialog
          title={`Visibilidad del grupo${draft.toggleItem ? ` ${draft.toggleItem}` : ''}`}
          value={typeof draft.hidden === 'string' && draft.hidden !== '=' ? draft.hidden : ''}
          onClose={() => setFxOpen(false)}
          onApply={(value) => {
            setFxOpen(false);
            if (value.trim() !== '' && value.trim() !== '=') {
              setDraft((current) => ({ ...current, hidden: value }));
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** Desplegable de variables del informe + opción de expresión personalizada. */
function VariableSelect({
  variables,
  value,
  onChange,
  ariaLabel,
}: {
  variables: VariableEntry[];
  value: string;
  onChange: (expression: string) => void;
  ariaLabel: string;
}): ReactNode {
  const known = variableForExpression(variables, value);
  const groups = [...new Set(variables.map((variable) => variable.group))];

  return (
    <select
      aria-label={ariaLabel}
      value={known?.expression ?? ''}
      title={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
    >
      <option value="" disabled>
        {value.trim() === '' ? '— elegir variable —' : 'Expresión personalizada (fx)…'}
      </option>
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {variables
            .filter((variable) => variable.group === group)
            .map((variable) => (
              <option key={variable.expression} value={variable.expression}>
                {variable.name}
                {variable.detail ? ` (${variable.detail})` : ''}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Botón `fx` (editor Monaco de expresiones). */
function FxButton({ label, onClick }: { label: string; onClick: () => void }): ReactNode {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title="Editar con el editor de expresiones…"
      onClick={onClick}
      className="text-muted-foreground/70 hover:text-foreground"
    >
      <span className="text-[11px] font-semibold italic leading-none">fx</span>
    </Button>
  );
}

function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  );
}

function RadioField({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <input
        id={`${name}-${value}`}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <Label htmlFor={`${name}-${value}`} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  );
}
