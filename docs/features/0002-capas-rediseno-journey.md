# Capas → «Elementos solapados» — rediseño del recorrido (`/journey`)

- **Fecha**: 2026-10-08
- **Estado**: propuesta de rediseño. **No sustituye** a `0001-capas.md` (trabajo del usuario, sin tocar): lo corrige en Fase 1 y deja la Fase 2 como estaba.
- **Origen**: `docs/ux/0003-evaluacion-ux.md` Parte 2 (≈ 70/100; H6 = 3, H2/H4/H8/H9/H10 = 2).
- **Alcance elegido**: **por niveles**. Nivel 1 barato (sin panel ni modo); Nivel 2 (panel + modo) solo si Nivel 1 no basta.
- **Diagrama**: `0002-capas-rediseno-journey.html` (3 flujos).
- **Naturaleza de las cifras**: pasos y puntuaciones son estimaciones de diseño; nada probado en la app.

## 1. Problema

El protagonista es quien mantiene los layouts de factura de BC. Quiere **editar `LinesTable`**, que está tapada por `LinesTable2` (caso verificado en `SalesInvoiceESP/DEU` y `SalesCreditMemoESP`, ver script `docs/ux/tools/overlap-stacks.py`). Hoy el clic siempre coge el de arriba y la única salida es mover físicamente la tabla de encima, editar y devolverla.

El diseño de 0001 resuelve la mecánica, pero falla en tres sitios donde el usuario se rompe: **no descubre el gesto** (H6), **no sabe en qué modo está** (H4/H9) y **no hay vía sin ratón** (H7/a11y).

**Métrica de éxito**: editar un elemento tapado sin mover nada, en ≤ 3 acciones, sin haber leído documentación, y también solo con teclado.

## 2. Usuarios: tres caminos que no se mezclan

No se suavizan en un único arco: fallan en sitios distintos.

| Camino | Contexto | Dónde se rompe hoy (0001) | Qué lo arregla |
| --- | --- | --- | --- |
| **A · No conoce el gesto** (novato en el editor) | Clica, coge «lo equivocado», cree que la tabla no es editable o que hay un bug | Q2 visibilidad: nada le dice que hay algo debajo | Insignia en la selección + menú contextual |
| **B · Experto / viene de Figma** | Prueba `Alt+clic` por instinto | Espera «capas» con nombre y reordenar; encuentra solapes inferidos | Lenguaje «Elementos solapados»; «Capas» reservado a Fase 2 |
| **C · Solo teclado / lector de pantalla** | Llega por Jerarquía; no hay equivalente | Fallo total: no puede alcanzar el elemento tapado | `Alt+↓/↑` sobre la selección + anuncio |

Variaciones de entrada: clic en el lienzo (A, B), Jerarquía/breadcrumb (C), menú contextual (A sin modificadores). Dispositivo: solo escritorio (Electron/Windows); sin variante móvil.

## 3. Principios del rediseño

1. **Nivel 1 sin modo.** Rotar la selección es una acción puntual, no un estado. Sin modo no hay salida que explicar ni `Esc` ambiguo.
2. **Descubrir en el momento de necesidad**, no por hover permanente: la insignia aparece **al seleccionar** algo con elementos debajo en ese punto. Evita el ruido de las parejas etiqueta/valor, que son las pilas más frecuentes (3–6 por informe).
3. **Tres vías equivalentes** para la misma acción: ratón con modificador, menú contextual y teclado. `Alt+clic` es el acelerador, no la única puerta.
4. **Nunca fallar en silencio.**
5. **El lenguaje dice lo que es**: son solapes inferidos, no capas del usuario.

## 4. Nivel 1 — «Seleccionar el de debajo» (Fase 1 base)

No toca el `.rdlc`, el documento del backend ni `ZIndex`. Reutiliza `stackAtPoint` y `nextInCycle` de `lib/layers.ts` (0001 §3.1); **desaparecen** `activeLayerId`, el filtro de `hit.ts`, el atenuado, `useMarqueeSelection` filtrado, el panel y el chip.

### 4.1 Flujo A — descubrir y rotar con ratón (camino A y B)

| Paso | Usuario | Sistema | Por qué existe |
| --- | --- | --- | --- |
| 0 | Quiere editar `LinesTable` | — | Objetivo |
| 1 | Clic sobre la tabla | Selecciona `LinesTable2` (la de arriba), como hoy | Sin cambio de comportamiento («nothing breaks») |
| 2 | Ve la insignia junto al marco: **«1 de 2 · Alt+clic»** | La insignia solo sale si hay ≥ 2 miembros en la pila bajo el punto del clic | Responde a la pregunta Q2 justo cuando la necesita |
| 3 | `Alt+clic` en el mismo punto | Pasa al siguiente miembro con wrap; insignia **«2 de 2»**; anuncia el nombre | Gesto estándar Figma/PowerPoint |
| 4 | Edita (inspector, arrastre, teclas) | Selección normal, sin modo | — |

