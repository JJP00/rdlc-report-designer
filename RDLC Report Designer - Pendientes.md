# RDLC Report Designer — Puntos pendientes (gaps del plan)

Análisis de lo que falta en `RDLC Report Designer.md`, para tratar en una futura sesión. Ordenado por prioridad.

## 🔴 Gaps funcionales (afectan al MVP real)

1. **El bloque `<Code>` (VB custom)** — ✅ diseño decidido, implementación pendiente (Fase 1).
   Los ficheros tienen 9 bloques VB custom y 355 usos de `Code.` (`GetData`, `SetData`, `BlankZero`...).
   - Acceso: menú contextual / menú Informe → "Propiedades del informe…" → pestaña **Código** (Monaco, lenguaje `vb` nativo — sin lenguaje custom).
   - Además: **panel inferior** (estilo VS Code) "Código" — solo lectura con highlighting, lista de funciones detectadas y botón "Editar" que abre el diálogo en la pestaña Código.
   - El autocompletado de `Code.` en expresiones se alimenta del mismo parser de firmas VB.
   - Comando **atómico**: `setReportCode { code }` (reemplaza el contenido completo del bloque; inverso = texto anterior).
   - Sin compilador VB en JS: validación ligera más adelante; la compilación real la hace BC al renderizar.

2. **PageHeader / PageFooter / PageSetup** — ✅ diseño decidido, implementación pendiente (Fase 1). Obligatorio en MVP.
   - Lienzo con **3 bandas**: Encabezado / Cuerpo / Pie, con contorno de página y guías de margen.
   - Encabezado y pie con altura propia y opciones `PrintOnFirstPage` / `PrintOnLastPage`.
   - **Configurar página como pestaña dentro de "Propiedades del informe"**: tamaño (A4/Letter/custom), orientación (intercambia ancho/alto) y los 4 márgenes. `Columns`/`ColumnSpacing` quedan opacos (no se usan).
   - Comandos nuevos: `setPageSize`, `setPageMargins`, `setRegionHeight`, `setHeaderFooterOptions`; `insertItem`/`deleteItem` ganan `scope` (`Body | PageHeader | PageFooter` + contenedores Rectangle/celdas Tablix).
   - Proyección: `page: { width, height, margins, header, footer, body }`.

3. **Catálogo de comandos** — ✅ resuelto (documentado en `RDLC Report Designer - arquitectura.md` → sección "Catálogo de comandos").
   Contrato completo del MVP: envolvente (`CommandResult`, IDs = Name, `Length`, semántica de commit, inversos) + familias de comandos: items (setLocation, setStyle, insertItem, moveItem...), texto (`setText`, `setParagraphs`), página/informe (`setPageSize`, `setReportCode`...), Tablix (F2) y Matrix (F3).
   Claves: acción completada = 1 comando; front propone nombre, back valida; todo comando tiene inverso.

4. **Esquema del JSON de proyección** — ✅ resuelto (documentado en `RDLC Report Designer - arquitectura.md` → sección "Esquema de proyección").
   `ProjectionDto` (raíz: sessionId, version, meta, page con header/body/footer) + `ItemDto` (textbox/rectangle/line/image/tablix/unknown) + `ParagraphDto`/`TextRunDto` + `StyleDto`/`Length` compartidos con los comandos + reglas de normalización (Length, bordes por lado, hidden booleano/expresión) + qué NO viaja (lossy a propósito). Schemas zod en `contracts`, tipos con `z.infer`, frontend arrancable con fixtures.

5. **UX del "texto mixto".**
   El panel de un Textbox con varios TextRuns (expresión + ":" + estilos distintos) requiere un mini editor tipo rich-text por párrafos. Más trabajo de lo que parece; no está dimensionado.

## 🟡 Gaps técnicos de frontend

6. **Rendimiento del lienzo.**
   972 textboxes en Konva: capas separadas, text caching (`cache()`), no re-renderizar todo en cada drag. Y en los drags, **batching de comandos**: no un IPC por frame — coalescer (un comando por frame de animación o debounce ~50ms).

7. **Arquitectura del canvas.**
   Falta definir: capas de Konva, transform/zoom/pan, modelo de selección (multi-select, alineación), renderizado del grid/snap, toolbox de drag & drop. Es la parte más grande del front; el plan solo dice "lienzo".

8. **Monaco y la lista de variables.**
   Integración del editor de expresiones en el panel (Monaco embebido + custom language VB-like) y cómo el dominio `expression` alimenta el autocompletado. Implícito, no definido.

## 🔵 Rendimiento y memoria (requisito: ligera y fluida)

**Objetivo**: con 900+ textboxes la app debe ir a 60fps sin lags, y la RAM contenida. Electron parte de una base alta (~150-250 MB), así que esto se diseña desde el día 1, no se optimiza al final.

### Expectativas de RAM (validar en Fase 0)

| Escenario | Estimación |
|---|---|
| App con 1 informe mediano abierto | ~300-450 MB |
| 4-5 ficheros grandes abiertos | ~700 MB - 1 GB |

Desglose: base Electron ~150-250 MB; React+DOM ~40-80 MB; Konva activo ~50-150 MB; Monaco ~40-60 MB; main NestJS ~20-40 MB; **DOM lossless ~30-100 MB por fichero grande** (un .rdlc de 500KB ≈ 150-250k nodos; los nodos de texto/indentación dominan).

