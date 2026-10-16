# @rdlc-designer/mcp

[MCP](https://modelcontextprotocol.io) server (stdio) that lets an AI agent create and edit
Business Central **RDLC / RDL (2016)** report layouts. It runs the same editing engine as the
[RDLC Report Designer](https://github.com/JJP00/rdlc-report-designer) desktop app, **without
needing the app**: no GUI, no Electron.

The agent never writes XML. It sends typed commands (insert a textbox, add a tablix column, set a
style, …) that keep the file's structure consistent, can be undone, and are validated against the
official RDL 2016 schema when saving. Files round-trip byte for byte: a diff only shows what changed.

Requires Node.js 22+.

## Use

```bash
npx -y @rdlc-designer/mcp
```

You normally don't run it by hand: you register it in your agent (below).

### Claude Code

```bash
claude mcp add rdlc-designer -- npx -y @rdlc-designer/mcp
```

On native Windows (not WSL), wrap `npx` with `cmd /c`:

```bash
claude mcp add rdlc-designer -- cmd /c npx -y @rdlc-designer/mcp
```

Add `--scope user` for all your projects, or `--scope project` to write a shared `.mcp.json`.

### Other agents

Any MCP client that supports stdio servers takes the same command. Typical shapes (check your
client's docs, they change):

```jsonc
// Claude Desktop (claude_desktop_config.json), Cursor (.cursor/mcp.json)
{ "mcpServers": { "rdlc-designer": { "command": "npx", "args": ["-y", "@rdlc-designer/mcp"] } } }
```

```jsonc
// VS Code (.vscode/mcp.json)
{
  "servers": {
    "rdlc-designer": { "type": "stdio", "command": "npx", "args": ["-y", "@rdlc-designer/mcp"] },
  },
}
```

```toml
# Codex CLI (~/.codex/config.toml)
[mcp_servers.rdlc-designer]
command = "npx"
args = ["-y", "@rdlc-designer/mcp"]
```

## Tools

| Tool                                 | Purpose                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `rdlc_open` / `rdlc_create`          | Open an existing file or create a blank one                       |
| `rdlc_get_report`                    | Page, regions, item counts, dataset fields, parameters, VB code   |
| `rdlc_get_outline` / `rdlc_get_item` | Compact layout map / full JSON of one item                        |
| `rdlc_list_commands`                 | Command signatures, or the exact JSON Schema of the ones you name |
| `rdlc_apply_commands`                | Apply commands in order (validated first, atomic by default)      |
| `rdlc_undo` / `rdlc_redo`            | Per-session history                                               |
| `rdlc_save` / `rdlc_save_as`         | Write (schema-validated) / write a copy                           |
| `rdlc_reload` / `rdlc_close`         | Re-read from disk discarding edits / close the session            |
| `rdlc_list_sessions`                 | Open sessions                                                     |

Edits live in memory until `rdlc_save`. Dataset fields and parameters are read-only: in Business
Central they come from the AL report dataset, so add the column in AL, compile, and re-open the
regenerated `.rdlc`.

## Notes

- Only `.rdlc` / `.rdl` files are accepted. `rdlc_create` and `rdlc_save_as` refuse to overwrite an
  existing file unless you pass `overwrite: true`.
- The server has the file access of the process that launches it. Work on copies until you trust it.
- `RDLC_SCHEMA_PATH` overrides the bundled XSD.

MIT licensed.
