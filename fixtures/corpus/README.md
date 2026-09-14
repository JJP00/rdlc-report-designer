# Corpus de fixtures (Fase 0)

Ficheros `.rdlc` (schema RDLC 2016) exportados desde Business Central, usados
como corpus de golden tests del round-trip XML.

- 10 ficheros, ~2,15 MB en total.
- Casos cubiertos: informes estándar (`SalesInvoice*`, `SalesCreditMemo*`,
  `SalesShipment`), layouts custom (`BTC*`) y un caso límite sin `<Page>`
  (`PalletOutput.rdlc`, sin header/footer ni configuración de página).
- Características a preservar: BOM UTF-8, CRLF, namespaces `rd:`, comentarios,
  `<Code>` VB, Tablix con jerarquías.

> **Nota open source (F4)**: antes de publicar el repositorio hay que revisar
> que estos layouts no contengan datos confidenciales del negocio; si los hay,
> sustituirlos por layouts estándar de BC equivalentes.