### Optimizaciones de RAM (priorizadas por retorno)

1. **Solo la pestaña activa monta el lienzo.** Las inactivas guardan solo el JSON de proyección (KBs) y destruyen su stage (`stage.destroy()`). La decisión más rentable: evita multiplicar canvas × pestañas.
2. **Monaco en lazy-load**: dynamic import solo al abrir el panel de expresión; descargable al cerrarlo.
3. **`Konva.pixelRatio` limitado a 1.5** (no 2-3) y número de capas mínimo (grid + items + selección/guías).
4. **Text caching selectivo**: `cache()` solo en elementos visibles o durante drag; nunca en los ~1000 a la vez.
5. **No cachear `sourceText` por nodo** si se vende `xml-trueformat` (conserva el formato en su modelo; la caché era solo el plan B con fast-xml-parser).
6. **Wrappers tipados lazy en el dominio**: no crear el `Textbox` de los 972 al parsear; solo al indexar/seleccionar.

### Optimizaciones de fluidez del lienzo (60fps con 900+ shapes)

1. **`listening: false`** en todos los shapes que no necesitan eventos propios (delegar en el stage). Enlazar eventos en 900+ nodos es de los mayores ladrones de fps en Konva.
2. **Viewport culling**: crear/renderizar solo los elementos que intersectan el viewport. Alternar `visible(false)` al hacer pan/zoom en vez de crear/destruir (evita churn de GC).
3. **Batching de comandos en drags**: coalescer los `mousemove` — un comando por frame de animación (o debounce ~50ms), no un IPC por evento.
4. **Actualizar solo el shape afectado**: en un drag, `layer.batchDraw()` de la capa de items sin redibujar grid/guías; `perfectDrawEnabled: false` durante el drag.
5. **Grid cacheado**: dibujar el grid una vez en su capa con `cache()`, no por frame. Zoom con `stage.scale()` (barato) sin recalcular posiciones.
6. **Sin filtros costosos** (shadows/blur) salvo petición explícita; `Konva.Text` con `wrap` solo cuando es necesario.
7. **Listas virtualizadas** en paneles (lista de variables con miles de fields): virtualización tipo TanStack Virtual; nada de renderizar miles de nodos DOM.

### Main process / IPC

- No re-parsear ante cada evento de `fs.watch`: comparar `mtime`/hash primero.
- Los comandos de drag ya llegan batching desde el front; el backend aplica en O(1) (índice Name→nodo) — sin recorridos de árbol por comando.

### Tareas de medición (Fase 0)

- Abrir los 9 ficheros a la vez y medir memoria (main + renderer) y tiempo de parseo por fichero (objetivo: < 1-2 s para los de 500KB).
- Benchmark del lienzo: 972 textboxes renderizados, drag de un elemento a 60fps, pan/zoom fluido.
- Definir presupuestos: parse < 2s, RAM idle < 300 MB, 60fps en drag con 1000 shapes.

## 🟠 Gaps de proceso y operativa

9. **Empaquetado y distribución Electron.**
   `electron-builder`/`electron-forge`; dev mode (Vite + recarga), build, distribución al equipo (instalador MSI/NSIS, decisión sobre firma de código).

10. **Seguridad Electron.**
    `contextIsolation: true`, `nodeIntegration: false`, CSP, sanitizar lo que entra por IPC (zod ya ayuda). Importante para open source.

11. **Comportamiento ante XML corrupto.**
    Definir: toast de error + no abrir pestaña (recomendado). Nunca abrir en un modo que pueda sobrescribir el fichero.

12. **Flujo de trabajo con BC.**
    Documentar el ciclo completo: exportar layout de BC (página 9650) → editar → reimportar. Dejar como evolutivo natural un "desplegar a BC" (import automático).

13. **Estrategia de testing más allá del golden.**
    Tests de comandos (aplicar/invertir), invariantes del dominio, integración sobre IPC, E2E del canvas. Fixtures: los 9 ficheros como corpus versionado en el repo.

## ⚪ Decisiones menores pendientes

- **CRLF**: los ficheros usan `\r\n`; el round-trip debe preservar los saltos de línea (los golden tests lo cazarán, pero anotarlo).
- **i18n de la UI**: ¿solo español al inicio o framework desde ya? Decidir temprano por el open source.
- **Logging/diagnóstico**: `electron-log` con niveles; ayuda a reportar bugs de la herramienta interna.
- **Alcance del buscador**: ¿busca por nombre de elemento, por contenido de expresión, o ambos?
- **No-goals explícitos**: lista corta de lo que NO hará el MVP (charts, multi-dataset, preview real, drillthrough) para proteger el alcance.

## Ranking de qué integrar primero en el plan

**Resueltos**: 1 (bloque `<Code>`), 2 (regiones de página), 3 (catálogo de comandos), 4 (esquema de proyección) — todos con diseño cerrado e integrados en los documentos. Con esto el **contrato IPC queda completo** (comandos + proyección).

Los que quedan por integrar en el plan: **6, 9, 12, 13, la sección de Rendimiento/memoria** (en particular "solo la pestaña activa renderiza" y el batching de comandos) **+ no-goals**. El resto son detalles de implementación que pueden vivir en issues del repo cuando exista.
