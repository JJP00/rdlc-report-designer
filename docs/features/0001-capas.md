# Capas — edición de elementos solapados

- **Fecha**: 2026-09-30
- **Estado**: propuesto (pendiente de implementación)
- **Ámbito**: Fase 1 solo frontend (capa de UI, no toca el `.rdlc`); Fase 2 toca `contracts` + backend (`CustomProperties` opt-in).

## 1. El problema

### 1.1 Contexto

En un `.rdlc` los items de un contenedor se apilan por `ZIndex` y, a igualdad, por el
orden del XML. El lienzo respeta ese orden para pintar y para el hit-test
(`sortByZIndex`), igual que el render de Business Central.

Cuando dos items se **solapan**, el clic (y el menú contextual, y el drop) eligen
siempre el de arriba. Para editar el de debajo hay que **mover físicamente** el de
arriba, editar, y volver a colocarlo. El Report Builder de Microsoft no tiene ningún
concepto de capas ni de click-through que evite ese ida y vuelta.

El problema es especialmente doloroso en la **factura**: en la tabla de líneas hay
dos tablas una encima de otra, la de artículos y la de servicios.

### 1.2 Caso real verificado (`SalesInvoiceESP.rdlc`)

```
Body
└── Tablix2                        (item de primer nivel del body)
    └── (celda) → Rectangle2
        ├── Tablix LinesTable      ← mercancías/artículos
        ├── Tablix Tablix3
        ├── Tablix Tablix4
        ├── Tablix Tablix7
        ├── Tablix Tablix1
        ├── Tablix LinesTable2     ← servicios
        ├── Rectangle BTC_Header_Carrier
        └── Tablix Tablix6
```

Conclusión clave: los solapes ocurren **entre hermanos del mismo contenedor**, a
cualquier profundidad — no solo entre los items de primer nivel de la banda. Cualquier
solución debe funcionar en ese ámbito (el `Rectangle2` está dentro de una celda de un
`Tablix`, no en el body directamente).

### 1.3 Restricciones del proyecto

- **El render de BC no puede cambiar**: las capas son una ayuda de edición, no una
  propiedad visual del informe. `ZIndex` es semántico (orden de apilado real) y no se
  toca.
- **El `.rdlc` es la fuente de verdad** (lossless, round-trip byte-exacto y validación
  XSD oficial al guardar). La Fase 1 no modifica ni un nodo.
- **Ciclo de vida en BC**: un layout subido/descargado de BC se conserva tal cual, pero
  uno **regenerado desde AL** (`RDLCLayout` embebido) pierde cualquier metadato añadido.
- **Nothing breaks**: sin capas activas, el editor debe comportarse exactamente como hoy.

## 2. Opciones consideradas y decisión

### 2.1 ¿Dónde podría guardarse una capa dentro del `.rdlc`?

| Opción                                                       | Veredicto                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ZIndex`** (reutilizarlo como "nº de capa")                | ❌ Descartado: es el orden de apilado real del render; codificar capas ahí cambiaría el dibujado en BC y ya lo usan «Traer al frente / Enviar atrás». |
| **`Name` / `rd:DefaultName`**                                | ❌ Descartado: es la clave del índice y de las expresiones (`ReportItems!X`).                                                                         |
| **Atributos/comentarios inventados**                         | ❌ Descartado: rompen el XSD o cualquier reserialización.                                                                                             |
| **`CustomProperties`**                                       | ✅ Válido y elegido (ver 2.2).                                                                                                                        |
| **Sidecar** (`X.rdlc.designer.json`) o almacén en `userData` | 🔶 Alternativa razonable, descartada por ahora: añade ciclo de vida (saveAs, borrado, conflictos) y no viaja con el fichero.                          |

### 2.2 `CustomProperties`: la única vía schema-valid (verificado en el XSD del repo)

En `apps/back/resources/rdl2016/ReportDefinition2016.xsd`:

- `CustomProperties` es válido en **cualquier `ReportItem`** (bloque
  `ReportItemTypeStart/End`: Textbox, Tablix, Rectangle, Image…) y también en
  **`<Report>`** raíz.
- El tipo (`CustomPropertiesType`) son pares `Name`/`Value` string; los renderers lo
  ignoran por especificación y Report Builder lo preserva al re-guardar.
- `geometry.ts` ya incluye `CustomProperties` en el orden canónico de `<Report>`
  (`REPORT_ORDER`), así que insertar el nodo raíz es casi gratis.

Dos variantes posibles:

**A · Un nodo por item asignado** (con herencia: los hijos cuelgan del ancestro):

```xml
<CustomProperties>
  <CustomProperty><Name>_Designer.Layer</Name><Value>Servicios</Value></CustomProperty>
