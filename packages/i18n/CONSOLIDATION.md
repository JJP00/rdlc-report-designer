# Consolidación i18n (fase 3 — pendientes tras el barrido)

## Checks de integración (hacer antes de cerrar la sesión)

- **`GroupPropertiesDialog.tsx`** (tablix): debe pasar `t` a
  `variableEntries(meta, t)` y usar `groupLabel ?? group`; si no, pinta la clave
  cruda (`report.variables.group*`). No lo detecta `tsc` (el parámetro es
  opcional): verificarlo tras el barrido.
- **`FORMAT_PRESETS[].label`** (`lib/textFormat.ts`, «Número», «Porcentaje»…): texto
  visible pintado por `FormatField.tsx`. **Confirmado pendiente** por dos
  módulos: convertir a `labelKey` y resolver con `t()` en `FormatField` (1
  línea; el spec solo comprueba `id`/`value`).
- **Tokens de atajo visibles** («Mayús», «Supr», «Intro»… en las columnas de los
  menús): quedaron hardcodeados (regla 6 del brief); en EN se ven tokens ES.
  Convertir a claves (`common.shortcut.shift` = Mayús/Shift, `del`, `enter`,
  `esc`…) en la consolidación; comprobar antes si algún E2E los usa.
- **Alias de Monaco** (`monaco.languageAlias`): se registra una vez; no se
  refresca al cambiar de idioma en caliente (solo cosmético, picker de Monaco).
- **Defaults de `ui/command.tsx`**: valores = inglés literal de shadcn
  («Command Palette»…); decisión de fase 3: dejarlos o quitar el default.
- **Notas con `<code>` inline**: al pasar a mensajes ICU planos se pierde el
  estilo monoespaciado (TextPanel/ReportPropertiesForm ok por decisión de no
  concatenar; si se quiere conservar, la vía es tags ICU — cambio de
  infraestructura, no de fase 1).
- **Copy de pie y fallbacks duplicados**: `app.status.*` (queued/opening/saving/
  stats) es copy del pie → candidato a `status.*`; `app.error.*` (fallbacks de
  `apiErrorMessage`) → `errors.*`; `dialogs.conflict.title` duplica
  `errors.fallback.E_CONFLICT`. Consolidar ejes de namespace en fase 3.
- **`defaultT = createTranslator('es')`** repetido en `workspace.ts` y
  `TabStrip.tsx` (patrón «t opcional con ES por defecto» para funciones puras
  testeadas sin React): consolidar en un único export del paquete i18n.
- Barrido final: `node scripts/i18n-inventory.mjs apps/front/src apps/back/src`
  → literales ES fuera de catálogos (solo permitidos: comentarios, no-UI).

## Pendientes de fase 3 (revisión)

- **`itemKindLabel(kind)`** — único hueco visible del barrido (verificado con
  `scripts/i18n-inventory.mjs`): tipos de item del árbol de jerarquía/paleta
  siguen con literales ES/EN mezclados («Rectángulo», «Textbox»…). Pasar `t` +
  unificar con el glosario (afecta a 3 superficies y a `palette.spec`).
- **Detalles del XSD** (`LibXml2SchemaValidatorAdapter`): el prefijo «Línea {n}»
  del detalle va en ES (el resto del mensaje de libxml2 ya es EN); decidir si el
  detalle se localiza o se mantiene como diagnóstico crudo.
- **Logs del main**: `main.ts` («[seguridad] navegación bloqueada») y logs DEV
  del front (`expressionEditor`) quedan en ES; son diagnóstico, no UI.

Items detectados por los módulos del barrido que se resuelven **en la revisión**
(no bloquean la fase 1/2):

- **Conteos del pie**: `ReportTab.tsx` (shell) compone `stats` con
  `lib/projection.ts` (`formatKinds`, libs) usando el `kind` crudo («55 textbox»
  mezclado con «elementos»). Consolidar en una clave ICU de `status.*` (o
  `common.*`) con el glosario de tipos de item.
- **`itemKindLabel(kind)`**: compartida por CanvasArea, HierarchyPanel y la
  paleta; hoy sin `t`. Consolidar con el glosario (y unificar «textbox» vs
  «Text Box» según Microsoft).
- **`components/ui/command.tsx`**: conserva los defaults EN de shadcn
  («Command Palette», «Search for a command to run...»); la paleta pasa los
  suyos, pero conviene localizarlos o documentarlos.
- **Términos EN a validar con el glosario MS**: «textbox» vs «Text Box»;
  «Insert table (Tablix)» vs «Insert tablix» (y validar Tablix en ES).
- **Grupos de variables**: resueltos con `variableEntries(meta, t)` y claves
  `report.variables.group*` — revisar que la paleta y el panel compartan.
- **Ordenación locale-dependiente**: `MultiSelectionPanel` ordena fuentes con
  `localeCompare(b, 'es')` fijo; candidato a seguir el idioma activo
  (`useLocale()`) en la consolidación. Revisar si hay más `localeCompare`
  con locale fijo.
- **Números/fechas locale-aware**: los anuncios reutilizan `formatCmEs` («2,00 cm»
  con coma) también en EN; igual con los conteos. Falta un formateador por
  locale (sitio natural: `lib`/i18n) y revisar `Intl` en zoom/conteos (la
  auditoría de fase 1 ya lo marcaba como ⚠).
- **Revisión ES en contexto** (tuteo), glosario validado con consultores BC y
  QA lingüístico: fase 3 del plan (`docs/features/0005-i18n.md`).
- Cierre de sesión: `graphify update .` tras el barrido.
