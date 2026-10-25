import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandSchema, type CommandResult, type RdlcCommand } from '@rdlc-designer/contracts';
import { z } from 'zod';
import type { DomainError } from '../shared/domainError.js';
import { UnexpectedError } from '../shared/domainError.js';
import { describeError } from '../shared/describeError.js';
import { createTranslator } from '@rdlc-designer/i18n';
import type { Either } from '../shared/either.js';
import type { HeadlessContext } from './headlessContext.js';
import { buildMatcher, describeReport, findInReport, findItem, outlineOf } from './outline.js';

/**
 * Herramientas MCP sobre los casos de uso de la app. Capa fina, como el
 * `IpcController`: validar → llamar al servicio → mapear el resultado/error.
 * No contiene lógica de edición: todo cambio pasa por el catálogo de comandos
 * del dominio (con su undo, su normalización y su validación de esquema).
 */

export const SERVER_INSTRUCTIONS = [
  'Edits Business Central RDLC / RDL (2016) report layouts through the same engine as the RDLC Report Designer app.',
  'Workflow: rdlc_open (or rdlc_create) → rdlc_get_outline / rdlc_get_item / rdlc_find to inspect → rdlc_apply_commands to edit → rdlc_save.',
  'Prefer these tools over reading, grepping or hand-editing the .rdlc XML: they validate, keep undo and never write an invalid report. To locate a text, expression, group or id use rdlc_find (not grep); to change anything a command covers use rdlc_apply_commands (not Edit on the XML).',
  'Before deciding something cannot be done here, check rdlc_list_commands. Only if NO command or tool covers the action may you edit the file directly; then say so, and afterwards call rdlc_open on the same path again (or rdlc_reload) so the session sees the change.',
  'Which command for what: text/expression of a textbox → setText (id, p, r, value); the designer label of a run → setRunLabel; paragraphs as a whole → setParagraphs; Hidden/visibility of an item (literal or expression) → setVisibility; of a tablix group → setMemberVisibility / setMemberToggleItem; position/size → setLocation / setSize / setBounds; style (font, colour, alignment, borders) → setStyle; the report <Code> VB block → setReportCode (read it with rdlc_get_report includeCode); page, margins, header/footer → setPageSize / setPageMargins / setRegionHeight / setRegionPresent; add/remove items → insertItem / deleteItem / duplicateItem; tablix rows, columns, groups, filters and sorting → the addRow/addColumn/…/setGroupExpression/setTablixFilters/setGroupSorting family.',
  'Edits live in memory until rdlc_save; unsaved sessions are lost when the server stops.',
  'Items are addressed by their RDL `Name` (the `id`). Lengths are {"value": number, "unit": "cm"|"mm"|"in"|"pt"}.',
  'Positions (top/left) are relative to the containing region, rectangle or tablix cell.',
  'Call rdlc_list_commands to see the command catalog; pass `names` to get the exact JSON Schema of the ones you need.',
  'Long expressions are shortened in rdlc_get_outline ("…[+N chars]"): read the full text with rdlc_get_item before editing it.',
  'If the .rdlc was regenerated on disk (e.g. after compiling the AL), call rdlc_open on the same path again: a session without unsaved edits is re-read from disk; otherwise use rdlc_reload (discards unsaved edits).',
  'Saving validates against the official RDL 2016 schema and refuses to write an invalid report.',
  'Dataset fields and parameters are read-only here. In Business Central they come from the AL report dataset: add the column in AL, compile, and the .rdlc is regenerated with the new field (then re-open it here). Expressions can reference the fields listed by rdlc_get_report (e.g. =Fields!No.Value).',
].join('\n');

const MAX_COMMANDS_PER_CALL = 200;
const DEFAULT_OUTLINE_LINES = 400;
const DEFAULT_FIND_RESULTS = 50;
const REPORT_EXTENSION = /\.(rdlc|rdl)$/i;

/* ----------------------------- Respuestas -------------------------------- */