</CustomProperties>
```

En la factura serían **2 nodos** en todo el fichero (`LinesTable`, `LinesTable2`).
Requiere añadir `CustomProperties` al orden canónico de item + un comando de
propiedad custom. Contra: ensucia ligeramente los items.

**B · Un nodo único en `<Report>`** con el mapa completo como JSON:

```xml
<CustomProperties>
  <CustomProperty>
    <Name>rdlcDesigner.layers</Name>
    <Value>{"layers":[{"id":"l1","name":"Mercancías"}],"assign":{"LinesTable":"l1"}}</Value>
  </CustomProperty>
</CustomProperties>
```

**Un solo nodo**, no toca items, y el hueco canónico ya está en `REPORT_ORDER`.
Contra: las claves son los `Name` de los items (un rename los deja huérfanos; se
ignoran con elegancia y el rename puede reescribir el mapa en el mismo `batch`).

**Decisión**: variante **B**, **opt-in** (solo si el usuario activa «Guardar capas en
el fichero»). Fase 2.

### 2.3 ¿Y si las capas se **infieren** sin guardar nada?

La información que necesita una capa ya está en el documento: **estructura + `ZIndex`**.
Como el solape solo compite entre hermanos del mismo contenedor, se pueden **derivar**
las pilas de solapes de la proyección en cualquier momento:

- **Capas derivadas de la pila de solapes**: por cada contenedor (bandas, hijos de
  `Rectangle`, contenido de celdas de `Tablix`), componentes conexas por intersección de
  rectángulos entre hermanos. En la factura produce exactamente las entradas
  `LinesTable`, `LinesTable2`, `Tablix1/3/4/6/7`… ordenadas de frente a fondo.
- **Click-through con `Alt+clic`**: clic normal coge el de arriba; `Alt+clic` rota por
  los miembros de la pila bajo el cursor y **activa esa capa**, de modo que a partir de
  ahí se clica dentro con normalidad. Es el patrón de Figma/PowerPoint y resuelve el
  gesto exacto del caso factura.
- **Aislar («solo esto»)**: derivar una capa temporal de la selección (atenuar y
  desactivar el resto).

Ventaja: **cero configuración, cero metadatos, imposible desincronizarse** con el
fichero. Las capas manuales con nombre solo aportan si quieres que la organización
sobreviva al cierre o agrupar items que no se solapan.

### 2.4 Decisión

1. **Base (Fase 1, sin tocar el `.rdlc`)**: capas **inferidas de solapes** +
   **click-through** (`Alt+clic`) + panel de Capas.
2. **Fase 2 (opcional, cuando interese)**: capas **manuales con nombre** (promover una
   pila a capa) con persistencia **opt-in** vía `CustomProperties` (variante B).

## 3. Diseño — Fase 1

### 3.1 Modelo derivado (`apps/front/src/lib/layers.ts` + spec)

Lógica pura y testeable, al estilo de `hit.ts`/`tablix.ts`:

- `overlapStacks(projection): LayerStack[]` — recorre contenedores (bandas, hijos de
  `Rectangle`, contenido/cabeceras/esquinas de celdas de `Tablix`), calcula componentes
  conexas por solape de rects (tamaño del Tablix vía `tablixLayout`, como hace
  `contains` en `hit.ts`) y devuelve las pilas con ≥ 2 miembros. Cada pila lleva:
  - `containerId` y etiqueta legible («Rectangle2 · dentro de Tablix2»),
  - `members` ordenados de frente a fondo (`sortByZIndex`).
- `stackAtPoint(projection, point)` — pila bajo un punto (para `Alt+clic`).
- `nextInCycle(stack, currentId)` — siguiente miembro con wrap.
- `isInSubtree(projection, ancestorId, id)` — pertenencia a la capa (usa
  `findParentItemId`/`findItemScope` existentes).

Sin estado persistido: todo se `useMemo` sobre la proyección.

### 3.2 Estado de UI

- `activeLayerId: string | null` + `showLayers` en `App.tsx` (mismo patrón que
  `showHierarchy`). Es estado de UI, nunca del documento.
- Se limpia al abrir/cerrar documento y si undo / recarga externa eliminan el item.
- Activar: clic en el panel, `Alt+clic`, y «Editar solo esto» en el menú contextual
  (opcional).
- Salir: fila «Todas las capas» del panel, chip del status bar, `Esc` sin selección.
  Navegar desde Jerarquía/paleta desactiva el modo (navegación explícita).

### 3.3 Filtro de interacción en el lienzo

| Punto                            | Cambio                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/hit.ts` (`hitTestItems`)    | Nuevo parámetro de filtro: ignora candidatos fuera del subárbol activo, pero **sigue recursando** (el contenido de la capa activa es alcanzable). Afecta menú contextual y drop. |
| `ItemView` / `Paper`             | Prop `interactive`: fuera de la capa → `listening={false}`, `draggable={false}` y atenuado (~0.3, combinado con `Hidden`).                                                       |
| `useMarqueeSelection`            | Solo adopta ids del subárbol activo.                                                                                                                                             |
| `NodeGroup.onClick` con `altKey` | Resuelve `stackAtPoint`, pasa al siguiente miembro (con wrap) respecto al actual y **activa esa capa + la selecciona**. Sin pila bajo el punto → clic normal.                    |
| `SelectionFrame`                 | Sin cambios (el seleccionado siempre está en la capa). Recomendado: arrastrar desde el centro del marco para mover un item tapado ya seleccionado.                               |

