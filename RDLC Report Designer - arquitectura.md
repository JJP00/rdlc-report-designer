# RDLC Report Designer — Arquitectura

Documento técnico del proyecto. Complementa a `RDLC Report Designer.md` (visión, alcance, características y fases).

# Librerías

## Escritorio / Monorepo

- `electron`: shell de escritorio (procesos main + renderer)
- `electron-vite`: tooling (Vite para renderer + build de main/preload, HMR en dev)
- `electron-builder`: empaquetado y distribución (MSI/NSIS)
- `turborepo` + `pnpm`: monorepo (`apps/back`, `apps/front`, `packages/contracts`)
- `electron-log`: logging con niveles
- TypeScript en todo el proyecto

## Backend

- `nestjs`: framework principal (DI + módulos, sin lógica)
- `xml-trueformat` (vendida al repo): parser/serializer lossless con round-trip exacto
- `zod`: define esquema json, validación json en los bordes.
- `chokidar`: file watching fiable (adaptador de `FileWatcherPort`)
- IPC: `ipcMain.handle` / `ipcRenderer.invoke` con preload tipado (sustituye a `nest-electron-ipc`).
- `vitest`: tests de dominio, comandos y golden tests

## Frontend

- `react`: framework principal
- `tailwindcss` v4 + `shadcn/ui`: chrome del editor (pestañas, paneles, diálogos, command palette para el buscador)
- `zustand`: json en memoria, sincronizar el lienzo y el documento json.
- `zundo`: funcionalidades de hacer/deshacer (estado de UI)
- `react-konva`: lienzo (selección, snap, drag, rejilla, tablix)
- `monaco-editor`: editor de expresiones con lenguaje VB-like custom
- `contracts` (workspace): tipos + zod schemas compartidos con el backend

## Calidad y apertura (Fase 4)

- `vitest` + golden tests: corpus de los 9 ficheros .rdlc como fixtures
- `playwright`: E2E del lienzo (vía Electron)
- ESLint + Prettier
- GitHub Actions: CI (lint + tests + release open source MIT)

# Apps

## ReportDesigner_Back

La aplicación del backend va a ser el proceso principal (Electron main, NestJS). El proceso se encargará de importar, editar y exportar el fichero rdlc.

- Posee el **documento autoritativo** en memoria: un DOM _lossless_ donde cada nodo conserva su texto fuente exacto, atributos en orden original, comentarios y whitespace.
- Una de las responsabilidades principales va a ser solo modificar aquellas partes que son diferentes en vez de importar, traducir a json y exportar como un fichero nuevo. Los nodos no tocados se vuelcan **byte a byte idénticos** al original (parcheo quirúrgico; nunca se regenera el XML completo).
- Recibe **comandos** del frontend por IPC y los aplica al DOM al instante — el modelo está siempre al día. El disco solo se escribe al guardar (Ctrl+S), tras validar (BC rompe con un XML inválido).
- Vigila el fichero con `fs.watch`: si cambia externamente, re-parsea y empuja la nueva snapshot al frontend.

Arquitectura totalmente modular:

- Importar
- Exportar
- Crear nuevo
- Acciones (mover, eliminar, editar texto, editar expresión...)
- (Evolutivo) previsualizar
- (Evolutivo) implementación con IA

## ReportDesigner_Front

Aplicación frontend, es una webapp hecho con react sobre electron. Encargado de obtener el diseño json del backend y dibujarlo en el lienzo (Konva).

- El json de Zustand es una **proyección para renderizar**, no la verdad del documento.
- Cada edición se aplica localmente al instante (UI fluida) y se envía un **comando** al backend por IPC — el backend queda sincronizado sin esperar al guardado.
- El botón de guardar **no manda el json completo**: solo ordena al backend persistir su DOM al disco.
- `zundo` gestiona el undo/redo de estado de UI (selección, zoom, paneles); el undo del documento vive en el backend (pila de comandos).

## Sincronización front ↔ back

```
[React + Konva]  edición (drag, tecleo, redimensionar)
      │  aplica el cambio localmente al instante (optimista)
      │  y envía un COMANDO por IPC:
      ▼
{ cmd: "setLocation", id: "Textbox42", top: "2.1cm", left: "1.4cm" }
      │
      ▼
[NestJS backend]  aplica el comando a su DOM en memoria  ← modelo siempre al día
      │  (sin tocar el disco todavía)
      ▼
Ctrl+S  →  valida → serializa DOM → escribe el .rdlc en disco
```

Flujo inverso (edición externa del XML):

```
fs.watch detecta cambio → re-parsea → compara → snapshot nueva → el lienzo se redibuja
```

- **Guardado explícito por defecto** (sin autosave): un estado intermedio inválido rompería el informe en BC. Autosave opcional y configurable.
- Candidato de parser para el DOM lossless: `xml-trueformat` (round-trip exacto). `fast-xml-parser` no garantiza preservar formato, comentarios ni orden de atributos. Decisión final en la Fase 0 con golden tests sobre los 9 ficheros.

