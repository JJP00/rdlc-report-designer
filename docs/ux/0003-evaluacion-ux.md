# Evaluación UX del editor — caminos de fallo y diseño de capas

- **Fecha**: 2026-10-08
- **Método**: evaluación heurística (Nielsen), recorridos cognitivos, escaneo de
  anti-patrones y análisis de éxito de tarea, con el sistema _Intent_
  (`/intent` → `/fortify` → `/evaluate`). Contrasta con `docs/ux/0002-evaluacion-ux.md`.
- **Artefacto evaluado**: código del árbol de trabajo en `main` (commit `f3c19a4`):
  ciclo de vida del documento (`SessionService`, `useDocumentCore`, `main.ts`),
  guardas y diálogos, `ErrorBoundary`, toolbar, barra de estado, atajos y tema; más el
  **diseño** de `docs/features/0001-capas.md`.
- **Evidencia**: lectura de código y análisis de solapes sobre los `.rdlc` del repo
  (script de rectángulos declarados).
- **Lo que NO se evalúa**: la app en ejecución (no hay capturas ni E2E de fallo), usuarios
  reales, lector de pantalla, contraste y foco en tema oscuro, rendimiento percibido con
  informes grandes, el inspector nuevo ni la implementación de capas (no existe).
- **Naturaleza de las cifras**: todas las puntuaciones son **estimaciones de experto**
  sobre revisión estática, no mediciones.

---

## Por qué esta evaluación puntúa más bajo que 0002

0002 dio 86/100 y «ningún P0» tras recorrer la ruta feliz de cada guarda y capturar 8
estados reales, **ninguno de fallo**. Esta evaluación recorre además los caminos de fallo
y encuentra dos P0. La bajada **no es una regresión del producto**: es una medición con
mayor cobertura. La afirmación de 0002 «el trabajo sin guardar ya no se pierde en ningún
camino» **no se sostiene** (P0.1 y P0.2).

---

## Salud UX

**≈ 61 / 100** (rango razonable 55–68)

| Componente           | Resultado                                       | Peso |
| -------------------- | ----------------------------------------------- | ---- |
| Heurísticas (H1–H10) | 19 puntos de severidad / 40 → 52 %              | 50 % |
| Éxito de tarea       | 5 ok · 2 dudas · 3 fallos → ~60 %               | 30 % |
| Anti-patrones        | Sin manipulación; fallos de oficio High → ~85 % | 20 % |

Saltos respecto a 0002: H1 (1→3), H3 (1→3) y H9 (1→3), justo los caminos de fallo.

## Veredicto de anti-patrones

**Sin manipulación.** No hay coerción, valores por defecto en contra del usuario ni
urgencia o escasez falsas. Lo que hay es negligencia (categoría 9 del catálogo):

- **Broken Error Recovery (High)**: conflicto al guardar e interfaz rota.
- **Missing Feedback (High)**: abrir/guardar sin progreso, fichero borrado en silencio,
  título de ventana que nunca marca cambios sin guardar.
- **Dead Ends (Medium)**: «La interfaz ha fallado» sin salida segura.

---

## Hallazgos por prioridad

> **Correspondencia con otros documentos.** Hallazgo 1 = P0.1 = BUG-51 · 2 = P0.2 =
> BUG-52 · 3 = P1.4 = BUG-54 · 4 = P1.3 + P1.5 = BUG-53 + BUG-55 · 5 = P1.7 = BUG-57 ·
> 6 = BUG-58 · 7 = BUG-59 · 8 = P1.6 = BUG-56. Los hallazgos 9–14 solo viven aquí
> (resumidos en `RDLC Report Designer - Pendientes.md`). Detalle técnico y reproducción
> en `docs/bugs/0002-resiliencia-2026-10-08.md`.

### P0 — Crítico