### 3.4 Panel y chrome

- `LayersPanel.tsx` (izquierda, estilo `HierarchyPanel`): grupos por contenedor,
  miembros de frente a fondo con icono por tipo + `Name`, la capa activa resaltada,
  fila «Todas las capas» y estado vacío («No hay elementos solapados»). Switch
  «Atenuar el resto» (por defecto ON: comunica qué es click-through).
- Toggle en `EditorToolbar` (junto a Jerarquía/Variables) y chip en `StatusBar`:
  «Capa: LinesTable ×».

### 3.5 Casos límite

- Insertar/drop en modo capa: dentro del subárbol activo funciona igual que hoy;
  fuera, se ignora con aviso en el status bar.
- `Esc` con selección mantiene el comportamiento actual (sube al padre); sin selección,
  sale del modo capa.
- Items `Hidden` y `unknown`: trato normal (atenuado ya existente, multiplicado).
- Pilas anidadas (una capa contiene a su vez otra pila): cubierto por el filtro de
  subárbol; el panel lista ambas.
- Contención padre/hijo (no hermanos) no genera pila: el hijo ya está encima y es
  alcanzable.

### 3.6 Verificación

- **Unit** (`vitest`): `layers.spec.ts` (solapes, anidamiento, orden z, ciclo,
  subárbol) y filtro nuevo en `hit.spec.ts`.
- **E2E** (Playwright, sobre fixture de factura con solape): activar la capa
  `LinesTable` → clicar dentro edita su contenido y no `LinesTable2`; arrastrar dentro;
  salir con `Esc`. Gancho QA `__rdlcLayer` si hiciera falta.

## 4. Fase 2 — capas manuales + persistencia opt-in

- **Promover a capa con nombre** desde el panel: asignar items (una pila o una
  selección) a capas manuales; nombre editable; el orden del panel es cosmético (no
  toca `ZIndex`).
- **Persistencia**: un nodo raíz `CustomProperties` (variante B) con el mapa
  `{ layers, assign }` en JSON.
  - Contrato: comando `setReportLayers { map | null }` (`null` = quitar el nodo) con
    **inverso byte-exacto**; zod en `packages/contracts`.
  - Backend: el nodo se inserta en su posición canónica (`REPORT_ORDER` ya lo tiene);
    `ProjectionService` expone `meta.layers`; entradas huérfanas (item renombrado o
    borrado) se ignoran al proyectar.
  - Renames: el front reescribe el mapa en el mismo `batch` que `setItemName` para que
    undo/redo quede atómico.
- **Opt-in**: switch «Guardar capas en el fichero» en el panel (por defecto OFF). Con
  OFF, las capas manuales viven solo en la sesión.
- **Caveat BC documentado**: sobrevive a subir/descargar el layout y a Report Builder;
  se pierde si el layout se regenera desde AL (`RDLCLayout` embebido).

## 5. Plan de implementación (orden sugerido)

1. `apps/front/src/lib/layers.ts` + `layers.spec.ts` (modelo derivado puro).
2. Estado de UI + filtro en `hit.ts` / `ItemView` / `Paper` / `useMarqueeSelection` +
   `LayersPanel` + toggle + chip + `Esc`.
3. `Alt+clic` + menú contextual + E2E.
4. _(Fase 2)_ contrato + comando backend + proyección + persistencia opt-in.

Archivos previstos (Fase 1): `lib/layers.ts` (nuevo), `components/panels/LayersPanel.tsx`
(nuevo), `lib/hit.ts`, `components/canvas/{ItemView,Paper,CanvasPreview}.tsx`,
`components/canvas/useMarqueeSelection.ts`, `components/CanvasArea.tsx`,
`components/LeftPanels.tsx`, `components/EditorToolbar.tsx`, `components/StatusBar.tsx`,
`hooks/{useItemEditing,useEditorKeys}.ts`, `App.tsx`.

## 6. Riesgos y decisiones abiertas

- **Atenuado por defecto**: ON comunica el filtro, OFF mantiene la vista fiel. Decidir
  tras probar en la app.
- **Gesto del ciclo**: `Alt+clic` (Figma/PowerPoint) vs. repetir clic sobre el mismo
  punto vs. atajo de teclado. `Alt+clic` es el estándar y el más barato.
- **Insertar fuera de la capa activa**: ignorar (propuesto) vs. redirigir al contenedor
  de la capa.
- **`CustomProperties` en BC**: válido por XSD y preservado por Report Builder, pero se
  pierde si el layout se regenera desde AL. Es opt-in precisamente por eso.

## 7. Lo que NO se toca

- `ZIndex` ni `Name` (semánticos: render e índice/expresiones).
- El documento del backend en Fase 1 (las capas son proyección + estado de UI).
- El render de BC: las capas no cambian lo que se imprime.