## El rol del JSON

El JSON **solo existe para renderizar**; no es el documento. Flujo completo:

```
Abrir/importar fichero
   .rdlc ──► [Backend] parsea a DOM lossless (verdad)
                  │  proyecta solo lo que el lienzo necesita
                  ▼
             JSON de renderizado ──► [Front] Zustand ──► Konva dibuja

Edición (en vivo)
   [Front] cambia su JSON local al instante (fluidez)
           + envía comando por IPC ──► [Backend] aplica al DOM
```

Matices:

1. **El JSON de renderizado no es el documento.** Contiene lo que el lienzo necesita dibujar: estructura del report, elementos con geometría (`Top/Left/Width/Height`), estilos, expresiones, la rejilla del Tablix y sus jerarquías. No contiene comentarios XML, orden de atributos ni texto fuente — eso solo existe en el DOM del backend.
2. **Los nodos desconocidos también se proyectan.** Si un fichero trae algo que el editor no entiende, el JSON incluye un placeholder (rectángulo fantasma con su geometría) para que el lienzo lo dibuje y no se pise. El DOM del backend conserva el original intacto para re-emitirlo al guardar.
3. **El backend no re-envía el árbol completo tras cada comando.** El front aplica optimista y el backend responde por comando con `ok/error` + los valores normalizados (ej: coordenadas ya snapdeadas, unidades convertidas). El JSON completo solo se re-envía en:
   - abrir/importar
   - cambio externo del fichero (`fs.watch`)
   - undo/redo de documento (la pila vive en el backend)
   - tras guardar, si el backend normalizó algo que convenga reflejar

Así el IPC se mantiene barato (los drags mandan muchos comandos por segundo) y la verdad nunca diverge: si el backend rechaza un comando, el front revierte su optimismo con los datos normalizados.

# Arquitectura

El backend se desarrolla con **arquitectura hexagonal** (puertos y adaptadores). El frontend es la presentación de la aplicación y habla con el backend únicamente a través del contrato compartido (`packages/contracts`).

## El hexágono

```
       ┌─────────────── front (React/Electron renderer) ───────────────┐
       │           preload tipado → IPC (sessionId en todo)            │
       └──────────────────────────┬────────────────────────────────────┘
                                  │ driving (entrada)
             ┌────────────────────▼────────────────────┐
             │        ReportEditorApi  (puerto IN)      │
             │  openFile · createNew · save · saveAs   │
             │  close · executeCommand · undo · redo   │
             └────────────────────┬────────────────────┘
                                  │
  ┌───────────────────────────────▼──────────────────────────────┐
  │                     APLICACIÓN (casos de uso)                 │
  │  SessionService      CommandService    TemplateService        │
  │  ProjectionService   (pestañas, dirty, conflictos, journal)   │
  └──────┬───────────────┬──────────────┬─────────────┬──────────┘
         │               │              │             │  puertos OUT
  ┌──────▼─────┐  ┌──────▼─────┐  ┌─────▼────┐  ┌─────▼─────┐
  │ RdlcParser │  │ RdlcSer-   │  │ FileSys- │  │ FileWatch-│
  │ Port       │  │ ializerPort│  │ temPort  │  │ erPort    │
  └──────┬─────┘  └──────┬─────┘  └─────┬────┘  └─────┬─────┘
         │               │              │             │
  ┌──────▼─────────────┐ ┌▼────────────┐ ▼ NodeFs    ▼ Chokidar
  │ INFRAESTRUCTURA    │ │             │  Adapter     Adapter
  │ TrueFormatXml /    │ │ RdlcSeria-  │
  │ FastXmlParser      │ │ lizer      │
  │ (intercambiables)  │ └────────────┘
  └────────────────────┘

  En el centro, sin depender de nada: el DOMINIO (puro TS)
```

## Estructura de carpetas