**1. Interfaz rota con trabajo sin guardar** (Dead End, Destructive Default).
`ErrorBoundary` envuelve `<App/>` en `main.tsx`. Al saltar, `App` se desmonta y con él el
listener `onCloseRequested`; `main.ts` hace `preventDefault()` en cada `close` esperando
la respuesta del front, así que la X y Alt+F4 **no hacen nada**. «Recargar»
(`location.reload()`) olvida la sesión en el front mientras el backend la conserva sucia,
huérfana y con su watcher. El bug abierto de `Maximum update depth exceeded` dispara este
camino. El mensaje no dice que el trabajo sigue en memoria.
→ **Ruta:** `/fortify` + `/journey`. Arreglo: temporizador de cierre sin respuesta en main
(diálogo nativo «Cerrar sin guardar / Cancelar»), handlers `render-process-gone` y
`unresponsive`, re-adopción de sesiones vivas tras recargar (mismo mecanismo que la fase A
de pestañas).

**2. Guardar con un conflicto que el watcher no vio** (Broken Error Recovery).
`save` devuelve `E_CONFLICT` (`referenceStillOnDisk`), pero el front no lo trata: banner
de 6 s sin abrir el diálogo. Y «Guardar y sobrescribir» falla igual porque, en este
camino, el backend no adelanta la referencia de disco (sí lo hace `onExternalChange`).
→ **Ruta:** `/fortify`. Arreglo: `E_CONFLICT` → `setConflict(path)` en el front y adelantar
`lastWriteMs/Size` en el backend al rechazar.

### P1 — Mayor

**3. Sin progreso ni protección de doble acción** (Missing Feedback). Abrir, Nuevo y
Guardar no tienen estado «en curso». Doble clic en un reciente deja una **sesión
huérfana con su watcher** (`openPath` captura un `doc` obsoleto). Un doble Ctrl+S puede
dar un falso `E_CONFLICT` en una ventana estrecha. → `/fortify`: bandera `busy`, candado
por sesión en `SessionService`, «Abriendo… / Guardando…» pasados ~300 ms.

**4. Estado de pantalla que deja de ser verdad.** Conflicto obsoleto tras una recarga
externa (el `catch` de `onExternalChange` emite `conflictDetected` aunque no haya cambios
locales y el front nunca limpia `conflict`), y fichero borrado o movido por fuera sin
aviso (el watcher solo escucha `change`/`add`). → `/fortify`.

**5. Errores accionables que caducan a los 6 s** (Broken Error Recovery):
`E_UNSUPPORTED_SCHEMA`, `E_CONFLICT`, `E_IO` al guardar. Solo los errores con detalle de
validación son persistentes. → `/articulate` + `/fortify`.

**6. Jerarquía interna en el estado.** `useDocumentCore` escribe
`Comando 'setStyle' aplicado (v12)` tras cada edición: nombres de comando y versiones sin
significado para el usuario. Es además el único `role="status"` de la app, así que un
lector de pantalla leería cada edición. → `/articulate` + `/include`.

**7. Sin título de ventana dinámico.** No hay `document.title`: ni el nombre del informe
ni el «sin guardar» aparecen en la barra de título o de tareas; el asterisco solo vive en
el pie. Empeora con varias pestañas. → `/organize`.

**8. «Guardar como» deja la sesión inconsistente si falla el watcher.** En `saveAs`,
`filePath` y `originalBytes` ya apuntan al fichero nuevo cuando `fileWatcher.watch` puede
lanzar (fichero escrito, sesión sucia, sin watcher, excepción sin mapear). → `/fortify`.

### P2 — Menor

**9.** Sin hoja de atajos (H7/H10). → `/articulate`.
**10.** Alinear/Distribuir sin etiqueta visible (H6). → `/include`.
**11.** El lienzo no se enfoca con teclado (sin `tabIndex` en los items; solo la regla
lo tiene). Los atajos son globales y la **Jerarquía es la única vía no visual**: hay que
garantizar que lo cubre todo. → `/include`.
**12.** El tema arranca siempre en claro y se persiste solo en `localStorage`; no respeta
`prefers-color-scheme`. → `/include`.

### P3 — Cosmético

**13.** La barra de estado repite la ruta (mensaje y pie). → `/organize`.
**14.** Toolbar saturada y grupo Insertar sin etiqueta. → `/organize`.

