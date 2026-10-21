# Guía de microcopy — voz, presupuestos y anti-patrones

- **Fecha**: 2026-10-20
- **Estado**: guía vigente; aplicación pendiente (barrido por módulo dentro de la [fase 1 de i18n](../features/0005-i18n.md))
- **Origen**: auditoría `/articulate` sobre los textos de UI (sesión 2026-10-20), a partir de capturas reales de la app.
- **Ámbito**: textos de UI (paneles, tooltips, diálogos, pie, mensajes de estado). Los mensajes de error de recuperación están protegidos (§6).

## Voz y tono

- **Profesional y directa.** ES mantiene el tuteo actual (coherente con VS Code ES); EN usa el registro Microsoft/VS Code.
- **Regla madre**: la cantidad correcta de información es exactamente la que el usuario necesita en ese momento — ni más ni menos.
- **No narrar lo que la UI ya muestra.** Si es una acción, que sea un botón (no prosa que la describa). Si es una restricción, una línea que la diga — sin justificarla.

## Presupuesto por superficie

| Superficie        | Presupuesto              | Regla                                                                 |
| ----------------- | ------------------------ | --------------------------------------------------------------------- |
| Etiqueta / sección | ≤ 30 caracteres          | sintagma nominal, sin frases                                          |
| Tooltip           | ≤ 100 caracteres         | solo contexto que la etiqueta no da; nunca instrucciones              |
| Nota de panel     | ≤ 90 caracteres, 1 línea | solo estado o restricción no obvia; sin justificar, sin tutorial      |
| Badge             | ≤ 30 caracteres          | plurales reales (ICU), sin «(s)», sin abreviar («párr.»)              |
| Estado vacío      | 1–2 líneas + acción      | por qué está vacío + qué hacer                                        |
| Error             | sin límite               | problema + arreglo — **nunca recortar la recuperación**               |
| Detalle de diálogo | ≤ 140 caracteres        | no repetir lo que ya dicen los botones                                |
| Mensaje de estado | ≤ 60 caracteres          | qué está pasando, breve                                               |

## Anti-patrones detectados

### 1. Voz de manual

Documentar el sistema en el punto de uso de un solo campo.

> `TextPanel.tsx:96` — «Texto plano o expresión con `=Fields!Campo.Value`, `=Parameters!X.Value`… Las expresiones se editan en Monaco con resaltado y autocompletado (Ctrl+Espacio): campos, parámetros, funciones de `Code.`, Globals! y User!. El panel de variables inserta en la posición del cursor.»
> Cuatro conceptos (sintaxis, editor, atajo, otro panel) bajo un único campo. Es documentación pegada en la UI.

### 2. Voz de justificación

Explicar el porqué o la precedencia en vez del qué.

> `PropertiesPanel.tsx:69` — «La celda fija la posición y el tamaño del contenido **(igual que en Report Builder)**.»
> El paréntesis da una referencia de autoridad; no ayuda a hacer nada.

### 3. Narración + instrucción en vez de affordance

Narrar lo que el badge ya dice e instruir lo que el botón ya hace.

> `TextPanel.tsx:63` — «Este textbox tiene texto mixto (varios párrafos o fragmentos). Ábrelo en el editor de texto para escribir…» con el badge «6 párr. · 6 fragmento(s)» encima y el botón «Abrir editor de texto» debajo.

## Antes / después

**1. Nota de expresión** (`TextPanel.tsx:96`, ~330 → ~45 caracteres):

> **Después**: `Texto o expresión (ej. =Fields!Campo.Value).`
> El editor se autocompleta solo; Ctrl+Espacio se descubre en el editor; el panel de variables tiene su propio botón.

**2. Nota de celda** (`PropertiesPanel.tsx:69`):

> **Después**: `La celda controla la posición y el tamaño.`
> Se mantiene una línea: los campos deshabilitados necesitan su motivo (infra-explicar también es un fallo).

**3. Texto mixto** (`TextPanel.tsx:63` + badge):

> **Badge después**: `6 párrafos · 6 fragmentos` — **párrafo eliminado**.
> La lista de párrafos y el botón hacen el trabajo; la prosa sobra.

**4. Pie de estado** (`StatusBar.tsx`): «N recarga(s) externa(s)» → plural real (`N recargas externas` / `1 recarga externa`). Los conteos («66 elementos · 55 textbox…») usan el glosario para los tipos de item — hoy mezclan español e inglés.

## Inventario del barrido

Todos los textos nota de los paneles, clasificados. `Cut` = eliminar; `Trim` = conservar el hecho y quitar el relleno; `Keep` = está bien.

| Archivo                                  | Contenido                         | Veredicto                                              |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `TextPanel.tsx:63`                       | texto mixto                       | **Cut** — el affordance ya existe                      |
| `TextPanel.tsx:96`                       | manual de expresiones             | **Cut** a una línea                                    |
| `TextPanel.tsx:163`                      | tooltip de `<Label>`              | **Trim** → «Etiqueta de BC (\<Label\>): se muestra en lugar de la expresión» |
| `PropertiesPanel.tsx:69`                 | celda fija posición               | **Trim** — quitar el paréntesis                        |
| `ImagePanel.tsx:112`                     | placeholder del lienzo            | **Trim** → «En el lienzo se dibuja un placeholder; el contenido se resuelve al renderizar.» |
| `GroupPropertiesDialog.tsx:162`          | renombrar no reescribe ámbitos    | **Trim** — advertencia real, quitar relleno            |
| `BackgroundField.tsx:82`                 | expresión de fondo no se evalúa   | **Trim** ligero                                        |
| `ReportPropertiesForm.tsx:453`           | bloque `<Code>` y undo            | **Trim** ligero                                        |
| `GroupPropertiesDialog.tsx:184`          | «Group on» / «And on»             | **Keep** — semántica no obvia                          |
| `GroupPropertiesDialog.tsx:320`          | sin ordenación                    | **Keep** — un hecho, una línea                         |
| `VisibilityField.tsx:75`                 | oculta al imprimir                | **Keep** — corta e informativa                         |
| `ReportPropertiesForm.tsx:599`           | sin encabezado/pie                | **Keep** — buen estado vacío (incluye acción)          |
| `ReportPropertiesPanel.tsx:27`           | subtítulo del panel               | **Keep**                                               |

Además: los diálogos de `windowLifecycle.ts` (cierre sin acuse) — su segunda frase duplica los botones; recortar.

## Texto protegido (no recortar en el barrido)

- **Errores de recuperación** (`domainError.ts`): problema + arreglo. La longitud del conflicto o del esquema no soportado es correcta; recortarla quitaría la salida.
- **Confirmaciones destructivas** (Cambios sin guardar, conflicto, guardar todas).
- **Términos BC/RDL**: los gobierna el glosario de [i18n](../features/0005-i18n.md), no la brevedad.
- **Estados vacíos con acción**: patrón correcto, sirven de plantilla.
- **`aria-label`**: se acortan con cuidado — son la voz de la app para lectores de pantalla.

## Notas para i18n

- **Plurales reales (ICU)**: `fragmento(s)`, `recarga(s) externa(s)`, `problema(s)`, «Copiados N elementos» — no parches con «(s)».
- **No concatenar frases** («…» + nombre + «…»): formatos con marcadores.
- **El barrido cambia copy ES → rompe selectores E2E** en español: actualizarlos en el mismo paso del barrido, o migrarlos a localizadores estables por módulo (ver [fase 1](../features/0005-i18n.md)).
- **Presupuestos con expansión**: pensados para que +30–40 % de otros idiomas no rompa el layout.