```
apps/back/src/
├── domain/                      # PURO TS: sin imports de NestJS, Electron ni Node
│   ├── document/                # la verdad: DOM lossless + vistas tipadas
│   │                            #   entidades: Textbox, Tablix, Rectangle...; value objects: Position, Size, Style
│   ├── commands/                # comandos + lógica de aplicar/invertir (moveTo, setExpression, resizeColumn...)
│   └── events/                  # DocumentChanged, ExternalChangeDetected, ConflictDetected, DirtyChanged
│
├── application/
│   ├── ports/
│   │   ├── in/  ReportEditorApi.ts              # puerto de entrada (lo implementa el IPC)
│   │   └── out/ FileSystemPort.ts               # read/write
│   │            FileWatcherPort.ts              # watch/unwatch
│   │            RdlcParserPort.ts               # string → dominio
│   │            RdlcSerializerPort.ts           # dominio → string
│   │            EventBusPort.ts                 # publicar eventos al front
│   └── services/
│       ├── SessionService.ts     # pestañas: open/save/close/watch/conflictos/dirty
│       ├── CommandService.ts     # execute + undo/redo (journal por sesión)
│       ├── TemplateService.ts    # crear nuevo (esqueleto BC válido)
│       └── ProjectionService.ts  # dominio → JSON de renderizado (DTOs de contracts)
│
├── presentation/                # ADAPTADORES DE ENTRADA (controllers)
│   └── ipc/
│       ├── IpcController.ts     # implementa ReportEditorApi con ipcMain.handle
│       ├── validation/          # zod: valida los payloads que llegan por IPC
│       └── mapping/             # DTO (contracts) ↔ dominio
│
├── infrastructure/              # ADAPTADORES DE SALIDA
│   ├── fs/      NodeFileSystemAdapter.ts, ChokidarWatcherAdapter.ts
│   ├── rdlc/    TrueFormatXmlAdapter.ts, FastXmlAdapter.ts, RdlcSerializerAdapter.ts
│   └── events/  IpcEventPublisher.ts       # EventBusPort → webContents.send
│
└── main.ts                       # bootstrap NestJS + binding de puertos→adaptadores (DI por tokens)

packages/contracts/               # DTOs + zod: comandos, JSON de renderizado, eventos, códigos de error
apps/front/                       # llama a ReportEditorApi vía preload tipado
```

## Mapeo de los módulos a hexagonal

| Módulo funcional                                   | En hexagonal                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Importar                                           | Caso de uso `SessionService.open()` → `FileSystemPort` + `RdlcParserPort`      |
| Exportar                                           | `SessionService.save()` → `RdlcSerializerPort` + `FileSystemPort` + validación |
| Crear nuevo                                        | `TemplateService` (aplicación)                                                 |
| Acciones (mover, eliminar, editar texto/expresión) | `CommandService` (aplicación) + comandos del dominio                           |
| Pestañas / dirty / conflictos                      | `SessionService` (aplicación) + `FileWatcherPort`                              |
| Proyección JSON                                    | `ProjectionService` (aplicación, DTOs de `contracts` + zod en el borde)        |
| IPC                                                | Adaptador de entrada (`IpcController`) implementando `ReportEditorApi`         |

## Presentación (controllers)

Los controllers son la piel del hexágono: todo lo que sabe de transporte (canales IPC, serialización, decoradores NestJS) vive aquí. Son finos, con solo 4 responsabilidades: **validar** (zod), **llamar** al caso de uso, **mapear** resultado a DTO y **mapear** errores a códigos.

| Handler                          | Recibe       | Llama a                    | Devuelve                                 |
| -------------------------------- | ------------ | -------------------------- | ---------------------------------------- |
| `openFile(path)`                 | path         | `SessionService.open`      | `{ sessionId, projection }`              |
| `createNew()`                    | —            | `TemplateService.create`   | `{ sessionId, projection }`              |
| `save(sessionId)`                | sessionId    | `SessionService.save`      | `{ ok }`                                 |
| `close(sessionId)`               | sessionId    | `SessionService.close`     | `{ ok } \| { needsConfirmation, dirty }` |
| `executeCommand(sessionId, cmd)` | DTO validado | `CommandService.execute`   | `CommandResult`                          |
| `undo / redo(sessionId)`         | sessionId    | `CommandService.undo/redo` | `CommandResult`                          |

**Contrato de errores** (en `contracts`; nunca excepciones crudas por el canal):

| Error dominio                    | Código IPC                              | Reacción del front                                 |
| -------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `InvalidCommandPayload`          | `E_INVALID_COMMAND`                     | rechaza antes de enviar (zod lo caza)              |
| `CommandRejected` (normalizado)  | `E_COMMAND_REJECTED` + `{ normalized }` | revierte el optimismo con los valores normalizados |
| `ExternalChangeDetected` + dirty | `E_CONFLICT`                            | diálogo: Recargar / Sobrescribir / Guardar como    |
| `ValidationFailed` (al guardar)  | `E_VALIDATION`                          | lista de problemas, no escribe en disco            |
| `FileNotFound`                   | `E_NOT_FOUND`                           | toast + cerrar pestaña                             |

**Eventos backend → front**: los controllers manejan peticiones; las notificaciones van por `EventBusPort` → `IpcEventPublisher` → `webContents.send({ sessionId, type })`. Eventos del MVP: `projectionReady`, `documentChanged` (cambio externo), `dirtyChanged`, `conflictDetected`, `saved`, `sessionClosed`.

## Frontend (espejo de la presentación)