---

## Puntuación heurística (0 = sin problemas, 4 = catastrófico)

| #   | Heurística                   | 0002 | Hoy | Hallazgo clave                                                        |
| --- | ---------------------------- | ---- | --- | --------------------------------------------------------------------- |
| H1  | Visibilidad del estado       | 1    | 3   | Sin progreso, título estático, conflicto obsoleto, borrado silencioso |
| H2  | Lenguaje del mundo real      | 1    | 2   | Jerga de comandos en el estado; «Error inesperado»                    |
| H3  | Control y libertad           | 1    | 3   | Undo y guardas excelentes, pero ventana atrapada (P0.1)               |
| H4  | Consistencia y estándares    | 1    | 1   | Diálogos coherentes                                                   |
| H5  | Prevención de errores        | 1    | 2   | XSD antes de escribir, pero sin protección de doble acción            |
| H6  | Reconocer antes que recordar | 1    | 1   | Iconos de alinear sin texto                                           |
| H7  | Flexibilidad y eficiencia    | 1    | 1   | Buenos atajos; faltan referencia y marco de capas                     |
| H8  | Estético y minimalista       | 2    | 2   | Toolbar y estado cargados                                             |
| H9  | Recuperación de errores      | 1    | 3   | Dos callejones sin salida y mensajes efímeros                         |
| H10 | Ayuda y documentación        | 1    | 1   | Textos inline buenos; sin hoja de atajos                              |

**Total: 19 puntos de severidad / 40.**

## Recorridos cognitivos

### «Guardar tras un cambio externo que el watcher no vio» — **Fallo**

| Paso                                   | Q1  | Q2  | Q3  | Q4  |
| -------------------------------------- | --- | --- | --- | --- |
| Pulsa Ctrl+S                           | ✅  | ✅  | ✅  | ✅  |
| Recibe «El fichero cambió… Recarga»    | ✅  | ❌  | ❌  | ✅  |
| Abre el diálogo y pulsa «Sobrescribir» | ✅  | ✅  | ❌  | ❌  |

El aviso sugiere recargar sin ofrecerlo (banner de 6 s, sin diálogo) y la salida declarada
no funciona.

### «Recuperarse tras "La interfaz ha fallado"» — **Fallo**

| Paso                               | Q1  | Q2  | Q3  | Q4  |
| ---------------------------------- | --- | --- | --- | --- |
| Ve la pantalla de error            | ✅  | ✅  | ✅  | ✅  |
| Pulsa «Recargar»                   | ✅  | ✅  | ❌  | ❌  |
| Intenta cerrar la ventana con la X | ✅  | ✅  | ❌  | ❌  |

No sabe que su trabajo sigue en memoria; recarga y ve un editor vacío; la X no responde.

### Cómo se siente el fallo

Una consultora termina una factura a las 17:30, con un cambio de Tablix hecho y sin
guardar. Mueve una tabla anidada y salta «La interfaz ha fallado». Hace clic en la X y no
responde. Recarga y ve el editor vacío. Lo percibe como pérdida de trabajo, aunque el
backend lo conserva. Hay al menos otra versión: quien edita junto a Report Builder y
recibe el banner de 6 s sin poder actuar. Son **dos fallos distintos con el mismo
síntoma** («no sé qué hacer»): no se resuelven con un único mensaje genérico.

## Éxito de tarea (estimado)

| Tarea                                              | Resultado                         |
| -------------------------------------------------- | --------------------------------- |
| Editar y guardar                                   | ✅                                |
| Abrir otro informe con cambios sin guardar         | ✅                                |
| Resolver un cambio externo (detectado por watcher) | ✅                                |
| Editar varios elementos a la vez                   | ✅                                |
| Navegar a un elemento dentro de una celda          | ✅                                |
| Abrir dos veces seguidas                           | ⚠️ sesión huérfana invisible      |
| Trabajar con un fichero tocado por Report Builder  | ⚠️ borrado/movido sin aviso       |
| Resolver un conflicto al guardar                   | ❌                                |
| Recuperarse de un fallo de interfaz                | ❌                                |
| Editar un elemento tapado por otro                 | ❌ (la razón de ser de las capas) |

