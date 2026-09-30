# Re-evaluación UX del editor — tras el pase U1–U9

- **Fecha**: 2026-09-30
- **Método**: re-evaluación heurística (Nielsen), walkthrough cognitivo, escaneo de
  anti-patrones y análisis de éxito de tarea, con el sistema *Intent*
  (`/intent` → `/evaluate`). Contrasta con `docs/ux/0001-evaluacion-ux.md`.
- **Artefacto evaluado**: build `pnpm --filter @rdlc-designer/back build:e2e` del
  **árbol de trabajo** con el pase de UX completo (U1–U9: vida de fichero y
  guardas, conflicto, multiselección en lote, jerarquía/breadcrumb, zoom,
  paleta, agrupación de filas y repaso de diálogos).
- **Evidencia**: 8 estados reales capturados con Playwright sobre Electron
  (`%TEMP%\rdlc-review-2\`): inicial, multiselección + panel de lote,
  jerarquía + breadcrumb, cambios sin guardar, toolbar de fichero con recientes,
  paleta en reposo, conflicto y menú de zoom. Más revisión estática del código
  nuevo y los E2E (63 verdes).
- **Fixture**: `fixtures/corpus/SalesCreditMemoESP.rdlc` (141 elementos).
- **Lo que NO se evalúa**: pruebas con usuarios reales, lector de pantalla,
  modo oscuro, flujo completo de impresión/BC (página 9650) y medición
  instrumentada.

---

## Salud UX

**86 / 100** — el trabajo sin guardar ya no se pierde en ningún camino (abrir,
crear, cerrar, salir), el conflicto tiene salidas honestas y la edición en lote
llega con un solo undo. Lo que resta es deuda de acabado (multiselección
incompleta y saturación del chrome), no de confianza.

| Componente               | Resultado                               | Peso |
| ------------------------ | --------------------------------------- | ---- |
| Heurísticas (H1–H10)     | 12 puntos de severidad / 40 → 70 %      | 50 % |
| Éxito de tarea           | 5 ok · 1 duda → ~92 %                   | 30 % |
| Anti-patrones            | Limpio → 100 %                          | 20 % |

> Comparativa: 0001 = 72 (17/40 heurísticas, 1 fallo de tarea, 2 P1). El único
> arco roto de 0001 («cambiar de documento / salir sin guardar») está **cerrado**.

## Veredicto de anti-patrones

**Limpio.** Sin coerción, sin valores por defecto en contra del usuario y con
las salidas destructivas nombradas explícitamente («Abrir sin guardar»,
«Salir sin guardar», «Recargar desde disco (descartar mis cambios)»). El
`window.confirm` nativo desapareció: todos los diálogos hablan el mismo
lenguaje. Los defectos restantes son de oficio, no de intención.

---

## Hallazgos por prioridad

### P0 — Crítico

Ninguno.

### P1 — Mayor

Ninguno. Los dos de 0001 están resueltos y verificados con E2E:

- ✅ **Pérdida al abrir otro informe**: guarda de intención con diálogo propio
  («Guardar y abrir / Abrir sin guardar / Cancelar»), cierre real de la sesión
  anterior (sin fuga de watcher) y recientes que reabren bajo la misma guarda.
- ✅ **Salida sin avisar por la X**: el main intercepta `close`, el renderer
  decide con el mismo diálogo y `dirty` se recalcula al deshacer/rehacer (si el
  XML vuelve a ser el del disco, ya no pide guardar).

### P2 — Menor (fricción real, recuperable)

**1. Duplicar/Copiar/Cortar siguen siendo de un solo item con multiselección.**
Con 2+ elementos seleccionados, la toolbar y los atajos operan solo sobre el
ancla (el último), mientras el panel derecho dice «Selección múltiple». La
affordance promete un lote que esas acciones no cumplen.
→ **Ruta:** `/journey` (completar el modelo de multiselección: duplicar/copiar/
cortar en lote con `batch`).

**2. No hay marco de selección (arrastrar en vacío).**
El diseño acordado de U3 incluía selección por caja; hoy solo hay Ctrl/Shift+
click. Es recuperable (se puede seguir seleccionando una a una), pero en
informes de 141 elementos el marco es la vía natural.
→ **Ruta:** `/journey`.

**3. El panel de lote no marca estados mixtos.**
Fuente/tamaño/colores muestran los valores del **primer** item, aunque los
demás difieran. Un «—» (mezcla) evitaría aplicar sin querer el valor de otro.
→ **Ruta:** `/fortify` (estados vacíos/mixtos) + `/articulate` (indicador).

**4. Alinear/Distribuir son 6+2 iconos sin etiqueta visible.**
Solo tienen tooltip; el grupo «Alinear» no se lee a la primera cuando el panel
es estrecho. Añadir encabezados o iconos más explícitos reduce el coste de
reconocimiento (H6).
→ **Ruta:** `/organize` + `/include` (etiquetas y áreas de pulsación).

**5. Sin referencia de atajos.**
Ctrl+S, Ctrl+Shift+S, Ctrl+N/O, Ctrl+1/0, Ctrl+Shift+]/[ se han multiplicado y
no hay ninguna superficie que los liste (la paleta ya los anuncia, pero solo al
escribir).
→ **Ruta:** `/articulate` (hoja de atajos o entrada de ayuda).

### P3 — Cosmético

- **6.** La toolbar se satura: con 1500 px el título «RDLC Report Designer»
  envuelve a dos líneas y compiten 15+ botones. Agrupar (Fichero / Insertar /
  Ver) o acortar etiquetas → `/organize`.
- **7.** La barra de estado sigue duplicando la ruta (mensaje a la izquierda y
  ruta truncada a la derecha). El mensaje ya es honesto («Guardado: …»), pero
  el espacio se repite → `/organize`.
- **8.** El banner de error se autodescarta a los 6 s; un fallo de validación al
  guardar se puede perder de vista → `/fortify` (último error recuperable).
- **9.** Insertar sigue siendo icono-only sin etiqueta de grupo; los tooltips
  ayudan, el grupo «Insertar» ayudaría más → `/organize`.

---

## Puntuación heurística (0 = sin problemas, 4 = catastrófico)

| #   | Heurística                             | 0001 | Hoy | Hallazgo clave                                                                 |
| --- | -------------------------------------- | ---- | --- | ------------------------------------------------------------------------------ |
| H1  | Visibilidad del estado                 | 2    | 1   | Guardado/Deshecho/conflicto con versión; asterisco de dirty fiable (ya no miente al deshacer) |
| H2  | Lenguaje del mundo real                | 1    | 1   | Lenguaje de dominio intacto; copia de diálogos precisa                         |
| H3  | Control y libertad del usuario         | 2    | 1   | Guardas en los 4 caminos + undo byte-exacto + batch atómico                    |
| H4  | Consistencia y estándares              | 2    | 1   | Sin `confirm` nativo; diálogos Radix propios en todo el ciclo                  |
| H5  | Prevención de errores                  | 2    | 1   | Validación XSD antes de escribir; guardas proporcionales al riesgo             |
| H6  | Reconocer antes que recordar           | 1    | 1   | Paleta en reposo, jerarquía, breadcrumb y tooltips; iconos de alinear sin texto |
| H7  | Flexibilidad y eficiencia              | 1    | 1   | Ctrl+S/Shift+S/N/O, zoom, z-order, lote con `batch`; falta marcos y ayuda       |
| H8  | Estético y minimalista                 | 2    | 2   | Lienzo protagonista; toolbar y estado cargados (deuda de agrupación)           |
| H9  | Diagnóstico y recuperación de errores  | 2    | 1   | Conflicto con 3 salidas y banner persistente hasta resolver; error auto-descartable |
| H10 | Ayuda y documentación                  | 2    | 1   | Textos inline excelentes; sigue faltando una referencia de atajos              |

**Total: 12 puntos de severidad / 40.**

## Walkthrough cognitivo

| Tarea                                       | Pasos                                              | Veredicto | Dónde se rompe                                                        |
| ------------------------------------------- | -------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Editar y guardar sin miedo                  | editar → Ctrl+S                                    | ✅ Pasa    | Estado «Guardado (v)» y bytes idénticos cuando no hay cambios         |
| Abrir otro informe con cambios sin guardar  | Abrir/reciente → diálogo → Guardar y abrir          | ✅ Pasa    | Ya no se pierde nada en silencio                                      |
| Resolver un cambio externo                  | banner/diálogo → Recargar/Sobrescribir/Guardar como | ✅ Pasa    | Copia honesta y sin pérdida hasta decidir                             |
| Editar varios elementos a la vez            | Ctrl+click → panel → Alinear → Ctrl+Z               | ⚠️ Duda   | Iconos sin etiqueta y sin marcos de estado mixto                      |
| Navegar a un elemento dentro de una celda   | breadcrumb o Jerarquía → click                      | ✅ Pasa    | La ruta y el árbol evitan cazar bordes finos                          |
| Duplicar/copiar varios elementos            | selección múltiple → Ctrl+D/C                       | ❌ **Fallo** | Actúa solo sobre el ancla: la expectativa del lote no se cumple      |

---

## Hallazgos positivos (proteger)

- **Guardas de trabajo sin guardar con consecuencias nombradas** — cada botón
  dice exactamente qué pasará («Guardar y salir», «Abrir sin guardar»); el
  `dirty` se recalcula al deshacer, así que la guarda no llora por cambios que
  ya no existen.
- **Conflicto con tres salidas y sin pérdida mientras se decide** — el backend
  nunca pisa el trabajo; el diálogo explica la causa y ofrece recargar,
  sobrescribir o guardar como.
- **Lote atómico** — alinear/distribuir/estilar varios elementos es **un solo
  undo** (`batch`); verificado byte a byte en back y con E2E.
- **Breadcrumb + Jerarquía del informe** — dos niveles de wayfinding para
  informes grandes: ruta del contenedor para subir de nivel y árbol completo
  (incluidas celdas) para saltar sin tocar el lienzo.
- **Paleta en reposo con acciones y variables** — la superficie ya no esconde
  lo que puede hacer; cada acción declara su contexto (`needs`) y se deshabilita
  con sentido.
- **Zoom usable de verdad** — ajustar al ancho, 100 % y presets en un desplegable
  con atajos (Ctrl+1/Ctrl+0) sobre la medición real del hueco del lienzo.
- **Base de accesibilidad sostenida** — `aria-label` en iconos, `aria-pressed`
  en conmutadores del lote, `role="alert"` en errores, diálogos con foco Radix.

## Acciones recomendadas (enrutadas)

1. **`/journey`** — completar U3: duplicar/copiar/cortar en lote y marco de
   selección (hallazgos 1 y 2). Es el único fallo de walkthrough.
2. **`/fortify`** — estado mixto en el panel de lote (3) y persistencia del
   último error (8).
3. **`/organize`** — toolbar (6), barra de estado (7) y grupo Insertar (9);
   junto con `/articulate` para la hoja de atajos (5).
4. **`/include`** — etiquetas/áreas de los iconos de alinear-distribuir (4) y
   repaso de contraste/tamaños pendiente de 0001.

**Siguiente verificación**: re-evaluar cuando `/journey` cierre el lote completo
(duplicar/copiar/marco) — es el criterio de salida de este bucle.