interface ToolReply {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const text = (body: string, isError = false): ToolReply => ({
  content: [{ type: 'text', text: body }],
  ...(isError ? { isError: true } : {}),
});

function toolError(code: string, message: string, extra: Record<string, unknown> = {}): ToolReply {
  return text(JSON.stringify({ ok: false, code, message, ...extra }), true);
}

/**
 * El MCP mantiene **inglés estable** para agentes (decisión de
 * `docs/features/0005-i18n.md`): los avisos del dominio se componen con el
 * catálogo EN, nunca con el idioma del usuario.
 */
const tEn = createTranslator('en');

function warningText(reason: string): string | undefined {
  return tEn.tUnsafe(`native.saveWarnings.${reason}`);
}

function domainError(error: DomainError): ToolReply {
  return toolError(
    error.code,
    describeError(error),
    error.data === undefined ? {} : { data: error.data },
  );
}

/* --------------------- Catálogo de comandos (JSON Schema) ---------------- */

interface CommandEntry {
  name: string;
  schema: Record<string, unknown>;
  /** `setText(id, p, r, value)`: campos obligatorios y [opcionales]. */
  signature: string;
}

let commandCatalog: CommandEntry[] | undefined;

function loadCommandCatalog(): CommandEntry[] {
  if (commandCatalog) return commandCatalog;
  commandCatalog = commandSchema.options.map((option) => {
    const name = option.shape.cmd.value;
    const schema = z.toJSONSchema(option, { target: 'draft-7', io: 'input' }) as Record<
      string,
      unknown
    >;
    delete schema['$schema'];
    const properties = Object.keys((schema['properties'] as Record<string, unknown>) ?? {}).filter(
      (key) => key !== 'cmd',
    );
    const required = new Set((schema['required'] as string[] | undefined) ?? []);
    const fields = properties.map((key) => (required.has(key) ? key : `[${key}]`));
    return { name, schema, signature: `${name}(${fields.join(', ')})` };
  });
  return commandCatalog;
}

/* ------------------------------ Registro --------------------------------- */

export function registerRdlcTools(server: McpServer, ctx: HeadlessContext): void {
  const { sessions, commands, events } = ctx;

  /** Rutas abiertas → sesión, para no abrir dos veces el mismo fichero. */
  const openPaths = new Map<string, string>();
  const pathKey = (path: string): string =>
    process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  const forgetSession = (sessionId: string): void => {
    for (const [key, id] of openPaths) if (id === sessionId) openPaths.delete(key);
    events.forget(sessionId);
  };

  /** Cierra el paso: respuesta de éxito con los avisos pendientes de la sesión. */
  const reply = (data: Record<string, unknown>, sessionId?: string): ToolReply => {
    const notices = sessionId ? events.drain(sessionId) : [];
    return text(JSON.stringify(notices.length > 0 ? { ...data, notices } : data));
  };

  /** Ninguna excepción cruza al cliente sin forma de error (como `IpcController.handle`). */
  const guard =
    <Args>(run: (args: Args) => Promise<ToolReply> | ToolReply) =>
    async (args: Args): Promise<ToolReply> => {
      try {
        return await run(args);
      } catch (error) {
        return domainError(UnexpectedError.create(error));
      }
    };

  const unwrap = <T>(result: Either<DomainError, T>): { value: T } | { reply: ToolReply } =>
    result.isRight() ? { value: result.value } : { reply: domainError(result.value) };

  const checkReportPath = (path: string): ToolReply | undefined =>
    REPORT_EXTENSION.test(path)
      ? undefined
      : toolError('E_INVALID_PATH', `Only .rdlc / .rdl files are allowed: ${path}`);

  const sessionId = z.string().min(1).describe('Session id returned by rdlc_open / rdlc_create');

  /* ---------------------------- Ciclo de vida ----------------------------- */

  server.registerTool(
    'rdlc_open',
    {
      title: 'Open a report',
      description:
        'Opens an existing .rdlc/.rdl file and returns a sessionId plus a report summary (page, regions, item counts, dataset fields, parameters). ' +
        'Opening a file that is already open returns the existing session.',
      inputSchema: { path: z.string().min(1).describe('Absolute path to the .rdlc/.rdl file') },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guard(async ({ path }) => {
      const bad = checkReportPath(path);
      if (bad) return bad;

      const existing = openPaths.get(pathKey(path));
      if (existing) {
        // Abrir de nuevo es la forma natural de pedir «el estado actual del disco»
        // (p. ej. tras recompilar el AL, que regenera el .rdlc): sin ediciones
        // sin guardar es seguro releerlo; con ellas no se pisa nada.
        const dirty = sessions.listSessions().find((s) => s.sessionId === existing)?.dirty ?? true;
        let refreshed = false;
        if (!dirty) {
          const reloaded = await sessions.reload(existing);
          if (reloaded.isRight()) {
            commands.drop(existing);
            refreshed = true;
          }
        }
        const projection = unwrap(sessions.projectionOf(existing));
        if ('value' in projection) {
          return reply(
            {
              ok: true,
              alreadyOpen: true,
              refreshedFromDisk: refreshed,
              ...(dirty
                ? {
                    unsavedChanges: true,
                    note: 'Session has unsaved edits, so it was NOT re-read from disk. Use rdlc_reload to discard them and pick up the disk version.',
                  }
                : {}),
              sessionId: existing,
              report: describeReport(projection.value),
            },
            existing,
          );
        }
        openPaths.delete(pathKey(path)); // sesión huérfana: se vuelve a abrir
      }

      const opened = unwrap(await sessions.open(resolve(path)));
      if ('reply' in opened) return opened.reply;
      openPaths.set(pathKey(path), opened.value.sessionId);
      return reply({
        ok: true,
        sessionId: opened.value.sessionId,
        filePath: resolve(path),
        ...(opened.value.warnings?.length ? { schemaWarnings: opened.value.warnings } : {}),
        report: describeReport(opened.value.projection),
      });
    }),
  );

  server.registerTool(
    'rdlc_create',
    {
      title: 'Create a blank report',
      description:
        'Writes a blank RDLC template to `path` and opens it as a new session. Refuses to overwrite an existing file unless `overwrite` is true.',
      inputSchema: {
        path: z.string().min(1).describe('Absolute path of the new .rdlc/.rdl file'),
        overwrite: z.boolean().optional().describe('Replace the file if it already exists'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guard(async ({ path, overwrite }) => {
      const bad = checkReportPath(path);
      if (bad) return bad;
      if (openPaths.has(pathKey(path))) {
        return toolError(
          'E_COMMAND_REJECTED',
          `Already open in this server: ${path}. Close it first.`,
        );
      }
      if (existsSync(path) && overwrite !== true) {
        return toolError(
          'E_COMMAND_REJECTED',
          `File already exists: ${path} (pass overwrite: true to replace it)`,
        );
      }
      const created = unwrap(await sessions.createNew(resolve(path)));
      if ('reply' in created) return created.reply;
      openPaths.set(pathKey(path), created.value.sessionId);
      return reply({
        ok: true,
        sessionId: created.value.sessionId,
        filePath: resolve(path),
        report: describeReport(created.value.projection),
      });
    }),
  );

  server.registerTool(
    'rdlc_list_sessions',
    {
      title: 'List open sessions',
      description:
        'Lists the sessions open in this server with their file, dirty flag and version.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(() =>
      reply({
        ok: true,
        sessions: sessions.listSessions().map((s) => ({
          sessionId: s.sessionId,
          filePath: s.filePath,
          dirty: s.dirty,
          missing: s.missing,
          version: s.projection.version,
        })),
      }),
    ),
  );

  server.registerTool(
    'rdlc_save',
    {
      title: 'Save the report',
      description:
        'Writes the session to its file. Validates against the RDL 2016 schema first and refuses an invalid report (E_VALIDATION, with the problems). ' +
        'Fails with E_CONFLICT if the file changed on disk since it was opened; then use rdlc_reload or rdlc_save_as.',
      inputSchema: { sessionId },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guard(async ({ sessionId: id }) => {
      const saved = unwrap(await sessions.save(id));
      if ('reply' in saved) return saved.reply;
      return reply(
        {
          ok: true,
          path: saved.value.path,
          bytesIdentical: saved.value.bytesIdentical,
          ...(saved.value.warningReason ? { warning: warningText(saved.value.warningReason) } : {}),
        },
        id,
      );
    }),
  );

  server.registerTool(
    'rdlc_save_as',
    {
      title: 'Save the report to another path',
      description:
        'Saves a copy to `path`; the session then points at the new file. Refuses to overwrite an existing file unless `overwrite` is true.',
      inputSchema: {
        sessionId,
        path: z.string().min(1).describe('Absolute path of the target .rdlc/.rdl file'),
        overwrite: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guard(async ({ sessionId: id, path, overwrite }) => {
      const bad = checkReportPath(path);
      if (bad) return bad;
      const taken = openPaths.get(pathKey(path));
      if (taken && taken !== id) {
        return toolError(
          'E_COMMAND_REJECTED',
          `Another session already has that file open: ${path}`,
        );
      }
      if (existsSync(path) && overwrite !== true && !taken) {
        return toolError(
          'E_COMMAND_REJECTED',
          `File already exists: ${path} (pass overwrite: true to replace it)`,
        );
      }
      const saved = unwrap(await sessions.saveAs(id, resolve(path)));
      if ('reply' in saved) return saved.reply;
      for (const [key, owner] of openPaths) if (owner === id) openPaths.delete(key);
      openPaths.set(pathKey(path), id);
      return reply(
        {
          ok: true,
          path: saved.value.path,
          ...(saved.value.warningReason ? { warning: warningText(saved.value.warningReason) } : {}),
        },
        id,
      );
    }),
  );

  server.registerTool(
    'rdlc_reload',
    {
      title: 'Reload from disk',
      description:
        'Re-reads the file from disk and DISCARDS every unsaved edit and the undo history of the session. Use it to resolve an E_CONFLICT.',
      inputSchema: { sessionId },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guard(async ({ sessionId: id }) => {
      const reloaded = unwrap(await sessions.reload(id));
      if ('reply' in reloaded) return reloaded.reply;
      commands.drop(id);
      return reply(
        {
          ok: true,
          ...(reloaded.value.warnings?.length ? { schemaWarnings: reloaded.value.warnings } : {}),
          report: describeReport(reloaded.value.projection),
        },
        id,
      );
    }),
  );

  server.registerTool(
    'rdlc_close',
    {
      title: 'Close a session',
      description:
        'Closes the session. If it has unsaved changes it refuses (E_DIRTY) unless `force` is true, which discards them.',
      inputSchema: { sessionId, force: z.boolean().optional().describe('Discard unsaved changes') },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guard(async ({ sessionId: id, force }) => {
      const closed = unwrap(await sessions.close(id, { force: force === true }));
      if ('reply' in closed) return closed.reply;
      if (!closed.value.closed) {
        return toolError(
          'E_DIRTY',
          'The session has unsaved changes: call rdlc_save, or rdlc_close with force: true to discard them.',
        );
      }
      commands.drop(id);
      forgetSession(id);
      return reply({ ok: true });
    }),
  );

  /* ------------------------------- Lectura -------------------------------- */

  server.registerTool(
    'rdlc_get_report',
    {
      title: 'Report summary',
      description:
        'Page size and margins, region heights, item counts per kind, dataset fields, parameters, embedded images, and whether the report has custom VB code. Pass `includeCode` to also get the <Code> block.',
      inputSchema: { sessionId, includeCode: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ sessionId: id, includeCode }) => {
      const projection = unwrap(sessions.projectionOf(id));
      if ('reply' in projection) return projection.reply;
      return reply(
        {
          ok: true,
          ...describeReport(projection.value),
          ...(includeCode ? { code: projection.value.meta.code.text } : {}),
        },
        id,
      );
    }),
  );

  server.registerTool(
    'rdlc_get_outline',
    {
      title: 'Report outline',
      description:
        'Compact text map of the layout: one line per item with kind, id, position/size, and a text preview; tablixes list their columns/rows, row/column groups (with member paths) and cell contents. ' +
        'Long texts and expressions are shortened to ~60 chars and marked "…[+N chars]": use rdlc_get_item for the full text. ' +
        'Narrow it with `region` or `id` on large reports. To locate a text, expression or name, use rdlc_find instead of scanning the outline.',
      inputSchema: {
        sessionId,
        region: z.enum(['pageHeader', 'body', 'pageFooter']).optional(),
        id: z.string().min(1).optional().describe('Outline only this item and its subtree'),
        fullText: z
          .boolean()
          .optional()
          .describe('Do not shorten long texts/expressions (more tokens; prefer rdlc_get_item)'),
        maxLines: z
          .number()
          .int()
          .min(20)
          .max(2000)
          .optional()
          .describe(`Default ${DEFAULT_OUTLINE_LINES}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ sessionId: id, region, id: itemId, maxLines, fullText }) => {
      const projection = unwrap(sessions.projectionOf(id));
      if ('reply' in projection) return projection.reply;
      const outline = outlineOf(projection.value, {
        ...(region ? { region } : {}),
        ...(itemId !== undefined ? { id: itemId } : {}),
        maxLines: maxLines ?? DEFAULT_OUTLINE_LINES,
        ...(fullText ? { fullText } : {}),
      });
      if (outline === undefined) return toolError('E_NOT_FOUND', `No item named "${itemId}"`);
      const notices = events.drain(id);
      return text(notices.length ? `${outline}\n\nNOTICES:\n- ${notices.join('\n- ')}` : outline);
    }),
  );

  server.registerTool(
    'rdlc_get_item',
    {
      title: 'Get one item',
      description:
        'Full JSON of one item by id: geometry, style, paragraphs/runs for textboxes, body/hierarchies/filters for tablixes, children for rectangles.',
      inputSchema: { sessionId, id: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ sessionId: id, id: itemId }) => {
      const projection = unwrap(sessions.projectionOf(id));
      if ('reply' in projection) return projection.reply;
      const item = findItem(projection.value, itemId);
      if (!item) return toolError('E_NOT_FOUND', `No item named "${itemId}"`);
      return reply({ ok: true, item }, id);
    }),
  );

  server.registerTool(
    'rdlc_find',
    {
      title: 'Find text in the report',
      description:
        'The replacement for grep on the .rdlc: finds `query` in item ids, textbox texts and run labels, Hidden/visibility expressions, image values, tablix group expressions/names/sorting/filters and the report <Code> block. ' +
        'Each hit gives the item `id`, its `region`, `where` inside it (e.g. "text p0.r1" = paragraph 0, run 1, ready for setText; "rowGroup[0].expression"; "line 12" for <Code>) and the text (whole if short, else a window around the match; rdlc_get_item gives it in full). ' +
        'Case-insensitive substring by default; `regex` treats `query` as a regular expression.',
      inputSchema: {
        sessionId,
        query: z.string().min(1).describe('Text to look for (or a regex with `regex: true`)'),
        regex: z.boolean().optional(),
        caseSensitive: z.boolean().optional(),
        region: z
          .enum(['pageHeader', 'body', 'pageFooter'])
          .optional()
          .describe('Limit to one region (also skips the <Code> block)'),
        maxResults: z.number().int().min(1).max(500).optional().describe('Default 50'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ sessionId: id, query, regex, caseSensitive, region, maxResults }) => {
      const projection = unwrap(sessions.projectionOf(id));
      if ('reply' in projection) return projection.reply;
      let matcher: RegExp;
      try {
        matcher = buildMatcher(query, {
          ...(regex === undefined ? {} : { regex }),
          ...(caseSensitive === undefined ? {} : { caseSensitive }),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return toolError('E_INVALID_QUERY', `Invalid regular expression: ${reason}`);
      }
      const found = findInReport(projection.value, matcher, {
        ...(region ? { region } : {}),
        maxResults: maxResults ?? DEFAULT_FIND_RESULTS,
      });
      return reply(
        {
          ok: true,
          total: found.total,
          ...(found.total > found.hits.length
            ? {
                truncated: `Showing ${found.hits.length} of ${found.total}: narrow the query or pass region/maxResults.`,
              }
            : {}),
          hits: found.hits,
        },
        id,
      );
    }),
  );

  /* ------------------------------- Edición -------------------------------- */

  server.registerTool(
    'rdlc_list_commands',
    {
      title: 'Command catalog',
      description:
        'Without `names`: every editing command as a one-line signature (required fields, [optional fields]). ' +
        'With `names`: the exact JSON Schema of those commands, to build valid input for rdlc_apply_commands.',
      inputSchema: { names: z.array(z.string()).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(({ names }) => {
      const catalog = loadCommandCatalog();
      if (!names || names.length === 0) {
        return text(JSON.stringify({ ok: true, commands: catalog.map((c) => c.signature) }));
      }
      const unknown = names.filter((name) => !catalog.some((c) => c.name === name));
      if (unknown.length > 0) {
        return toolError('E_INVALID_COMMAND', `Unknown command(s): ${unknown.join(', ')}`, {
          known: catalog.map((c) => c.name),
        });
      }
      return text(
        JSON.stringify({
          ok: true,
          schemas: catalog.filter((c) => names.includes(c.name)).map((c) => c.schema),
        }),
      );
    }),
  );

  server.registerTool(
    'rdlc_apply_commands',
    {
      title: 'Apply editing commands',
      description:
        'Applies editing commands in order. Every command is validated BEFORE any is applied, so a malformed command changes nothing. ' +
        'With `atomic` (default true), if a command is rejected the ones already applied are undone and the report is left as it was. ' +
        'Each command is an object with a `cmd` discriminator, e.g. {"cmd":"setText","id":"Title","p":0,"r":0,"value":"Hello"}; see rdlc_list_commands. ' +
        'The result lists the ids created by insert/duplicate commands.',
      inputSchema: {
        sessionId,
        commands: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .max(MAX_COMMANDS_PER_CALL)
          .describe('Commands in execution order'),
        atomic: z
          .boolean()
          .optional()
          .describe('Undo the applied commands if one fails (default true)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guard(({ sessionId: id, commands: raw, atomic }) => {
      // 1) Validar todo antes de tocar nada.
      const parsed: RdlcCommand[] = [];
      for (const [index, candidate] of raw.entries()) {
        const result = commandSchema.safeParse(candidate);
        if (!result.success) {
          return toolError(
            'E_INVALID_COMMAND',
            `Command #${index} is invalid; nothing was applied.`,
            {
              failedIndex: index,
              issues: result.error.issues.map(
                (issue) => `${issue.path.join('.') || '(command)'}: ${issue.message}`,
              ),
            },
          );
        }
        parsed.push(result.data);
      }

      // 2) Aplicar en orden (síncrono: ningún otro comando se intercala).
      const results: Record<string, unknown>[] = [];
      let version: number | undefined;
      for (const [index, command] of parsed.entries()) {
        const outcome = commands.execute(id, command);
        if (outcome.isLeft()) {
          const rolledBack = atomic !== false ? rollBack(id, results.length) : undefined;
          return toolError(outcome.value.code, describeError(outcome.value), {
            failedIndex: index,
            failedCommand: command.cmd,
            appliedBeforeFailure: results.length,
            ...(rolledBack === undefined ? {} : { rolledBack }),
            ...(outcome.value.data === undefined ? {} : { data: outcome.value.data }),
          });
        }
        const done: CommandResult = outcome.value;
        if (!done.ok)
          return toolError(done.code, done.message ?? 'Command rejected', { failedIndex: index });
        version = done.version ?? version;
        results.push({
          index,
          cmd: command.cmd,
          ...(done.id !== undefined ? { id: done.id } : {}),
          ...(done.ids !== undefined ? { ids: done.ids } : {}),
          ...(done.applied !== undefined ? { applied: done.applied } : {}),
        });
      }
      return reply({ ok: true, applied: results.length, version, results }, id);
    }),
  );

  /** Deshace los `count` comandos ya aplicados (modo atómico). */
  const rollBack = (id: string, count: number): boolean => {
    for (let i = 0; i < count; i += 1) {
      const undone = commands.undo(id);
      if (undone.isLeft() || !undone.value.ok) return false;
    }
    return true;
  };

  for (const [name, title, description, step] of [
    [
      'rdlc_undo',
      'Undo',
      'Undoes the last applied command (or batch). Returns the new version; `changed: false` means there was nothing to undo.',
      commands.undo.bind(commands),
    ],
    [
      'rdlc_redo',
      'Redo',
      'Redoes the last undone command. `changed: false` means there was nothing to redo.',
      commands.redo.bind(commands),
    ],
  ] as const) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: { sessionId },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      guard(({ sessionId: id }) => {
        const versionBefore = sessions.versionOf(id);
        const outcome = unwrap(step(id));
        if ('reply' in outcome) return outcome.reply;
        if (!outcome.value.ok) {
          return toolError(outcome.value.code, outcome.value.message ?? 'Nothing to do');
        }
        // Con el journal vacío el dominio devuelve OK sin hacer nada: el agente
        // debe saber que no se deshizo/rehízo nada (la versión no se movió).
        const changed = outcome.value.version !== versionBefore;
        return reply({ ok: true, changed, version: outcome.value.version }, id);
      }),
    );
  }
}
