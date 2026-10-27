# RDLC Report Designer — Puntos pendientes (gaps del plan)

> **Limpieza 2026-10-20** — este documento lista solo lo que queda por hacer. El historial
> de sesiones cerradas que vivía aquí (fases F2/F3, gaps G1–G13, pase UX U1–U9, técnicos
> T1–T3, pestañas A–E, resiliencia BUG-51…59, BUG-47, diálogos BUG-60…65, formato numérico,
> servidor MCP…) se eliminó: queda en **git** y resumido en
> [`docs/estado-desarrollo.md`](docs/estado-desarrollo.md), con el detalle en los documentos
> de `docs/` (bugs, ux, features, release, perf).

## 🧭 Pendiente de decisión — Capas «Elementos solapados» (Nivel 1)

> Rediseño del recorrido (2026-10-08): [`docs/features/0002-capas-rediseno-journey.md`](docs/features/0002-capas-rediseno-journey.md)
> (+ diagrama `.html`). **No sustituye** a `docs/features/0001-capas.md` (trabajo del
> usuario, sin tocar).

- **Nivel 1 (a implementar primero, sin modo ni panel)**: «Seleccionar el de debajo» con
  tres vías equivalentes — `Alt+clic`, menú contextual («de debajo / de encima / Elementos
  aquí (N)») y `Alt+↓/↑` sobre la selección con anuncio `aria-live`; insignia
  «1 de 2 · Alt+clic» al seleccionar algo con otro elemento debajo; arrastrar desde el
  cuerpo del marco para mover un item tapado. No toca `hit.ts`, `ItemView`, `Paper`, `App`
  ni el documento.
- **Nivel 2 (condicional)**: panel «Elementos solapados» + modo «Editar solo esto» con las
  correcciones de 0002 (chip como salida, inserción que redirige y avisa, panel por
  relevancia, teclado y estado por pestaña). Solo se justifica si hay pilas de 3+ o casos
  fuera de `LinesTable`/`LinesTable2`.
- **Spikes antes de codificar (no hechos)**: (1) `Alt+clic` y `Alt+↓/↑` en
  Electron/Windows sin activar la barra de menús; (2) pilas de las facturas con
  `tablixLayout` vs. el script de solapes; (3) mover un item tapado desde el marco sin que
  el de encima robe el hit-test.
- **Falta**: confirmar Nivel 1 primero y Nivel 2 condicionado.

## 🎨 UX — restos de la re-auditoría Intent (0005)

> Detalle, evidencia y prioridades en
> [`docs/ux/0005-reauditoria-intent.md`](docs/ux/0005-reauditoria-intent.md). Su «Resolución
> posterior (2026-10-09)» cerró N1 (breadcrumb), pie, accesibilidad, descubrimiento, zoom
> con rueda y avisos. Lo que **queda**:

- **N2 · tiradores sobre un vecino solapado**: los del elemento seleccionado tapan el
  borde de `LinesTable2`; un clic ahí no cambia de selección (`SelectionFrame.tsx`).
  Relevante también para el rediseño de solapados.
- **Texto recortado sin señal**: un textbox pequeño con texto largo no muestra marca de
  recorte (propuesta en `ItemView.tsx`).
- **Toolbar con escalado de Windows 150–200 %**: menú de desbordamiento «Más…» (el mínimo
  de ventana ya escala con el zoom del renderer).
- **Objetivos < 24 px**: pasos numéricos, asas de regla y casillas.
- **Verificación pendiente**: medir en la app el arreglo del desplazamiento del lienzo (N1)
  y el escalado de Windows; pasada con lector de pantalla real y DPI físico (criterio de
  salida de 0005); y la re-evaluación de `docs/ux/0003` con una caída de render real
  (`render-process-gone`) y un conflicto no detectado.
- **Restos parciales** (hallazgos 18, 24 y 27 de 0005): terminología de cierre («Sin
  documento abierto» / «Documento cerrado» frente a «informe»); el nombre largo de pestaña
  se trunca por el inicio y pierde lo que identifica; textos menores («bytes idénticos»,
  «Insertar tabla (Tablix)», «Custom»).

## 🧩 Opciones de item, fila y grupo (planificado, sin empezar)

En RDL estas opciones viven en tres sitios distintos, así que son tres cambios y no uno:

- **`KeepTogether` en Tablix y Rectangle** (vive en el propio item): `setItemOptions`
  rechaza hoy todo lo que no sea `Textbox` (`setItemOptions.ts:33`); `applyFlag` ya
  funciona sobre cualquier nodo, así que basta con quitar esa comprobación para
  `KeepTogether` y dejar `CanGrow` restringido al Textbox, que es el único que lo
  proyecta.
