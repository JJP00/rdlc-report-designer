# Formato numérico y de fecha (`<Format>`) — propiedad que falta

- **Fecha**: 2026-10-13
- **Estado**: implementado y verificado (2026-10-13)
- **Ámbito**: sobre todo frontend (panel de texto) + un ajuste pequeño en el comando
  `setStyle` del backend. No cambia el contrato (`StyleDto.format` ya existe).

> **Implementado 2026-10-13 (misma sesión)**: `setStyle { format }` escribe `<Format>` en
> el `<Style>` de **cada run** (el item no se toca; en un item sin runs el valor cae al
> item para no perderlo), `null`/`''` limpia los tres niveles con undo byte-exacto y
> `snapshotOut` refresca la proyección (`apps/back/src/domain/document/commands/setStyle.ts`;
> 15 tests de dominio + 3 de proyección). El panel de texto y el editor de runs tienen el
> campo «Formato» en columna (selector de presets .NET arriba y editor debajo;
> `FormatField.tsx`, `textFormat.ts`; 13 tests): las **expresiones (`=…`) se editan con
> Monaco** (autocompletado de campos/parámetros) y las cadenas .NET con el campo simple.
> Verificado con `typecheck` en los dos paquetes, **418 back + 350 front** tests y
> **130/130 E2E** (2 nuevos en `apps/back/e2e/format.spec.ts`, round-trip byte a byte).
> La vista previa del §4.1 se omite a propósito: la cultura depende de `User!Language` y no
> se inventan valores.

## 1. El problema

El editor no muestra ni permite cambiar el formato de un textbox: `N2`, `#,##0.00`,
`dd/MM/yyyy`, `P0`, `C2`… Hoy solo se puede editar el XML a mano o envolver el valor en
`=Format(...)`. El formato numérico es de lo más usado en los informes de BC (precios,
cantidades, importes, fechas), así que es un hueco de uso diario.

## 2. Estado actual (verificado en el código)

| Capa             | Estado                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato         | `format: z.string().optional()` en `packages/contracts/src/style.ts` (líneas 46 y 91, parche con `optional`)                                              |
| Backend          | `setStyle` mapea `format → <Format>` (`apps/back/src/domain/document/commands/setStyle.ts:52`) y está en `SUPPORTED_KEYS`                                |
| Proyección       | **No verificado** si se proyecta `format` al DTO del item/run                                                                                            |
| Frontend         | **Ninguna referencia a `format`** en `apps/front/src` (ni panel de texto, ni barra de formato, ni editor de runs, ni lienzo)                              |
| Round-trip       | Los `<Format>` existentes se conservan al guardar (nodos desconocidos opacos y escritura tag a tag)                                                      |

## 3. Evidencia del corpus (9 `.rdlc` de BC)

Recuento de `<Format>` por fichero: SalesInvoiceESP 23, SalesCreditMemoESP 22,
SalesInvoiceDEU 22, SalesCreditMemoDEU 21, SalesShipment 7, BTCLoadingOrder 5,
FAKESalesShipment 5, BTCQualityControl 1, BTCWhseShipment 1, PalletOutput 0.

Valores más frecuentes:

| Veces | Valor                                                              |
| ----- | ------------------------------------------------------------------ |
| 51    | `=First(Fields!BTCFormatcurrency_Lbl.Value, "DataSet_Result")`     |
| 29    | `=Fields!BTCQtyIntegerFormat.Value`                                |
| 11    | `=Fields!BTCFormatcurrency_Lbl.Value`                              |
| 8     | `=First(Fields!BTCFormatUnitPrice_Lbl.Value, "DataSet_Result")`    |
| 4     | `=Fields!QtyIntegerFormatLbl.Value`                                |
| 1     | `d` (literal)                                                      |
| resto | otras expresiones con `First(Fields!…Format…)`                     |

Tres consecuencias de diseño:

1. **Casi todo es una expresión**, no un literal: BC entrega la cadena de formato como
   campo del dataset (según moneda/redondeo de la empresa). El campo debe aceptar
   **expresiones** (el mismo editor Monaco con `Fields!`/`Parameters!`), no solo una lista
   de formatos fijos. Un desplegable de presets sin campo libre sería inútil aquí.
2. **`<Format>` vive en el `<Style>` del `TextRun`**, no en el del textbox: en
   `SalesInvoiceESP.rdlc` aparece justo después de `FontFamily`/`FontSize` del run. El
   `setStyle` actual escribe en el `<Style>` del **item** y solo replica a los runs las
   etiquetas de `RUN_TEXT_TAGS` (`FontFamily`, `FontSize`, `FontWeight`, `FontStyle`,
   `TextDecoration`, `Color`); **`Format` no está en esa lista**, por lo que un formato
   escrito en el item quedaría sombreado por el del run (precedencia RDL: run > párrafo >
   item) y BC lo ignoraría, igual que ya pasó con la fuente.
3. `<Language>` es `=User!Language` en los 10 ficheros que lo declaran: símbolo de
   moneda, separadores y nombres de mes dependen del idioma del usuario en BC, no de la
   cadena de formato.