---

## Hallazgos positivos (proteger)

- **Guardas con consecuencias nombradas** («Guardar y abrir / Abrir sin guardar»), con
  Esc o clic fuera como cancelar y sin pérdida.
- **Undo byte-exacto** con `dirty` recalculado al deshacer.
- **Lote atómico**: alinear/distribuir/estilar varios elementos es un solo undo.
- **Validación XSD antes de escribir** y **escritura atómica** (temporal único + `rename`
  con reintentos en Windows).
- **Jerarquía + breadcrumb** como segunda vía de navegación.
- **Botones de icono con `aria-label` y tooltip** en la toolbar.
- **El journal de undo se descarta** si el documento cambia por fuera (se detecta por
  identidad del documento), así que no se aplican inversos sobre nodos desprendidos.
- **Recientes que se podan solos**: al listar se descartan las rutas que ya no existen y
  se reescribe la lista; un JSON corrupto se trata como lista vacía.
- **Instancia única** (la segunda trae al frente la primera) y **handler de errores del
  watcher**, que evitan que dos procesos pisen el mismo fichero o que un error de
  chokidar tumbe el proceso.

---

## Anexo A — Inventario de estados (abrir / guardar / cerrar)

| Estado                           | Qué ve el usuario hoy                                               | Veredicto                                                                |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Vacío (sin informe)              | Línea de estado «Listo. Abre un informe .rdlc de Business Central…» | Correcto; mejoraría con los recientes visibles en la pantalla vacía (P2) |
| Cargando (abrir, nuevo, guardar) | Nada; solo cambia la línea de estado al terminar                    | **Falta** (BUG-54)                                                       |
| Error de apertura                | Banner rojo que se borra solo a los 6 s                             | Parcial: textos largos accionables desaparecen (BUG-57)                  |
| Conflicto detectado por watcher  | Banner ámbar «Resolver…» + diálogo con 3 salidas                    | Correcto                                                                 |
| Conflicto detectado al guardar   | Banner rojo de 6 s, sin diálogo                                     | **Hueco P0** (BUG-52)                                                    |
| Conflicto obsoleto               | Banner/diálogo que ya no aplican tras una recarga externa           | **Hueco** (BUG-53)                                                       |
| Fallo de render                  | Pantalla «La interfaz ha fallado» con «Recargar»                    | **Hueco P0** (BUG-51)                                                    |
| Fichero borrado por fuera        | Silencio                                                            | **Hueco** (BUG-55)                                                       |
| Sin cambios sin guardar          | `*` solo en el pie                                                  | Parcial (BUG-59)                                                         |

## Anexo B — Pruebas de estrés sobre el código

| Escenario                                         | Resultado                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Doble clic en un reciente                         | **Falla**: sesión huérfana (BUG-54)                                 |
| Doble Ctrl+S                                      | **Riesgo** (falso conflicto, ventana estrecha; no reproducido)      |
| Fichero reescrito por fuera con ediciones locales | Pasa                                                                |
| Fichero reescrito por fuera mientras se guarda    | Pasa (se rechaza y no se pisa), pero el diálogo no se abre (BUG-52) |
| Fichero borrado por fuera                         | **Falla** (BUG-55)                                                  |
| Escritura externa a medias (fichero no parseable) | **Falla**: conflicto obsoleto (BUG-53)                              |
| Fallo de render con trabajo sin guardar           | **Falla** (BUG-51)                                                  |
| XML inválido o RDL 2008                           | Pasa (se rechaza con motivo accionable)                             |
| Guardado que rompería el XSD                      | Pasa (no se escribe)                                                |
| Proceso muerto a mitad de guardado                | Pasa (escritura atómica con temporal único)                         |
| Deshacer hasta el estado original                 | Pasa (`dirty` vuelve a limpio)                                      |

> Resultados por lectura de código, **no ejecutados**.

## Anexo C — Reproducibilidad