```
apps/front/src/
├── api/            # cliente IPC tipado: los MISMOS métodos de ReportEditorApi
├── preload.ts      # contextBridge: expone window.api (nada entra sin tipar)
├── stores/         # zustand: workspaceStore (tabs, activa, dirty) + documentStore por pestaña
└── components/     # tabs, lienzo Konva, paneles (propiedades/expresión/variables)
```

El lienzo nunca llama a `window.api` directamente: los componentes emiten intenciones → la store genera el comando → `api.executeCommand`. Así el undo/redo de UI (zundo) y el del documento (backend) no se pisan.

## Cableado NestJS

```
AppModule
├── PresentationModule   # declara IpcController (se registra ipcMain.handle aquí)
├── ApplicationModule    # SessionService, CommandService, TemplateService, ProjectionService
├── InfrastructureModule # bindings: FILE_SYSTEM_PORT → NodeFileSystemAdapter, ...
└── DomainModule         # solo providers, sin controllers
```

Los módulos NestJS son **solo el cableado de DI** (binding por tokens: `provide: FILE_SYSTEM_PORT, useClass: NodeFileSystemAdapter`), no contienen lógica.

## Flujo completo de una edición

```
1. Usuario arrastra un textbox en Konva
2. store del front aplica el cambio local (optimista) + zundo registra
3. api.executeCommand(sessionId, { cmd:"setLocation", id, top, left })
4. IpcController: zod valida → CommandService.execute(sessionId, cmd)
5. dominio aplica/invierte, journal de la sesión guarda el inverso
6. CommandResult { ok:true } → controller mapea → front
   (si ok:false → front revierte optimismo con los valores normalizados)
7. dominio emite DirtyChanged → EventBusPort → webContents.send
8. front pinta "*" en la pestaña
9. Ctrl+S → api.save(sessionId) → SessionService.save → serializer + NodeFs
   → se limpia dirty → evento saved → se quita el "*"
```

## Puntos clave

1. **Zod en el borde, no en el dominio**: los DTOs se validan en el adaptador IPC (entrada) y en `ProjectionService` (salida). El dominio mantiene sus invariantes propias (ej: un tablix siempre tiene `columnas ≥ jerarquía de columnas`).
2. **El journal de undo** es estado de sesión (aplicación), pero **cómo invertir un comando es dominio** (`command.inverse()`).
3. **La Fase 0 es un experimento de adaptadores**: `TrueFormatXmlAdapter` y `FastXmlAdapter` implementan el mismo `RdlcParserPort`; los golden tests corren contra ambos y se elige. El dominio no cambia.
4. **Pestañas múltiples desde el MVP**: `SessionService` mantiene `Map<sessionId, Session>` con `{ document, filePath, watcher, dirty, lastMtime, journal }`. El watcher filtra la propia escritura por `mtime` para evitar bucles. Política de conflicto: diálogo explícito (Recargar / Sobrescribir / Guardar como), nunca decisión automática.
5. **Evolutivos encajan solos**: `PreviewModule` consumiría una sesión; la IA emitiría comandos a una sesión como si fuera el usuario (otro adaptador de entrada, o un CLI/HTTP implementando `ReportEditorApi`).

# Dominios

Dos dominios reales; el resto son servicios de aplicación.

> **Estado de implementación (sesión 2026-09-16)** — de este diseño ya están en código:
> el árbol de dominio propio sobre `xml-trueformat`, ambos dominios (`document` y
> `expression` — el tokenizador/catálogo vive hoy en el front, `lib/expressionCatalog.ts`
>
> - `lib/monacoSetup.ts`, porque solo lo consume Monaco), los comandos con inverso
>   (con soporte de **varios inversos por comando** y **comandos internos del journal**
>   `removeNode`/`restoreNode`/`setNodeText`/`insertClone` para insertar/duplicar/eliminar/pegar),
>   los puertos
>   `RdlcParser`/`RdlcSerializer`/`RdlcProjection`/`FileSystem`/`FileWatcher`/`EventBus` y
>   dos puertos añadidos después del diseño inicial:
>
> * **`XmlSchemaValidatorPort`** → validación con el XSD oficial RDL 2016/01
>   (`libxml2-wasm`): al importar avisa, al guardar bloquea la escritura.
> * **`SystemFontsPort`** → fuentes instaladas (registro de Windows) para la barra de
>   formato (canal IPC `listFonts`).
>
> Además de los comandos públicos, la API del editor tiene **`copy`/`cut`/`paste`**
> (portapapeles de sesión con el XML exacto del subárbol, como `undo`/`redo`: no son
> comandos porque copiar no muta el documento).
>
> Comandos implementados hoy: `setLocation`, `setSize`, `setText`, `setStyle`,
> `setImageOptions`, `insertItem`, `duplicateItem`, `deleteItem`, `setPageSize`,
> `setPageMargins`, `setReportCode`. Pendientes: `moveItem`, `setName`,
> `setZIndex`, `setVisibility`, `setItemOptions` y toda la familia Tablix/Matrix
> (F2/F3). El catálogo de `packages/contracts` ya los define todos.