- **`RepeatOnNewPage`, `KeepWithGroup` y `KeepTogether` de una fila** (viven en el
  `TablixMember` de la fila de cabecera): comando nuevo `setMemberOptions`, direccionado
  con el mismo `id` + `axis` + `path` que `setGroupPageBreaks` (`findGroup` ya devuelve el
  miembro, se reutiliza el resolutor). En la UI, el menú contextual de una fila de
  cabecera lleva una sola acción, «Repetir en cada página», que escribe
  `RepeatOnNewPage=true` + `KeepWithGroup=After` en un único paso de undo (el par que
  escribe Report Builder). Es el ajuste que más piden los usuarios de BC.
- **`RepeatColumnHeaders` / `RepeatRowHeaders`** (viven en el `Tablix`): añadirlos a
  `setItemOptions`; `geometry.ts:47-48` ya los tiene en el orden canónico.

### `ResetPageNumber`, `PageName` y `NoRowsMessage`

- **`ResetPageNumber`** va dentro del `PageBreak` del grupo: bandera nueva en
  `setGroupPageBreaks`. La combinación típica de BC es salto de página entre documentos
  más reinicio de la numeración, para tener «Página 1 de N» en cada factura.
- **`PageName`** del grupo: comando nuevo `setGroupPageName` (o un campo en el comando de
  propiedades del grupo).
- **`NoRowsMessage`** del Tablix: campo de expresión en `setItemOptions`.

**Comprobar antes**: `applySetGroupPageBreaks` escribe **un `PageBreak` por cada opción
marcada** (`Between`/`Start`/`End`, `tablixGroups.ts:449-493`). En RDL 2010 y posteriores
el grupo debería tener un único `PageBreak`, y «inicio y fin» se escribe como
`BreakLocation=StartAndEnd`. El XSD admite varios, pero puede que Report Builder o BC no:
si hoy se marcan Start y End y se abre el informe en Report Builder, se despeja la duda.
Añadir `ResetPageNumber` es el momento de arreglarlo, porque tiene que ir dentro de ese
`PageBreak` único.

**Orden sugerido**: primero las opciones de item y fila (el cambio más frecuente, y del
que depende el lint), después los saltos y la numeración de página (con la comprobación
del `PageBreak`) y al final el lint de BC.

## 🧪 Lint de BC (hecho; solo expresiones)

Reglas de solo lectura en el dominio del backend (`apps/back/src/domain/lint`), expuestas
por IPC (panel «Problemas») y por MCP (`rdlc_lint`); avisan, nunca bloquean el guardado.
**Solo miran las expresiones** (qué dicen), no cómo está diseñado el informe: sin reglas
de fuentes, imágenes ni repetición de cabeceras.

- `unbalancedBracket`: paréntesis, corchetes, llaves y comillas sin cerrar en una expresión
  o en `<Code>` (los textos y los comentarios VB se saltan).
- `unknownField`: `Fields!X` que no está en ningún dataset.
- `reportItemMissing`: `ReportItems!X` que no apunta a ningún item.
- `fieldInHeaderFooter` / `fieldInHeaderFooterFirst`: `Fields!` en cabecera/pie.
  **Por revisar**: el corpus de BC (`SalesShipment`, `BTCWhseShipment`…) trae decenas de
  `=Fields!…` sueltos en la cabecera, así que como error da falsos positivos.
- Pendiente: `Code.GetData` que no apunte a nada (sin patrón comprobable todavía).

## 🗂️ Evolutivo de pestañas

- **Restaurar las pestañas al arrancar** y **persistir el orden** (hoy el backend las
  devuelve por orden de apertura).
- **Split view** de la misma sesión y **comparación** de informes.
- Menor: las claves de `sessionStorage` de sesiones desaparecidas se quedan hasta cerrar
  la ventana.

## 🛠️ Técnicos (T4, T5 y firma)

- **T4 · property tests** de comandos aleatorios: generador + invariantes (undo
  byte-exacto).
- **T5 · flujo BC documentado**: exportar layout (página 9650) → editar → reimportar;
  evolutivo: desplegar a BC.
- **Firma Windows real** cuando haya certificado (`CSC_LINK` + `CSC_KEY_PASSWORD`); sin
  ellos el pipeline empaqueta sin firmar
  ([`docs/release/0001-empaquetado-windows.md`](docs/release/0001-empaquetado-windows.md)).

## 🌐 i18n

- Plan EN + ES en [`docs/features/0005-i18n.md`](docs/features/0005-i18n.md) + [guía de
  microcopy](docs/ux/0006-guia-microcopy.md) (decisiones 2026-10-20); **fases 0–2
  implementadas** (2026-10-20): `packages/i18n`, barrido EN/ES de toda la UI,
  interruptor Fichero → Idioma, errores con `reason`/`params` y detección del SO.