El análisis de solapes de la parte 2 se reproduce con
`python docs/ux/tools/overlap-stacks.py <informe.rdlc>` (ver sus limitaciones en la
cabecera del script: usa medidas declaradas y puede infraestimar los solapes de Tablix).

---

# Parte 2 — UX de las capas (evaluación del diseño)

Alcance: `docs/features/0001-capas.md` (estado «propuesto»; no existe `lib/layers.ts` ni
`LayersPanel.tsx`). Se evalúa el **diseño**, no una implementación.

## Salud UX del diseño

**≈ 70 / 100** — heurísticas 16/40 (60 %), éxito de tarea ~70 % estimado, anti-patrones
limpio. Es un diseño sólido en lo técnico (no toca el `.rdlc`, no cambia el render, Fase 1
testeable de forma aislada) con fallos de **descubrimiento y de modo**.

## Heurísticas

| #   | Heurística                   | Pts | Hallazgo                                                                                                                                                                  |
| --- | ---------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Visibilidad del estado       | 1   | El chip «Capa: X ×» da visibilidad del modo                                                                                                                               |
| H2  | Lenguaje del mundo real      | 2   | Se llama «capas» a lo que son **solapes inferidos**; quien viene de Figma/Photoshop espera crear, nombrar y reordenar (eso es la Fase 2). Entradas llamadas `Tablix1/3/4` |
| H3  | Control y libertad           | 1   | Salir del modo es barato                                                                                                                                                  |
| H4  | Consistencia                 | 2   | `Esc` hace dos cosas (sube al padre con selección; sale del modo capa sin ella): modo invisible con una tecla ambigua                                                     |
| H5  | Prevención de errores        | 1   | Atenuar comunica el filtro                                                                                                                                                |
| H6  | Reconocer antes que recordar | 3   | **`Alt+clic` es la única vía y no tiene ninguna pista visible**: el usuario ve que el clic coge «lo equivocado» y no sabe que existe el ciclo                             |
| H7  | Flexibilidad y eficiencia    | 0   | `Alt+clic` es un buen acelerador para el experto                                                                                                                          |
| H8  | Estético y minimalista       | 2   | El panel lista todas las pilas sin distinguir importancia (ver evidencia)                                                                                                 |
| H9  | Recuperación de errores      | 2   | «Insertar fuera de la capa activa se ignora con aviso en la barra de estado» es un fallo silencioso                                                                       |
| H10 | Ayuda y documentación        | 2   | Sin onboarding del gesto ni entrada en la hoja de atajos (que tampoco existe)                                                                                             |

## Evidencia sobre los `.rdlc` del repo

Análisis de solapes entre hermanos de un mismo contenedor, con los rectángulos
**declarados** (`Left/Top/Width/Height`):

| Fichero              | Pilas medidas                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `SalesInvoiceESP`    | `LinesTable` (z 0) ↔ `LinesTable2` (z 5) dentro de `Tablix2`; `Rectangle1`↔`Textbox2`; `Textbox113`↔`116`; `Textbox19`↔`20` |
| `SalesInvoiceDEU`    | Igual que ESP (z 1 y 6)                                                                                                     |
| `SalesCreditMemoESP` | `LinesTable` (z 1) ↔ `LinesTable2` (z 6); dos pares de textboxes; `Textbox19`↔`20`                                          |
| `SalesShipment`      | Una pila de **3** textboxes (`Textbox120/121/124`) y varias parejas de textboxes                                            |
| `BTCLoadingOrder`    | Ninguna                                                                                                                     |

Lectura:

- **El caso real se confirma**: la pareja `LinesTable`/`LinesTable2` solapa en las
  facturas y las notas de abono.
- **El riesgo de «cadenas» no se confirma**: todas las pilas medidas son de 2–3 miembros,
  no los cinco `Tablix` del diseño.
- **Hay ruido en el panel**: la mayoría de pilas son textbox sobre textbox o rectángulo +
  textbox (etiqueta y valor, fondos), 3–6 por informe, que compiten con la pareja de
  tablas.