## Dominio 1: `document` — el documento RDLC (el grande)

El corazón: el aggregate root `Document` (árbol + índice) y toda la semántica RDL.

| Concepto                               | Qué es                                                                                                             | Ejemplos del corpus                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Árbol genérico**                     | Modelo de nodos propio (interfaz tuya, no la de la librería): elementos, atributos, texto, comentarios, flag dirty | `<Textbox Name="H1">`, `rd:DefaultName`                                                      |
| **Items (wrappers tipados)**           | Entidades que leen/escriben sobre su nodo                                                                          | `Textbox`, `Tablix`, `Rectangle`, `Line`, `Image`                                            |
| **Tablix**                             | La parte más compleja: `TablixBody` + `RowHierarchy` + `ColumnHierarchy` + miembros con totales                    | `LinesTbl`, `OuterPickUpGrp`                                                                 |
| **Estilo / geometría (value objects)** | `Style`, `Border`, `Position`, `Size`, `Length` (con unidad `cm`)                                                  | `Top/Left/Width/Height`, `FontWeight`, `BackgroundColor`                                     |
| **Índice**                             | `Map<Name, nodo>` + reglas de unicidad                                                                             | `H1`, `H2`, `BTC_PickUpGroupKeyCtx`                                                          |
| **`ReportItemFactory`**                | Construye subárboles nuevos válidos según el orden del XSD                                                         | insertar un Textbox genera `Paragraphs, Style, Top, Left...`                                 |
| **Comandos (servicios de dominio)**    | La semántica de editar: aplicar + inverso + marcar dirty                                                           | `setLocation`, `insertItem`, `deleteItem`, `resizeColumn`, `setExpression`, `addRowGroup`... |
| **Invariantes**                        | Reglas que no se pueden violar                                                                                     | tablix coherente con sus jerarquías, bounds dentro de la página, ZIndex válido               |

## Dominio 2: `expression` — las expresiones RDL (pequeño pero real)

Trabaja con **strings**, no con el árbol, y tiene su propio lenguaje ubicuo:

| Pieza                   | Para qué                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Tokenizer/parser ligero | syntax highlighting y autocompletado en Monaco                                                                 |
| Modelo de referencias   | `Fields!X`, `Parameters!X`, `Globals!X`, `User!X`, `ReportItems!X`                                             |
| Catálogo de funciones   | `IIf`, `Sum`, `Count`, `First`, `Last`, `Format` + funciones del bloque `<Code>` (parseadas de los bloques VB) |
| Validación de sintaxis  | avisar antes de que BC rechace la expresión                                                                    |

Es dominio propio porque la lista de variables y el autocompletado (dos features del MVP) son exactamente este modelo.

## Lo que NO es dominio (capa de aplicación)

| Servicio                                       | Por qué no es dominio                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `SessionService` (pestañas, dirty, conflictos) | Estado de sesión, sin reglas de negocio — una pestaña no es un concepto RDL |
| `CommandService` (orquestar execute/undo/redo) | El _cómo invertir_ es dominio; el _journal_ y el flujo son aplicación       |
| `ProjectionService` (→ JSON renderizado)       | Es un read-model para el lienzo                                             |
| `TemplateService` (crear nuevo)                | Compone: lee template + parsea + reutiliza el dominio Document              |

## Cómo queda en carpetas

```
domain/
├── document/
│   ├── tree/        # tu modelo de nodos genérico (interfaz propia + dirty)
│   ├── items/       # Textbox, Tablix, Rectangle, Line, Image
│   ├── tablix/      # body, row/column hierarchies, grupos, totales
│   ├── style/       # Style, Border, Position, Size, Length
│   ├── index/       # Name → nodo, unicidad
│   ├── factory/     # ReportItemFactory + orden canónico XSD
│   ├── commands/    # comandos con aplicar/invertir
│   └── events/      # DocumentChanged, DirtyChanged, ...
└── expression/
    ├── model/       # referencias, llamadas, literales
    ├── parser/      # tokenizer para highlighting
    └── functions/   # catálogo built-in + descubrimiento de <Code>

application/
├── ports/           # ReportEditorApi (in) + FileSystem/FileWatcher/RdlcParser/RdlcSerializer/EventBus (out)
└── services/        # SessionService, CommandService, TemplateService, ProjectionService
```

## Regla práctica para decidir si algo es dominio

- ¿Describe una regla de RDL o de edición de informes (qué es válido, qué significa)? → **dominio**
- ¿Describe el estado de la herramienta (qué pestaña está abierta, qué está guardado)? → **aplicación**
- ¿Toca ficheros, XML, IPC, discos? → **infraestructura**

Ejemplos: _"un tablix no puede tener más columnas de jerarquía que de body"_ → dominio. _"una pestaña con cambios sin guardar muestra \*"_ → aplicación. _"leer el fichero del disco"_ → infraestructura.