## 4. Diseño propuesto

### 4.1 Interfaz (panel de texto y bloque de runs)

- Campo **«Formato»** en `TextPanel` (para el textbox) y en `RunEditor` (por run), junto a
  la fuente y la alineación.
- **Selector de presets** + **campo libre con expresión**:

  | Preset            | Cadena        | Ejemplo (1234,5 / 2026-10-13) |
  | ----------------- | ------------- | ----------------------------- |
  | General           | _(sin tag)_   | 1234,5                        |
  | Número            | `N0`          | 1.235                         |
  | Número, 2 decimales | `N2`        | 1.234,50                      |
  | Porcentaje        | `P0` / `P2`   | 123.450 % / 123.450,00 %      |
  | Moneda            | `C2`          | 1.234,50 €                    |
  | Fecha corta       | `d`           | 13/10/2026                    |
  | Fecha larga       | `D`           | martes, 13 de octubre de 2026 |
  | Fecha y hora      | `g`           | 13/10/2026 10:30              |
  | Personalizado…    | texto libre   | `#,##0.00;(#,##0.00);""`      |
  | Expresión…        | `=…`          | `=Fields!BTCQtyIntegerFormat.Value` |

- **Vista previa** solo cuando el valor del textbox es un campo simple y el formato es un
  literal: muestra un valor de ejemplo con la cultura del informe. Con expresión de
  formato no se puede calcular: etiquetar «formato dinámico (BC)» y no inventar un valor.
- Sin valor de ejemplo conocido, no mostrar preview (no fabricar datos).

### 4.2 Backend

- **Escribir el formato a nivel de run**, como lo hace BC: añadir `Format` a la lógica que
  replica el estilo en los runs (`RUN_TEXT_TAGS` o equivalente) y al «quitar overrides
  sombreados» de `syncShadowingStyles`. Decidir si se escribe también en el item (BC no lo
  hace; recomendación: **solo en runs**, con el item sin tocar).
- Parche **nullable** para quitar el formato (volver a «General») con undo byte-exacto.
- Confirmar si la proyección expone `format` por run (probable cambio en
  `TrueFormatProjectionAdapter` y en el DTO del run).
- Validación: un literal vacío borra el tag; no validar la sintaxis .NET (el formato lo
  interpreta el renderizador, y las expresiones no se pueden evaluar aquí).

### 4.3 Lienzo

- El diseñador de BC/RB pinta la expresión (`[Campo]`), no el valor formateado: **no
  formatear en el lienzo** (no hay datos reales). Opcional: indicador discreto en el
  textbox con formato (tooltip «Formato: N2»).
- **No aplicable a multiselección en la primera versión**, salvo que `MultiSelectionPanel`
  ya aplique `setStyle` en lote (comprobar; si es así, el campo entra gratis).

## 5. Casos límite

| Caso                                                                | Comportamiento esperado                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Textbox con varios runs y formatos distintos                        | El campo del textbox muestra «Mixto»; cambiarlo lo aplica a todos los runs |
| Run con `Format` y párrafo/item con otro                            | Manda el del run; al editar el item se quitan los sombreados              |
| Expresión de formato con comillas (`"DataSet_Result"`)              | Se conservan tal cual (escape propio de texto; ver hallazgo 5 del corpus) |
| Cadena con `;` o `\` ( `#,##0.00;(#,##0.00)` )                      | Se escribe literal                                                        |
| Valor `Format` en celdas de Tablix                                  | Igual que en un textbox suelto; viaja con el run                          |
| Deshacer                                                            | Byte-exacto, incluido volver a «sin tag»                                  |
| Informe sin `Language`                                              | Avisar de que el resultado depende de la cultura del servidor             |

## 6. Pruebas

- **Unit (back)**: `setStyle` con `format` escribe en cada run; quita `Format` (null);
  sombreado item/párrafo/run; undo byte-exacto; no toca el XML de los otros textboxes del
  corpus (golden).
- **Unit (front)**: los presets mapean a la cadena correcta; «Mixto» con runs distintos;
  la expresión se pasa sin escapar.
- **E2E**: abrir `SalesInvoiceESP.rdlc`, seleccionar un textbox con `<Format>` y ver su
  expresión en el campo; cambiarla, guardar, comprobar el XML y que el round-trip vuelve a
  ser idéntico tras deshacer.

## 7. Tamaño y orden

**S–M** (1 sesión): ① comprobar proyección y escribir a nivel de run (backend + tests) →
② campo y presets en `TextPanel`/`RunEditor` → ③ preview opcional → ④ E2E.
Es independiente de las capas y del rediseño de diálogos; conviene después de los
arreglos de `docs/bugs/0003` porque el campo cabe en el editor de texto, que es uno de los
diálogos afectados.

## 8. Fuera de alcance

- Evaluar expresiones o simular datos de BC.
- Asistente de cadenas personalizadas de .NET (se deja el campo libre).
- Formato por celda de Tablix distinto del de su textbox.