- **Caveat**: el análisis usa las medidas declaradas, y el diseño usa `tablixLayout` (el
  tamaño real de un Tablix crece con sus filas), así que puede **infraestimar** los
  solapes de Tablix. Verificar con la implementación real.

## Recorridos

| Tarea                                                 | Resultado                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Editar `LinesTable` tapada por `LinesTable2`          | **Duda** para quien conoce `Alt+clic`; **Fallo** (Q2 visibilidad) para quien no |
| Mover/editar un elemento de una pila solo con teclado | **Fallo** (sin equivalente)                                                     |
| Salir del modo capa                                   | Pasa (chip, fila «Todas las capas»), pero `Esc` es ambiguo                      |
| Insertar con el modo activo, fuera de la capa         | **Duda**: se ignora con aviso en la barra de estado                             |

## Cambios propuestos al diseño antes de escribir código

Ruta: `/journey` (flujo), `/include` (teclado y roles), `/articulate` (nombres).

1. **Descubrimiento**: al pasar el cursor sobre un punto con pila, chip «N elementos aquí ·
   Alt+clic para rotar» y entrada **«Seleccionar el de debajo»** en el menú contextual
   (alternativa sin teclas modificadoras).
2. **Salida del modo**: el chip de la barra de estado es la salida principal; `Esc` no
   cambia de modo.
3. **Inserción fuera de la capa**: redirigir al contenedor de la capa o avisar junto al
   cursor; nunca ignorar en silencio.
4. **Panel**: ordenar por relevancia (tablas primero), colapsar las pilas de textboxes y
   rotular con el `Name` más un descriptor del contenido, no solo `TablixN`.
5. **Lenguaje**: llamarlas «Elementos solapados» en la Fase 1 y reservar «Capas» para las
   manuales con nombre de la Fase 2.
6. **Teclado/roles**: panel operable con teclado y rotación por atajo.
7. **Verificar** el comportamiento de `Alt` en Electron/Windows antes de fijar el gesto
   (**no verificado**).
8. **Alternativa más barata a valorar**: «Seleccionar el de debajo» + `Alt+clic` cubren el
   caso de la factura **sin panel ni modo**. El panel y el filtro de interacción solo se
   justifican si hay más casos que la pareja `LinesTable`/`LinesTable2`. **Decisión del
   usuario.**

Además: `activeLayerId`/`showLayers` están pensados como estado global de `App`; con la
fase de pestañas deben vivir **por pestaña**.

---

## Acciones recomendadas (enrutadas)

| Skill         | Hallazgos        | Notas                                                                          |
| ------------- | ---------------- | ------------------------------------------------------------------------------ |
| `/fortify`    | 1, 2, 3, 4, 5, 8 | **Primero**: los P0 se corrigen sin esperar a nada más                         |
| `/articulate` | 5, 6, 9          | Mensajes persistentes y accionables; texto de usuario en lugar de «Comando 'x» |
| `/organize`   | 7, 13, 14        | Título dinámico con asterisco; toolbar y barra de estado                       |
| `/include`    | 6, 10, 11, 12    | Lienzo y capas con teclado; `aria-live` más sobrio                             |
| `/journey`    | 1 + capas 1–8    | Recuperación tras fallo y rediseño de capas **antes** de implementar           |
| `/measure`    | —                | Instrumentación local opt-in de conflictos y cierres con cambios               |

**Orden**: P0.2 + P1.3 + P1.4 (cambios pequeños, un test unitario cada uno) → fase de
pestañas A–B junto con P0.1 → pestañas C–E → rediseño e implementación de capas → UX
P2/P3 de 0002 → T4, T5 y CI.

**Criterio de salida**: repetir esta evaluación **ejecutando la app** (E2E con
`render-process-gone` simulado y un conflicto no detectado) sin ningún P0.

**Pendiente de evidencia del usuario**: ¿se ha perdido trabajo alguna vez o se ha visto
«La interfaz ha fallado»? ¿Con qué frecuencia hay conflictos con Report Builder? Sin
esos datos el orden entre P0 y capas es juicio, no medición.