# Catálogo de comandos

Contrato de edición del MVP (Fase 1) con la Fase 2/3 ya definida para no romper el contrato después.

## Envolvente común (el contrato)

```ts
// IPC: sessionId + comando. Validado con zod en el borde.
api.executeCommand(sessionId, command): CommandResult

type CommandResult =
  | { ok: true, id?: string, applied?: Partial<ItemDto> }   // id nuevo al insertar, applied = valores normalizados
  | { ok: false, code: ErrorCode, data?: unknown }
```

- **IDs = `Name` del elemento** (el índice del dominio). Al insertar, el **front propone el nombre** (lo calcula de la proyección: `Textbox17` libre) → el backend valida unicidad → permite UI optimista sin esperar round-trip.
- **`Length`**: `{ value: number, unit: 'cm' | 'mm' | 'in' | 'pt' }` (en el corpus todo es `cm`). El backend lo serializa al formato XML.
- **Semántica de commit**: los comandos representan **acciones completadas** (mouseup, blur, "Aplicar"), no cada frame. Un drag = un comando. Esto simplifica el undo (un drag = un paso) y elimina el problema de batching.
- **Todo comando tiene inverso** (`command.inverse(prevState)`) → el journal del undo sale gratis.

## 1. Forma y estructura (items)

| Comando          | Payload                               | Notas                                                                                              |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `setLocation`    | `{ id, top, left }`                   | drag = 1 comando al soltar                                                                         |
| `setSize`        | `{ id, width, height }`               |                                                                                                    |
| `setZIndex`      | `{ id, zIndex }`                      | orden de apilado                                                                                   |
| `setName`        | `{ id, name }`                        | rename; valida unicidad y actualiza índice                                                         |
| `setVisibility`  | `{ id, hidden: boolean \| Expr }`     | `true/false` o expresión (evolutivo)                                                               |
| `setItemOptions` | `{ id, canGrow?, keepTogether? }`     | propiedades del item, no de Style                                                                  |
| `setStyle`       | `{ id, style: Partial<StyleBag> }`    | nivel item: fuente, color, fondo, bordes, alineación, padding...                                   |
| `insertItem`     | `{ scope, index, item: NewItemSpec }` | `NewItemSpec` = textbox/rectangle/line/image (tablix en F2). La factory rellena hijos obligatorios |
| `deleteItem`     | `{ id }`                              |                                                                                                    |
| `moveItem`       | `{ id, toScope, toIndex }`            | reparentar/reordenar (rectángulo, header, celda...). Atómico para undo limpio                      |
| `duplicateItem`  | `{ id, name? }`                       | clona el subárbol XML exacto (copy/paste fiel). Puede caer a F2                                    |

```ts
type ScopeRef =
  | { kind: 'body' }
  | { kind: 'pageHeader' }
  | { kind: 'pageFooter' }
  | { kind: 'rectangle'; id: string }
  | { kind: 'tablixCell'; id: string; row: number; col: number }; // F2
```

## 2. Texto y expresiones

| Comando         | Payload                                       | Notas                                                                                                                                 |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `setText`       | `{ id, p: number, r: number, value: string }` | edita el valor de **un** TextRun (texto plano o `=expresión`). Cubre el caso simple (1 párrafo / 1 run) y la edición por run en mixto |
| `setParagraphs` | `{ id, paragraphs: ParagraphDto[] }`          | reemplaza la estructura completa de párrafos/runs (commit del editor de texto mixto: añadir/quitar runs, estilos por run)             |

Con estos dos se cubre el 100% del texto: el caso normal usa `setText` (mínimo cambio en el XML), y el caso mixto complejo usa `setParagraphs` (se regenera ese subárbol canónicamente, asumible porque el usuario lo editó).

## 3. Página e informe

| Comando                  | Payload                                           | Notas                                |
| ------------------------ | ------------------------------------------------- | ------------------------------------ |
| `setPageSize`            | `{ width, height }`                               | orientación = swap en el front       |
| `setPageMargins`         | `{ top, bottom, left, right }`                    |                                      |
| `setRegionHeight`        | `{ region: 'header' \| 'footer', height }`        |                                      |
| `setHeaderFooterOptions` | `{ region, printOnFirstPage?, printOnLastPage? }` |                                      |
| `setReportCode`          | `{ code: string }`                                | atómico; inverso = texto VB anterior |

## 4. Tablix — Fase 2

Implementados (F2 parte 2, parte 3 y F2.b):