Detalles:

- La insignia vive en el marco de selección (no sigue al cursor, no tapa contenido) y desaparece al cambiar de selección o clicar en vacío.
- Si el punto cambia (clic en otro sitio), se recalcula la pila; el ciclo es **por punto**.
- **Mover un item tapado ya seleccionado**: arrastrar desde el cuerpo del marco (0001 §3.3, «recomendado» → aquí **obligatorio** en Nivel 1: sin él, seleccionar el de debajo y no poder moverlo es un callejón).

### 4.2 Flujo B — menú contextual (camino A sin modificadores)

Clic derecho sobre un punto con pila:

- **«Seleccionar el de debajo»** y **«Seleccionar el de encima»** (deshabilitado en los extremos, no oculto).
- Submenú **«Elementos aquí (2)»** con `Name` + descriptor; elegir uno lo selecciona directamente.

Para el caso de la factura son **2 acciones** (clic derecho → elegir), sin conocer ningún gesto.

### 4.3 Flujo C — teclado y lector de pantalla (camino C)

- Con un elemento seleccionado (por clic, Jerarquía o breadcrumb): **`Alt+↓`** selecciona el de debajo y **`Alt+↑`** el de encima **dentro de la pila de la selección** (hermanos que solapan con ella, ordenados por z). Es por selección, no por punto, porque el teclado no tiene punto.
- Anuncio `aria-live="polite"` **solo en esta acción**: «Seleccionado LinesTable, 2 de 2 elementos solapados». Es el único mensaje de la barra de estado que merece anunciarse (compatible con BUG-58: los mensajes rutinarios dejan de anunciarse).
- Si no hay pila: aviso breve «No hay elementos solapados con este», nunca silencio.
- La Jerarquía sigue siendo la vía no visual de **llegada** (hasta que el lienzo sea enfocable, P2 #11 de 0003).

### 4.4 Ayuda

- Entrada «Seleccionar el de debajo / de encima — Alt+clic, Alt+↓/↑» en la hoja de atajos (pendiente de crear, P2): este diseño es una razón más para hacerla.
- Sin tour ni modal: la insignia es el onboarding.

## 5. Nivel 2 — panel «Elementos solapados» + modo «Editar solo esto» (condicional)

**Se construye solo si** tras Nivel 1 hay evidencia de más casos que la pareja `LinesTable`/`LinesTable2` (ver §8). Son las correcciones de 0003 sobre 0001 §3.2–3.5.

| Tema | 0001 | Rediseño |
| --- | --- | --- |
| Nombre | «Capas» | **«Elementos solapados»**; «Capas» queda para las manuales con nombre de la Fase 2 |
| Salida del modo | fila «Todas», chip y **`Esc` sin selección** | **Chip = salida principal** (botón enfocable, «Editando solo: LinesTable ×»), fila «Ver todo» y comando de paleta. **`Esc` nunca cambia de modo** (sigue subiendo al padre / deseleccionando) |
| Insertar fuera de la capa | se ignora con aviso en la barra | **Se redirige**: se inserta en el contenedor de la pila activa, con aviso junto al elemento creado («Insertado en Rectangle2»). El drop fuera hace lo mismo. Nunca se ignora |
| Panel | todas las pilas, mismo peso | **Orden por relevancia**: primero pilas con tabla o rectángulo; las de textos (etiqueta/valor) **colapsadas** en «N pares de textos». Rótulo = `Name` + descriptor (tabla: dataset o primera cabecera; textbox: primeros ~20 caracteres) |
| Teclado/roles | no especificado | Panel como árbol (`role="tree"`, roving tabindex, mismas teclas que Jerarquía); entrar/salir del modo con atajo propio, no `Esc` |
| Estado | `activeLayerId`/`showLayers` en `App` | **Por pestaña**: hook `useOverlapMode(sessionId)` desde el primer día; se limpia al cerrar la pestaña, y si undo/recarga externa elimina el item |
| Atenuado | por defecto ON | Se mantiene ON (comunica el filtro); decidir tras probar |

El Nivel 2 **reutiliza** todo el Nivel 1: la rotación sigue funcionando dentro del modo y es la forma de entrar en él (Alt+clic puede, opcionalmente, activar el modo, como en 0001).

## 6. Copy (para `/articulate`)

| Dónde | Texto propuesto |
| --- | --- |
| Insignia | «1 de 2 · Alt+clic» (tooltip: «Hay otro elemento debajo. Alt+clic o Alt+↓ para seleccionarlo») |
| Menú | «Seleccionar el de debajo» · «Seleccionar el de encima» · «Elementos aquí (2)» |
| Anuncio | «Seleccionado LinesTable, 2 de 2 elementos solapados» |
| Sin pila | «No hay elementos solapados con este» |
| Nivel 2 · chip | «Editando solo: LinesTable ×» |
| Nivel 2 · panel vacío | «No hay elementos solapados en este informe» |
| Nivel 2 · inserción | «Insertado en Rectangle2 (fuera de LinesTable)» |

## 7. Especificación de interacción

- **Rotación**: ciclo con wrap, un cambio de selección = un paso de selección, **no entra en el undo** (no muta el documento).
- **`Alt` en Electron/Windows**: pulsar y soltar `Alt` solo puede enfocar la barra de menús. **No verificado**: hay que comprobar que `Alt+clic` y `Alt+↓/↑` no la activan ni abren un menú. Si fallan, las vías de menú contextual y atajo alternativo mantienen el diseño en pie; es la razón de no depender de una sola.
- **Medición de pila**: `stackAtPoint` debe usar `tablixLayout` (tamaño real), no las medidas declaradas, o infraestimará los solapes de Tablix (caveat de 0003).
- **Reducción de movimiento**: la insignia aparece sin animación; no hay motion que especificar.
- **Foco**: tras rotar con teclado el foco no se mueve; solo cambia la selección.

## 8. Métricas y criterios de decisión Nivel 1 → Nivel 2

Instrumentación local opt-in (`/measure`), sin telemetría externa:

| Señal | Qué dice |
| --- | --- |
| Veces que se usa «Seleccionar el de debajo» por vía (Alt+clic / menú / teclado) | Qué puerta se usa de verdad |
| Rotaciones seguidas > 2 en el mismo punto | Pilas de 3+: el ciclo se queda corto |
| Ediciones/movimientos tras rotar vs. abandono (rota y deselecciona) | Si la insignia basta |
| Informes del corpus con pilas que no son la pareja de tablas (script) | ¿Hay más casos que justifiquen panel y modo? |

**Criterio**: pasar a Nivel 2 si hay uso repetido de pilas de 3+ o casos reales fuera de `LinesTable`/`LinesTable2`; si no, Nivel 1 cierra Fase 1.

## 9. Spikes antes de implementar

1. Verificar `Alt+clic` y `Alt+↓/↑` en la app real (Electron/Windows).
2. Calcular las pilas de las facturas con `tablixLayout` y compararlas con el script (¿aparecen solapes nuevos o cadenas?).
3. Comprobar que arrastrar desde el cuerpo del marco mueve un item tapado sin que el hit-test lo robe el de encima.

## 10. Preguntas abiertas y delegación

- **`/articulate`**: revisar textos de §6; ¿«solapados» o «superpuestos»?
- **`/include`**: roles y anuncios de §4.3 y §5; encaje con el lienzo no enfocable (P2 #11).
- **`/fortify`**: pilas con items `Hidden`/`unknown`, pila que desaparece tras undo con la insignia visible, redirección de inserción en contenedores no insertables (celda de Tablix).
- **`/specify`**: atajo del modo (Nivel 2) y fusión con la hoja de atajos.
- **Decisión del usuario**: confirmar que Nivel 1 se implementa primero y que Nivel 2 queda condicionado a §8.
- **Fase 2** (capas manuales con nombre y `CustomProperties`): sin cambios respecto a 0001 §4; solo hereda el nombre «Capas».

## 11. Impacto en el plan de 0001 §5

1. `lib/layers.ts` + `layers.spec.ts` (sin cambios; añadir pila por selección para el teclado).
2. **Nuevo orden**: insignia + `Alt+clic` + menú contextual + `Alt+↓/↑` + mover desde el marco + E2E de factura.
3. *(Condicional)* panel, modo, filtro de hit-test, chip y redirección de inserción.
4. *(Fase 2)* sin cambios.

Archivos Nivel 1: `lib/layers.ts` (nuevo), `components/canvas/SelectionFrame.tsx` (insignia y arrastre desde el cuerpo), `components/canvas/NodeGroup` (`altKey`), menú contextual del lienzo, `hooks/useEditorKeys.ts`, `components/StatusBar.tsx` (anuncio). Se **evitan** en Nivel 1: `hit.ts`, `ItemView`, `Paper`, `useMarqueeSelection`, `LeftPanels`, `EditorToolbar`, `App`.