- **Pendiente**: fase 3 (revisión de copy en contexto, glosario con consultores BC,
  QA lingüístico) y fase 4 (pseudo-idioma en CI, E2E EN fija + smoke ES + pseudo);
  consolidaciones menores en [`packages/i18n/CONSOLIDATION.md`](packages/i18n/CONSOLIDATION.md).

## 🐜 Menores abiertos

- **BUG-44 (restos)**: algunos campos width/height admiten `min={0}` y un «Aplicar» de la
  página manda varios comandos (varios pasos de undo)
  ([`docs/bugs/0001-auditoria-2026-10-07.md`](docs/bugs/0001-auditoria-2026-10-07.md)).
- **Memoria del lienzo**: resuelta la del zoom cercano con la **cámara del lienzo**
  (2026-10-20) — el stage cubre la ventana visible, no el papel entero
  ([`docs/perf/0002-camara-lienzo-zoom.md`](docs/perf/0002-camara-lienzo-zoom.md)).
  Queda como opcional consolidar las capas de superposición (el coste restante es
  por capa).

## ⚪ Decisiones menores

- **i18n**: EN + ES implementados (fases 0–2, 2026-10-20); revisión y endurecimiento
  pendientes — ver la sección de arriba.
- **CRLF/BOM**: preservados y verificados en golden tests.
- **Logging**: `electron-log` + consola del renderer al log del main (útil para soporte).
- **Modo QA**: `RDLC_OPEN` (abrir fichero), `RDLC_SHOT`/`RDLC_SHOT_SCRIPT`/`RDLC_SHOT_DRAG`
  (capturas y drag simulado con eventos reales), `RDLC_BENCH` (benchmark del lienzo).
- **No-goals del MVP**: charts/gauges/maps, subreports, multi-dataset, preview real,
  drillthrough/bookmarks, compilador VB.

## 🔍 Hallazgos del corpus (importantes para no romper BC)

1. **`<Label>` en los TextRun**: el diseñador de BC/RB muestra esa etiqueta
   (`[BTCClientName]`) en lugar de la expresión. Se parsea y se pinta entre corchetes.
2. **Contenido de celdas de Tablix sin `Width/Height`**: el tamaño lo pone la celda
   (con `ColSpan`/`RowSpan`). Distinguir “longitud ausente” de “0cm” es clave; si no,
   las celdas se dibujan 0×0 (bug real que tuvimos).
3. **Rectángulos 0×0 dentro de celdas**: son contenedores implícitos (manda la celda).
   **No deben crecer** al sacar un hijo fuera; solo crecen los de tamaño explícito.
4. **Eventos de Konva que burbujean**: `dragend`/`dragmove` llegan también al grupo
   padre; hay que filtrar por `event.target === event.currentTarget`. Y la posición en
   anidados se calcula con el **delta del puntero**, no con `setAbsolutePosition`.
5. **Escapado de texto propio** (deja `"` y `'` crudas): el escaper de la librería
   rompía el undo byte-exacto del bloque `<Code>` (comillas de VB).
6. **Unidad y representación**: el clamp solo debe reescribir la longitud si realmente
   recorta (si no, `20pt` se convertía en `0.705556cm`).
7. **Imágenes de BC**: siempre `Source=Database` + `=First(Fields!CompanyPicture.Value, …)`
   - `MIMEType=image/png` + `Sizing=FitProportional`. En diseño: placeholder.

## 🧠 Lecciones de Konva (para no repetirlas)

| Regla                           | Detalle                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Área de hit de un `Rect`**    | Por defecto es **toda su superficie**, no solo el trazo: un rect envolvente para «pinchar el borde» se traga los clicks del interior. Para un anillo hace falta un `hitFunc` propio (4 `rect()` + `fillStrokeShape`) |
| **Parámetros del hitFunc**      | `fillStrokeShape` rellena con el _color de hit_ aunque no haya `fill`: en el lienzo de hit todo lo dibujado es hitable                                                                                               |
| **Capa de selección**           | Los tiradores y separadores viven en una capa encima: mientras hay algo seleccionado, tapan los clicks de lo que hay debajo (igual que RB)                                                                           |
| **Medir el marco**              | `getClientRect()` incluye **todos** los descendientes: cualquier adorno que sobresalga (anillos, sombras) infla el marco y desalinea tiradores/separadores                                                           |
| **No re-renderizar en un drag** | Re-renderizar un componente mientras Konva arrastra uno de sus nodos lo desmonta y mata el drag (las vistas previas van por refs)                                                                                    |
| **Hooks de QA (solo dev)**      | `__rdlcSelection` (rect en px de papel + zoom), `__rdlcResizeHandle`, `__rdlcTablixSeparator` y `__rdlcStage` (para `getIntersection` y para trazar eventos parcheando `_fireAndBubble`)                             |
