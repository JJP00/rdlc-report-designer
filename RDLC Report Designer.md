# Introducción

El editor de informes de rdlc, report builder es un programa obsoleto donde el desarrollo para es complejo. Ha sido abandonado por el propio Microsoft.

Grandes problemas de interfaz y de experiencia de usuario.

Aplicación desarrollado con nest.js, React y Electron.

Herramienta interna; se publicará como código abierto una vez alcanzado el MVP.

# Alcance real (análisis del corpus de 9 ficheros .rdlc)

Los ficheros los genera Business Central (schema RDLC 2016) y esta app los edita visualmente. El corpus analizado:

| Elemento                            | Total | Notas                                                                                                |
| ----------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `Textbox`                           | 972   | ~91% del diseño                                                                                      |
| `Tablix`                            | 55    | 2 anidados (tabla dentro de tabla); 53 grupos de filas, 1 grupo de columnas (`BTCLoadingOrder.rdlc`) |
| `Rectangle`                         | 24    | Contenedores                                                                                         |
| `Image`                             | 16    | Sin imágenes embebidas                                                                               |
| `Line`                              | 2     |                                                                                                      |
| Charts / Gauges / Maps / Subreports | 0     | Fuera de alcance                                                                                     |

Otros hallazgos:

- **1 dataset por fichero** y `DataSource` genérico (BC lo inyecta en runtime). Sin soporte multi-datasource.
- **Bloques `<Code>` VB custom**: 355 usos de `Code.` (`GetData`, `SetData`, `BlankZero`, ...). El intellisense de expresiones debe parsear el bloque `<Code>` y ofrecer sus funciones.
- Expresiones: `Fields!` (1528), `First` (161), `IIf` (116), `Sum` (89), `Count`, `Parameters!`, `Globals!`, `User!`, `Format(`. Patrón VB clásico.
- **Namespace `rd:` a preservar**: `rd:DefaultName` (699), `rd:DataSourceID`, `rd:ReportID`, `rd:ReportUnitType`, `rd:SecurityType`.
- 327 `ZIndex`, 41 Sort/Filters, unidades en **cm**, sin Actions/Bookmarks/drilldown.
- `<Value>` de un TextRun puede ser: **texto plano** (`<Value>:</Value>`, frases fijas), **expresión** (`=Fields!X.Value`), o **texto mixto** (varios TextRuns con estilos). Ojo: `<Value>` estático dentro de `<ReportParameter>` es el valor por defecto del parámetro, no un texto del informe.
- Los captions de BC llegan como campos del dataset (`=Fields!XXX_Lbl.Value`), no como texto estático.

# Características esenciales/diferenciantes

- Si el fichero .rdlc esta guardado, entonces como desarrollador si edito el código xml directamente se podrá ver el cambio en la aplicación.
- Una barra de búsqueda para buscar las variables
- el Código de las expresiones pueda darle formato o highlights/intelisense básico (incluye funciones del bloque `<Code>`)
- drag and drop.
- lista de variables globales (Fields, Parameters, Globals, User, funciones de `<Code>`).
- snap de los elementos, shift para ignorar.
- panel de expresión o dato de un textbox (texto plano / expresión / texto mixto).

# Decisiones críticas de diseño

1. **El XML es la fuente de verdad, nunca el JSON.** El feature de edición externa lo exige: file watching → re-parseo → nuevo estado; el JSON de Zustand es solo una proyección efímera.
2. **Round-trip XML con golden tests** sobre los 9 ficheros: parsear → serializar → diff vacío. Preservar namespace `rd:`, comentarios y orden de atributos. Es el go/no-go del proyecto.
3. **Modelo tolerante a nodos desconocidos**: se valida con zod solo lo que se conoce; el resto se conserva como opaco y se re-emite tal cual.
4. **Validar antes de guardar**: BC re-lee el fichero al desplegar el layout; un XML inválido rompe el informe en BC.
5. **No hay preview real**: no existe renderizador RDLC fuera de SSRS. Konva dibuja la superficie de diseño (layout, snap, guías); el resultado final se prueba en BC, como se trabaja hoy.
6. **IPC directo en vez de `nest-electron-ipc`**: la librería está en "early stage" (según su propio readme). Usar `ipcMain.handle`/`ipcRenderer.invoke` con preload tipado. Menos dependencias, mejor para abrirlo como open source.
7. **Modelo Tablix completo desde el inicio**: representar `TablixBody` + `TablixRowHierarchy` + `TablixColumnHierarchy` + `TablixCorner` como árboles aunque la edición visual de grupos llegue después. Cada grupo de filas añade filas al body; cada grupo de columnas añade columnas. Añadir matrix después sin esto implica refactor mayor.

# Fases

> **Estado a 2026-09-14**: Fase 0 **cerrada** (golden round-trip 10/10 + shell Electron +
> watching + benchmark). Fase 1 **muy avanzada** (dominio, comandos, paneles, barra de
> formato, variables, propiedades del informe, validación XSD, insertar/duplicar/eliminar,
> auto-crecimiento de contenedores). Siguiente: buscador Ctrl+K y Monaco. Detalle en
> `RDLC Report Designer - Pendientes.md`.

1. **Fase 0 — Spike round-trip (go/no-go)**: parser + serializer con golden tests sobre los 9 ficheros, namespaces `rd:` incluidos, file watching con recarga en vivo.
2. **Fase 1 — Editor de layout**: Textbox/Rectangle/Line/Image en Konva, drag & drop, snap + Shift, panel de propiedades, panel de texto/expresión (plano/expresión/mixto), lista de variables (incluye funciones de `<Code>`), undo/redo. **Regiones de página** (Encabezado/Cuerpo/Pie + Configurar página), **Propiedades del informe** (pestaña Código VB) y **panel inferior de Código**. Tablix completo en lectura/escritura.
3. **Fase 2 — Tablix visual**: rejilla, redimensionar columnas/filas, editar celdas, añadir/quitar filas/columnas, grupos de filas + totales.
4. **Fase 3 — Matrix**: edición visual de grupos de columnas (cabecera dinámica, totales). La pantalla más compleja del proyecto.
5. **Fase 4 — Pulido y apertura**: editor de expresiones Monaco completo, validación, documentación, CI, release open source (MIT).

> Librerías, apps, arquitectura hexagonal y dominios documentados en [RDLC Report Designer - arquitectura.md](RDLC Report Designer - arquitectura.md).

# External links

- schema rdlc 2016 https://learn.microsoft.com/en-us/openspecs/sql_server_protocols/ms-rdl/52ce3983-2bfc-4e72-9359-42aaf5fe4509
