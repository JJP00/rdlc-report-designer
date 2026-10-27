# Decisiones de UX

## 2026-10-27 · La evaluación 0007 cubre lo añadido desde el 2026-10-09 y lo que se pudo observar de lo pendiente de 0005
- Decidido por: Claude (por defecto)
- Por qué: 0005 ya auditó el resto con cuatro pasadas; el panel Problemas, las opciones de item, los saltos de grupo, el actualizador y EN/ES no tenían evaluación.
- Descartado: una re-auditoría completa, que repetiría 0005 sin evidencia nueva.
- Se apoya en: `docs/ux/0005-reauditoria-intent.md`; `git log` del 2026-10-09 a `3b3c3e8`; build E2E de `3b3c3e8` con Playwright a 1366×768 y 960×600, en ES y EN, sobre copias de `fixtures/corpus/SalesInvoiceESP.rdlc` (una con un campo inexistente añadido).

## 2026-10-27 · Fuera de la evaluación 0007: lector de pantalla, DPI físico, tiradores sobre un vecino solapado, señal de texto recortado y objetivos < 24 px
- Decidido por: Claude (por defecto)
- Por qué: necesitan NVDA/Narrator y una pantalla de DPI alto, y siguen abiertos en Pendientes sin cambios desde 0005.
- Descartado: darlos por resueltos o por empeorados sin medirlos.
- Se apoya en: `RDLC Report Designer - Pendientes.md`, sección «UX — restos de la re-auditoría Intent (0005)».

## 2026-10-27 · Usuarios: desarrolladores y consultores de Business Central que editan layouts RDLC en Windows, y usuarios de SSRS del proyecto abierto
- Decidido por: Claude (por defecto, sin entrevistas)
- Por qué: es lo que dicen el README y el documento de producto; no hay investigación con usuarios.
- Descartado: —
- Se apoya en: `README.md`; `RDLC Report Designer.md`.

## 2026-10-27 · «Sin problemas» falso se califica como importante
- Decidido por: Claude (por defecto)
- Por qué: el indicador es la única señal del lint antes de desplegar a BC; un visto bueno sin comprobación invierte su propósito aunque el fallo sea raro.
- Descartado: menor, porque la frecuencia de un fallo del IPC o de una regla no se ha medido.
- Se apoya en: `apps/front/src/hooks/useLintFindings.ts:56-63`.

## 2026-10-27 · El hallazgo sobre Problemas baja de importante a menor
- Decidido por: JunPeng Jin, comprobado en la app
- Por qué: pulsar un hallazgo selecciona su elemento y desplaza el lienzo hasta él; en los hallazgos de grupo, Estructura muestra la fila del grupo con su botón de propiedades. Lo que falta es decir qué expresión del grupo falla y cómo se arregla: fricción, no un callejón sin salida.
- Descartado: mantenerlo como importante; abrir el diálogo del grupo al pulsar, porque la selección ya lleva al sitio y abrir un diálogo en cada clic estorba al recorrer la lista.
- Se apoya en: `apps/front/src/hooks/useItemEditing.ts:1505-1511` (`selectAndReveal`); clic en «Tablix1 · Value» y «Tablix1 · GroupExpression» sobre `SalesInvoiceESP.rdlc`.

## 2026-10-27 · Las casillas de repetición del Tablix se deshabilitan, con su valor visible, en tablas sin cabeceras de grupo
- Decidido por: Claude (por defecto)
- Por qué: en una tabla no tienen efecto y desvían al usuario de la fila, que es donde se repite; deshabilitarlas conserva a la vista el valor que trae el fichero.
- Descartado: ocultarlas (esconde un valor presente en el XML); dejarlas como están (la trampa sigue).
- Se apoya en: [Microsoft Learn, *Show row and column headers on multiple pages*](https://learn.microsoft.com/en-us/sql/reporting-services/report-design/display-row-and-column-headers-on-multiple-pages-report-builder-and-ssrs); `LinesTable` de `SalesInvoiceESP.rdlc` (0 `TablixHeader`, 0 `TablixCorner`, 2 miembros con `RepeatOnNewPage`).

## 2026-10-27 · Revisión ética de la 0007: sin patrones manipulativos
- Decidido por: Claude (por defecto)
- Por qué: el actualizador actualiza solo a petición y pregunta por los cambios sin guardar; no hay telemetría.
- Descartado: —
- Se apoya en: `packages/i18n/src/catalogs/es/dialogs.ts:33-52`; búsqueda de `telemetry|analytics|sentry|posthog|mixpanel|trackEvent` en `apps/` sin resultados.

## 2026-10-27 · La evaluación 0007 está en español
- Decidido por: Claude (por defecto)
- Por qué: `docs/ux/` y Pendientes están en español.
- Descartado: inglés, el idioma del README y de los commits recientes.
- Se apoya en: `docs/ux/0001`–`0006`.