| Comando                        | Payload                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resizeColumn`                 | `{ id, column: number, width }`                                                                                                                                           |
| `resizeRow`                    | `{ id, row: number, height }`                                                                                                                                             |
| `resizeTable`                  | `{ id, top, left, width, height }` (reparto proporcional de la rejilla)                                                                                                   |
| `addRow` / `deleteRow`         | `{ id, row: number }` — sincroniza `TablixRowHierarchy`; respeta `RowSpan`/`ColSpan`                                                                                      |
| `addColumn` / `deleteColumn`   | `{ id, column: number }` — sincroniza `TablixColumnHierarchy`                                                                                                             |
| `deleteRows` / `deleteColumns` | `{ id, rows/columns: number[] }` — varias en un solo paso de undo                                                                                                         |
| `mergeCells`                   | `{ id, row, col, rowSpan, colSpan }` — solo tramos horizontales (`rowSpan = 1`): el ancla absorbe las celdas contiguas de su fila (las cubiertas desaparecen)             |
| `unmergeCells`                 | `{ id, row, col }` — separa la celda combinada y rellena con celdas vacías                                                                                                |
| `setGroupExpression`           | `{ id, axis: 'row' \| 'column', path, expression }` — edita la expresión; sincroniza la ordenación que espejaba la anterior                                               |
| `setGroupExpressions`          | `{ id, axis, path, expressions: string[] }` — reemplaza la lista (`Group on` / `And on`)                                                                                  |
| `addRowGroup`                  | `{ id, row: number, expression }` — envuelve la hoja en un grupo nuevo (`Group` + `SortExpressions` + `TablixMembers`); no crea cabecera ni toca el body                  |
| `deleteRowGroup`               | `{ id, axis, path }` — grupo hoja: la fila queda estática; grupo con hijos: **eleva las filas** al padre y quita el miembro (con `TablixHeader` con contenido se rechaza) |
| `setGroupPageBreaks`           | `{ id, axis, path, between, start, end }` — un `PageBreak > BreakLocation` por opción (`Between`/`Start`/`End`); otros valores no se tocan                                |
| `setGroupSorting`              | `{ id, axis, path, sorts: { expression, direction? }[] }` — reemplaza `SortExpressions` (sin dirección = ascendente; lista vacía quita el bloque)                         |
| `setMemberToggleItem`          | `{ id, axis, path, item: string \| null }` — escribe/quita `Visibility > ToggleItem` (y `Visibility` si queda vacía)                                                      |

Pendiente (F2.c, opcional):

| Comando          | Payload                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `setGroupTotals` | `{ id, memberPath: number[], total: 'none' \| 'before' \| 'after' }` |

Los totales de RDL no tienen XML propio (son filas estáticas con agregados), así
que la vía barata es insertar la fila y precargar `Sum`/`Count`/`First` por
columna desde la UI, sin comando nuevo.

## 5. Matrix — Fase 3

Misma familia que los grupos de fila, sobre `TablixColumnHierarchy`:
`setGroupExpression` y `deleteRowGroup` ya aceptan `axis: 'column'`; faltarían
`addColumnGroup`, `deleteColumnGroup` y `setColumnGroupTotals`.

## Lo que NO son comandos

- `undo` / `redo`: son métodos de la API (`api.undo(sessionId)` / `api.redo(sessionId)`), no comandos.
- Selección, zoom, snap, paneles: estado de UI (zundo, frontend).

## Patrones clave

1. **Acción completada = 1 comando** (no por frame).
2. **Front propone nombre, back valida** (UI optimista sin round-trip).
3. **Todo comando tiene inverso** (undo/redo en el journal del backend).

# Esquema de proyección

El JSON de renderizado (ver "El rol del JSON" en Apps). Es **lossy a propósito**: solo contiene lo que el canvas y los paneles necesitan. Los schemas zod viven en `packages/contracts` y los tipos TS se infieren con `z.infer`.

## Raíz y página

```ts
type ProjectionDto = {
  sessionId: string;
  version: number; // contador monotónico; sube con cada mutación (reconciliación del optimismo)
  reportName: string;
  meta: ReportMetaDto;
  page: PageDto;
};

type PageDto = {
  width: Length;
  height: Length;
  margins: { top: Length; bottom: Length; left: Length; right: Length };
  header: RegionDto; // RegionDto = { height: Length; items: ItemDto[]; printOnFirstPage?; printOnLastPage? }
  body: RegionDto; // body.height = altura del cuerpo
  footer: RegionDto;
};
```

## Meta (alimenta el buscador, la lista de variables y el panel de código)

```ts
type ReportMetaDto = {
  code: { text: string; functions: { name: string; parameters?: string[] }[] }; // bloque <Code> VB
  fields: { name: string; dataType?: string }[]; // dataset fields
  parameters: { name: string; dataType?: string; default?: string; prompt?: string }[];
  // Globals!, User! y funciones agregadas = listas estáticas en el front (no viajan)
};
```

## Items

```ts
type ItemDto = TextboxDto | RectangleDto | LineDto | ImageDto | TablixDto | UnknownItemDto;

