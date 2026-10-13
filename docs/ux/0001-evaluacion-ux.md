# Evaluación UX del editor — heurísticas, walkthrough y anti-patrones

- **Fecha**: 2026-09-29
- **Método**: evaluación heurística (Nielsen), walkthrough cognitivo, escaneo de
  anti-patrones y análisis de éxito de tarea, aplicados con el sistema _Intent_
  (`/intent` → `/evaluate`).
- **Artefacto evaluado**: build `pnpm --filter @rdlc-designer/back build:e2e` del
  **árbol de trabajo** (incluye el trabajo en curso de grupos de fila del Tablix,
  F2.b) — no es un build de release.
- **Evidencia**: 8 estados reales de la app capturados con Playwright sobre
  Electron (`%TEMP%\rdlc-review\`): inicial, textbox seleccionado, Tablix
  seleccionado, fila seleccionada desde Estructura, paleta Ctrl+K, Propiedades
  del informe, editor de texto y panel de Variables. Más revisión estática del
  código de interacción y copia.
- **Fixture**: `fixtures/corpus/SalesCreditMemoESP.rdlc` (141 elementos: 128
  textbox, 8 tablix, 4 rectángulos, 1 imagen).
- **Lo que NO se evaluó**: flujo de guardado/XSD en vivo, banner de conflicto en
  vivo, panel de imagen, modo oscuro, pasada completa solo-teclado y con lector
  de pantalla, y ninguna prueba con usuarios reales. Las métricas son
  estimaciones, no medidas.

---

## Salud UX

**72 / 100** — herramienta interna sólida, frenada por dos caminos de pérdida de
trabajo sin guardar y una tanda de detalles de copia/consistencia.

| Componente           | Resultado                            | Peso |
| -------------------- | ------------------------------------ | ---- |
| Heurísticas (H1–H10) | 17 puntos de severidad / 40 → 57,5 % | 50 % |
| Éxito de tarea       | 4 ok · 1 duda · 1 fallo → ~78 %      | 30 % |
| Anti-patrones        | Limpio → 100 %                       | 20 % |

## Veredicto de anti-patrones

**Limpio.** Ni patrones engañosos, ni coerción, ni seguimiento: ficheros
locales, undo por todas partes y valores por defecto que protegen al usuario.
Los defectos encontrados son de oficio (negligencia), no de intención.

---

## Hallazgos por prioridad

### P0 — Crítico

Ninguno.

### P1 — Mayor (fricción con consecuencias reales)

**1. Los cambios sin guardar se pierden en silencio al abrir otro informe.**
`Abrir…` reemplaza el documento abierto sin comprobar `dirty`
(`useDocumentCore.open()` adopta la proyección nueva sin condición;
`SessionService.open()` crea siempre una sesión nueva). Quien lleva 30 minutos
editando y abre otro fichero para copiar una etiqueta lo pierde todo: el
journal de undo es por sesión. Efecto colateral: la sesión anterior y su
watcher quedan vivos sin referencia (fuga).
→ **Ruta:** `/fortify` (guardas de confirmación) + `/blueprint` (ciclo de vida
de sesión: reutilizar o cerrar la anterior).

**2. Cerrar la ventana (X) sale sin avisar.**
Solo el botón _Cerrar_ de la toolbar comprueba cambios (con un
`window.confirm` nativo). El cierre de ventana del SO y el quit de la app no
tienen guarda en el proceso principal (`main.ts` solo maneja `closed` /
`window-all-closed`). El mismo escenario de pérdida, más fácil de provocar.
→ **Ruta:** `/fortify` (guarda en main sobre close/quit, mismo lenguaje de
diálogo).

### P2 — Menor (fricción real, recuperable)

**3. `Ctrl+S` se anuncia pero no hace nada.**
La paleta lista «Guardar — Ctrl+S» ([`palette.ts`](../../apps/front/src/lib/palette.ts))
pero `useGlobalKeys` nunca lo enlaza. Además de promesa falsa, es una carencia
H7 en un editor profesional.
→ **Ruta:** `/journey` (modelo de atajos) + `/articulate` (prometer solo lo que
existe).

**4. El diálogo Propiedades del informe descarta ediciones en silencio.**
Los campos numéricos no tienen indicador de «sin aplicar»; cerrar con X/Esc
pierde los cambios sin pista de que _Aplicar_ era necesario. Tampoco hay
validación de límites del tamaño de página/márgenes (0/negativos no se
rechazan en cliente).
→ **Ruta:** `/fortify` (borradores con estado, validación).

**5. La selección no se reconoce en el inspector.**
Con una fila del Tablix seleccionada (captura 04), el panel sigue diciendo
_«Selecciona un elemento en el lienzo para editar sus propiedades.»_ —
contradice lo que el usuario acaba de hacer.
→ **Ruta:** `/articulate` (empty state contextual).

**6. Errores de copia en español que se leen como dejadez.**
_«1 filas × 1 columnas»_ (cabecera de Estructura, sin pluralización) y
_«1 párr. · 1 run(s)»_ (editor de texto). Pequeños, pero están en pantalla cada
sesión.
→ **Ruta:** `/articulate`.

**7. «Horizontal» está mezclado en la fila de tamaños de papel.**
A4 / Letter / Legal (tamaños) convive con _Horizontal_ (una **acción** de
orientación que intercambia ancho/alto). Peor aún: pulsar un preset de tamaño
devuelve a vertical una página horizontal sin avisar. Semánticas distintas en
un mismo grupo visual.
→ **Ruta:** `/journey` (modelo del control) + `/articulate` (agrupación y
etiquetas).

**8. La paleta esconde casi todo lo que puede hacer.**
En reposo solo muestra _Elementos del informe_; las acciones (Guardar,
Insertar…, Propiedades) y las variables solo aparecen al escribir. El
placeholder promete «elemento, variable o acción» pero la superficie no lo
muestra.
→ **Ruta:** `/organize` (estructura de la superficie de comandos).

**9. La barra de estado se repite y se queda obsoleta.**
_«Abierto: <ruta completa>»_ a la izquierda más la misma ruta truncada + stats
a la derecha; el mensaje izquierdo se mantiene hasta la siguiente acción y
envejece como contexto.
→ **Ruta:** `/organize` (prioridad de la información).

### P3 — Cosmético

- **10.** El `window.confirm` nativo del flujo _Cerrar_ rompe el lenguaje de
  diálogos propio (H4) — se resolverá junto con P1; ruta `/articulate` para la
  copia de confirmación.
- **11.** No hay «ajustar a ventana» / 100 %; el 60 % inicial es fijo (solo
  Ctrl+rueda y ±). Necesidad frecuente con informes de 900+ elementos →
  `/journey`.
- **12.** El banner de error se autodescarta a los 6 s; un fallo serio de
  validación al guardar desaparece sin forma de releerlo → `/fortify` (último
  error recuperable).
- **13.** La barra de formato sigue ocupando una fila completa (al 40 % de
  opacidad) sin textbox seleccionado — coste de chrome puro →
  `/include` · `/articulate` (colapsarla).
- **14.** Los botones de insertar son solo icono (T / □ / — / imagen); los
  tooltips ayudan, pero un grupo _Insertar_ con etiqueta ayudaría a los nuevos
  → `/organize`.
- **15.** Texto de 10–11 px en Estructura/Estado y botones de icono de 24 px
  están en el mínimo de WCAG 2.5.8; el gris atenuado sobre blanco queda al
  borde de AA → `/include`.

---

## Puntuación heurística (0 = sin problemas, 4 = catastrófico)

| #   | Heurística                            | Nota | Hallazgo clave                                                                                          |
| --- | ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| H1  | Visibilidad del estado                | 2    | Buen feedback de versión/estado; el texto de estado envejece; sin acuse de selección de miembro (P2.5)  |
| H2  | Lenguaje del mundo real               | 1    | Lenguaje de dominio excelente (Tablix, grupo, `Code.`, `Fields!`); deslices de pluralización (P2.6)     |
| H3  | Control y libertad del usuario        | 2    | Undo byte-exacto, jerarquía Esc, diálogos cancelables; **pérdida de trabajo sin guardar (P1.1, P1.2)**  |
| H4  | Consistencia y estándares             | 2    | Lenguaje shadcn coherente; `confirm` nativo, dos sistemas de tooltip, promesa de Ctrl+S (P2.3)          |
| H5  | Prevención de errores                 | 2    | XSD validado antes de escribir; borrados deshacibles; faltan guardas al abrir/cerrar/ventana            |
| H6  | Reconocer antes que recordar          | 1    | Paleta, variables, tooltips y etiquetas en el lienzo; toolbar solo-icono, contenido de la paleta oculto |
| H7  | Flexibilidad y eficiencia             | 1    | Ctrl+K, flechas 1pt/10pt, snap+Shift, Ctrl+rueda; sin Ctrl+S ni ajustar-a-ventana                       |
| H8  | Estético y minimalista                | 2    | Lienzo protagonista y sereno; dos filas de toolbar siempre presentes, estado recargado                  |
| H9  | Diagnóstico y recuperación de errores | 2    | Banner de conflicto explica causa + 2 salidas; errores autodescartables pierden la recuperación         |
| H10 | Ayuda y documentación                 | 2    | Textos de ayuda inline excelentes; sin referencia de atajos ni entrada de ayuda                         |

## Walkthrough cognitivo

| Tarea                                        | Pasos                                   | Veredicto    | Dónde se rompe                                                                            |
| -------------------------------------------- | --------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| Encontrar y seleccionar un textbox           | Ctrl+K → escribir → Enter               | ✅ Pasa      | Menor: la paleta solo muestra elementos en reposo                                         |
| Cambiar la expresión de un textbox           | seleccionar → panel → Monaco → Aplicar  | ⚠️ Duda      | Objetivos diminutos al 60 %; primera apertura de Monaco sin señal de carga                |
| Añadir una fila a una tabla                  | borde del Tablix → `+` de Estructura    | ⚠️ Duda      | Seleccionar por borde fino vs. click dentro es conocimiento de iniciados (Q2 visibilidad) |
| Recuperarse de un cambio externo             | banner de conflicto → guardar o reabrir | ✅ Pasa      | La copia nombra las dos salidas (ejemplar)                                                |
| Renombrar / visibilidad / fondo              | panel de propiedades                    | ✅ Pasa      | Validación y undo funcionan como se espera                                                |
| **Cambiar de documento / salir sin guardar** | Abrir… o X de la ventana                | ❌ **Fallo** | **Sin guarda; el trabajo se pierde en silencio — el único arco roto**                     |

---

## Hallazgos positivos (proteger)

- **XML lossless + validación XSD antes de guardar** — la herramienta protege
  el artefacto que BC va a releer; es ingeniería de confianza, no solo un
  editor de ficheros.
- **Undo byte-exacto con agrupación de comandos** — arrastrar el color comete
  una vez, editar párrafos es un solo undo; undo/redo reportan versión en la
  barra de estado.
- **Copia del banner de conflicto** — explica la causa, preserva el trabajo
  del usuario y ofrece dos caminos honestos.
- **Fidelidad del lienzo como reconocimiento** — etiquetas de diseño
  `[BTC…Lbl]`, nombre de campo, `[exp]`, estilo por run, ocultos atenuados: un
  dev de BC lee el lienzo sin descifrar nada.
- **Panel de Variables** — funciones `Code.` con sus parámetros
  (`GetData (Num, Group)`) es exactamente lo que esta audiencia necesita.
- **`aria-label` en botones-icono e inputs, `role="alert"` en errores,
  tooltips con atajos** — base de accesibilidad sólida para una app de lienzo.

## Acciones recomendadas (enrutadas)

1. **`/fortify` primero** — hallazgos **#1, #2, #4, #12** (+ validación de #3):
   una sola pasada de «guardas de trabajo sin guardar» (abrir, cerrar ventana,
   diálogos, persistencia de errores). Es la palanca de mayor impacto.
2. **`/blueprint`** — ciclo de vida de sesión de #1 (la sesión/watcher
   anterior no se cierra al reabrir).
3. **`/articulate`** — hallazgos **#5, #6, #10** + quick wins: pluralización
   («1 fila × 1 columna», «1 run»), copia de acuse para selección de miembro,
   etiquetas de atajo honestas.
4. **`/journey`** — hallazgos **#3, #7, #11**: modelo de atajos (Ctrl+S),
   modelo del control tamaño/orientación, zoom a ventana.
5. **`/organize`** — hallazgos **#8, #9, #14**: contenido de la paleta al
   abrir, jerarquía de la barra de estado, afordancias de insertar.
6. **`/include`** (post-MVP) — #15 y estrategia de accesibilidad del lienzo; el
   panel de Estructura ya es una buena mitigación.
7. **`/measure` antes de abrir el código** — no hay instrumentación; candidatos:
   tiempo hasta la primera edición, uso de undo, recargas externas y aperturas
   abandonadas. **`/investigate`** para validar el bloque de runs del editor de
   texto y la afordancia del borde del Tablix con 3–5 desarrolladores de BC.

**Quick wins (horas, no días):** Ctrl+S, pluralización, colapsar la barra de
formato en reposo, paleta mostrando acciones/variables al abrir.

---

## Trazabilidad (código revisado)

- [`useDocumentCore.ts`](../../apps/front/src/hooks/useDocumentCore.ts) —
  `open()` sin guarda de `dirty`; `close()` con `window.confirm` nativo.
- [`main.ts`](../../apps/back/src/main.ts) — sin guarda en close/quit de ventana.
- [`SessionService.ts`](../../apps/back/src/application/services/SessionService.ts) —
  `open()` crea siempre sesión nueva.
- [`useGlobalKeys.ts`](../../apps/front/src/hooks/useGlobalKeys.ts) — no hay
  Ctrl+S; sí Ctrl+K/Z/Y, flechas, Supr, Esc, Ctrl+D/C/X/V.
- [`palette.ts`](../../apps/front/src/lib/palette.ts) — anuncia «Ctrl+S».
- [`TablixStructurePanel.tsx`](../../apps/front/src/components/panels/TablixStructurePanel.tsx) —
  `N filas × M columnas` sin pluralizar; tooltips nativos.
- [`ReportPropertiesDialog.tsx`](../../apps/front/src/components/panels/ReportPropertiesDialog.tsx) —
  presets de papel + orientación mezclados; sin estado de pendiente.
- [`FormatToolbar.tsx`](../../apps/front/src/components/panels/FormatToolbar.tsx) —
  barra atenuada al 40 % sin colapsar.
