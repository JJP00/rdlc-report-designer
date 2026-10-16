# Servidor MCP — editar `.rdlc` desde un agente

- **Fecha**: 2026-10-15
- **Estado**: implementado (v1)
- **Ámbito**: backend (`apps/back/src/mcp/`). No cambia el contrato ni el dominio.

## 1. Qué es

Un servidor [MCP](https://modelcontextprotocol.io) por **stdio** que expone el motor de edición de la
app a un agente (Claude Code, Claude Desktop…). El agente no recibe ni emite XML: trabaja con los
mismos **comandos tipados** que el front (`packages/contracts/src/commands.ts`), así que conserva
todas las garantías del editor: round-trip byte a byte, undo, normalización de medidas y
validación contra el XSD RDL 2016 al guardar.

## 2. Decisiones

| Decisión                       | Motivo                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Proceso headless por stdio** | Funciona sin abrir la GUI. Reutiliza `SessionService`/`CommandService` tal cual; solo cambia la raíz de composición (`headlessContext.ts`, sin Electron ni Nest).                          |
| Sesiones propias del proceso   | No comparte sesiones con la app de escritorio. Si ambos tocan el mismo fichero, rige el flujo de conflicto de siempre (`E_CONFLICT` al guardar; `rdlc_reload` / `rdlc_save_as`).           |
| Un solo `rdlc_apply_commands`  | El catálogo (~50 comandos) no viaja en el esquema de la herramienta (consumiría contexto en cada sesión): se consulta bajo demanda con `rdlc_list_commands`.                               |
| Validar antes de aplicar       | Todos los comandos se validan con `commandSchema` antes de tocar nada; luego, si uno es rechazado por el dominio, `atomic` (por defecto) deshace los ya aplicados con el undo del journal. |
| Lectura compacta               | `rdlc_get_outline` devuelve un mapa de texto (una línea por item) en lugar de la proyección JSON completa; `rdlc_get_item` da un item entero.                                              |
| Guardado explícito             | Nada se escribe hasta `rdlc_save`. Al parar el servidor se descartan las sesiones sin guardar.                                                                                             |

## 3. Herramientas

| Herramienta                  | Para qué                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `rdlc_open` / `rdlc_create`  | Abrir un `.rdlc`/`.rdl` o crear uno en blanco (no pisa ficheros salvo `overwrite`) |
| `rdlc_list_sessions`         | Sesiones abiertas, dirty, versión                                                  |
| `rdlc_get_report`            | Página, regiones, conteo de items, campos, parámetros, código VB (`includeCode`)   |
| `rdlc_get_outline`           | Mapa del layout (`region`, `id`, `maxLines` para acotar)                           |
| `rdlc_get_item`              | JSON completo de un item                                                           |
| `rdlc_list_commands`         | Firmas de todos los comandos o JSON Schema exacto de los pedidos (`names`)         |
| `rdlc_apply_commands`        | Aplica una lista de comandos en orden (`atomic`)                                   |
| `rdlc_undo` / `rdlc_redo`    | Journal de la sesión                                                               |
| `rdlc_save` / `rdlc_save_as` | Guardar (valida el esquema) o guardar copia                                        |
| `rdlc_reload` / `rdlc_close` | Releer del disco descartando cambios / cerrar (`force` descarta cambios)           |

Los avisos que en la GUI son diálogos (conflicto, fichero borrado, recarga externa) llegan al agente
como `notices` en la siguiente respuesta de esa sesión (`HeadlessEventBus`).

## 4. Distribución y uso

El servidor funciona **sin la app**: no usa Electron ni abre ventana. Se distribuye como paquete
npm [`@jjp00/rdlc-designer-mcp`](../../packages/rdlc-mcp) (bundle de ~280 KB + el XSD; las dependencias de
terceros las instala npm). Requiere Node 22.

```bash
# usuario final (cuando esté publicado)
claude mcp add rdlc-designer -- npx -y @jjp00/rdlc-designer-mcp
claude mcp add rdlc-designer -- cmd /c npx -y @jjp00/rdlc-designer-mcp   # Windows nativo (no WSL)
```

Configuración para otros agentes (Claude Desktop, Cursor, VS Code, Codex…): ver el
[README del paquete](../../packages/rdlc-mcp/README.md).

**Desarrollo (desde el repo, sin publicar):**

```bash
pnpm --filter @rdlc-designer/back build:mcp     # → apps/back/out/mcp/server.mjs
claude mcp add rdlc-designer -- node C:/ruta/a/ReportDesigner/apps/back/out/mcp/server.mjs
```

**Paquete npm:**

```bash
pnpm --filter @jjp00/rdlc-designer-mcp build          # → packages/rdlc-mcp/dist + resources
pnpm --filter @jjp00/rdlc-designer-mcp smoke          # npm pack + instalar el tarball en limpio + stdio
cd packages/rdlc-mcp && npm publish              # publicar (cuenta npm dueña del scope @jjp00)
```

El smoke empaqueta y lo instala como lo haría un usuario (descarga las dependencias de npm) y
comprueba `create → apply → save` con el XSD empaquetado. `RDLC_SCHEMA_PATH` sobrescribe el XSD.

> **Pendiente**: publicar en npm (scope: `@jjp00`; la primera publicación es manual). El workflow de
> release aún usa `NPM_TOKEN`: migrarlo a trusted publishing (OIDC). Para quien tenga instalada la app
> de escritorio no hace falta el paquete: basta cualquier Node 22.

## 5. Límites conocidos (v1)

- **Campos y parámetros del dataset son de solo lectura**: el contrato no tiene comandos para
  declararlos, así que el agente solo puede referenciar los que ya existen. Añadirlos pide comandos
  nuevos de dominio (con undo y tests).
- Solo se editan `.rdlc`/`.rdl` esquema 2016/01 (igual que la app). Las rutas no se restringen a una
  carpeta: el agente tiene el mismo alcance de ficheros que el proceso que lo lanza.
- Sin portapapeles (`copy`/`paste`): `duplicateItem` cubre el caso habitual.
- Las sesiones se pierden si el proceso muere: guardar a menudo.

## 6. Pruebas

`apps/back/test/mcp/mcp-server.spec.ts`: un cliente MCP real contra el servidor por transporte en
memoria, con dominio, serializador y XSD reales (11 tests: ciclo crear → editar → guardar → reabrir,
validación previa, rollback atómico, undo/redo, cierre con cambios, rutas, catálogo de comandos).