type ItemBase = {
  id: string; // = Name del elemento (clave del índice)
  top: Length;
  left: Length;
  width: Length;
  height: Length;
  zIndex?: number; // orden de apilado (el canvas ordena por esto)
  hidden?: boolean | string; // boolean literal o expresión (string)
  style?: StyleDto;
};

type TextboxDto = ItemBase & {
  kind: 'textbox';
  paragraphs: ParagraphDto[];
  canGrow?: boolean;
  keepTogether?: boolean;
};
type RectangleDto = ItemBase & { kind: 'rectangle'; children: ItemDto[] }; // contenedor
type LineDto = ItemBase & { kind: 'line' };
type ImageDto = ItemBase & {
  kind: 'image';
  source?: string;
  sourceKind?: 'External' | 'Embedded' | 'Database';
  sizing?: string;
};
type UnknownItemDto = ItemBase & { kind: 'unknown'; tagName: string; path: string; id?: string }; // placeholder fantasma

type ParagraphDto = { runs: TextRunDto[]; style?: StyleDto }; // style: textAlign, lineHeight...
type TextRunDto = { value: string; style?: StyleDto }; // value: literal o '=expresión'
```

## Tablix (modelo completo desde F1, edición visual en F2/F3)

```ts
type TablixDto = ItemBase & {
  kind: 'tablix';
  body: {
    columns: Length[]; // ancho por columna
    rows: { height: Length; cells: TablixCellDto[] }[];
  };
  rowHierarchy: TablixMemberDto[]; // árbol de miembros (filas)
  columnHierarchy: TablixMemberDto[]; // árbol de miembros (columnas / matrix)
  corner?: TablixCellDto | null;
};

type TablixCellDto = { colSpan?: number; rowSpan?: number; content: ItemDto | null };

type TablixMemberDto = {
  path: number[]; // posición en el árbol = memberPath de los comandos
  name?: string; // Group > @Name (solo grupos)
  expression?: string; // presente = grupo dinámico; ausente = estático
  total: 'none' | 'before' | 'after';
  hidden?: boolean | string;
  sortExpressions?: { value: string; direction?: 'Ascending' | 'Descending' }[];
  pageBreaks?: ('Start' | 'End' | 'Between')[]; // PageBreak > BreakLocation
  toggleItem?: string; // Visibility > ToggleItem
  children: TablixMemberDto[];
};
```

## Estilo y value objects (compartidos con los comandos)

```ts
type Length = { value: number; unit: 'cm' | 'mm' | 'in' | 'pt' };

type StyleDto = {
  // mismo bag en item / párrafo / run; el backend solo emite lo aplicable a cada nivel
  fontFamily?: string;
  fontSize?: Length;
  fontWeight?: 'Normal' | 'Bold';
  fontStyle?: 'Normal' | 'Italic';
  textDecoration?: 'None' | 'Underline' | 'LineThrough' | 'Overline';
  color?: string;
  backgroundColor?: string; // 'Silver', '#F0F0F0'...
  textAlign?: 'Left' | 'Center' | 'Right' | 'Justify';
  verticalAlign?: 'Top' | 'Middle' | 'Bottom';
  padding?: { top?: Length; left?: Length; bottom?: Length; right?: Length };
  border?: {
    top?: BorderSideDto;
    left?: BorderSideDto;
    bottom?: BorderSideDto;
    right?: BorderSideDto;
  };
  format?: string;
};
type BorderSideDto = {
  style: 'None' | 'Solid' | 'Dashed' | 'Dotted' | 'Double';
  color?: string;
  width?: Length;
};
```

## Reglas de normalización (lo que el backend resuelve al proyectar)

| En el XML                                                   | En la proyección                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `"18.738cm"`                                                | `{ value: 18.738, unit: 'cm' }`                                                                                            |
| `<Border>` genérico + overrides por lado (`<TopBorder>`...) | `border` **resuelto por lado** (el front no piensa en herencia)                                                            |
| `<Hidden>true</Hidden>` / expresión                         | `boolean` literal o `string` expresión                                                                                     |
| Estilos en 3 niveles (item/párrafo/run)                     | **el mismo `StyleDto`** en los tres sitios; el backend solo emite lo aplicable                                             |
| Nodos desconocidos                                          | `UnknownItemDto` con geometría (solo los que están dentro de un `ReportItems`; los elementos opacos no visuales no viajan) |

## Lo que deliberadamente NO viaja (vive solo en el dominio)

Comentarios XML, orden de atributos, whitespace, `rd:DefaultName`, el árbol XML crudo, nodos no visuales. Todo eso se conserva en el DOM del backend y se re-emite al guardar.

## Para el código

- Cada tipo tiene su schema zod en `packages/contracts`; los tipos TS se infieren con `z.infer`.
- Con este esquema, el frontend puede empezar con **fixtures JSON de ejemplo** (generados del corpus real) sin esperar al backend.
