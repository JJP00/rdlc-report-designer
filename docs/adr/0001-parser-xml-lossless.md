# ADR 0001 — Parser XML lossless para el round-trip

- **Fecha**: 2026-09-14
- **Estado**: aceptado
- **Fase**: 0 (gate go/no-go)

## Contexto

El requisito crítico del proyecto es que el fichero `.rdlc` sobreviva intacto:

1. El XML es la fuente de verdad y se edita externamente (file watching) — el
   diseño no puede regenerar el fichero.
2. Business Central re-lee el layout al desplegar; un XML distinto (aunque sea
   semánticamente equivalente) invalida el trabajo y rompe la confianza.
3. El modelo de edición es de **parcheo quirúrgico**: solo se modifica lo que se
   toca; el resto se emite byte a byte como estaba.

Se necesita por tanto un parser/emitter que retenga: whitespace, CRLF, BOM,
comentarios, orden y comillas de atributos, self-closing, CDATA, processing
instructions (declaración XML) y namespaces (`rd:` en el corpus).

## Decisión

Usar **`xml-trueformat` (MIT, v0.9.5)** como adaptador de infraestructura
detrás de `RdlcParserPort` / `RdlcSerializerPort`
(`apps/back/src/infrastructure/rdlc/TrueFormatXmlAdapter.ts`).

El dominio nunca depende de la librería: el tipo `RdlcDocument` es opaco y en
F1 se sustituye por el árbol de nodos propio. Si la librería quedara abandonada,
se sustituye el adaptador (o se vendoriza) sin tocar dominio ni casos de uso.

## Evidencia (corpus: 10 ficheros, 2,15 MB en total)

Test: `apps/back/test/golden/roundtrip.golden.spec.ts` (parse → serialize →
comparación de bytes exactos).

| Candidato | Round-trip byte a byte | Notas |
|---|---|---|
| `xml-trueformat` | **10/10 OK** | CRLF + BOM + `rd:` + comentarios + self-closing preservados |
| `fast-xml-parser` (máxima fidelidad: `preserveOrder`, `trimValues: false`) | **0/10** | normaliza formato; solo sirvió como contraejemplo |

Tiempos medidos (misma máquina, Vitest, CPU moderna):

| Fichero | Bytes | parse | serialize |
|---|---:|---:|---:|
| BTCLoadingOrder.rdlc | 87 724 | 1.6 ms | 0.5 ms |
| BTCQualityControl.rdlc | 114 906 | 5.0 ms | 0.5 ms |
| BTCWhseShipment.rdlc | 141 358 | 4.1 ms | 1.2 ms |
| FAKESalesShipment.rdlc | 179 927 | 5.0 ms | 1.7 ms |
| PalletOutput.rdlc | 24 574 | 0.5 ms | 0.1 ms |
| SalesCreditMemoDEU.rdlc | 363 411 | 8.4 ms | 1.8 ms |
| SalesCreditMemoESP.rdlc | 369 226 | 9.8 ms | 2.1 ms |
| SalesInvoiceDEU.rdlc | 360 055 | 7.8 ms | 2.8 ms |
| SalesInvoiceESP.rdlc | 365 847 | 7.9 ms | 1.7 ms |
| SalesShipment.rdlc | 274 136 | 6.2 ms | 2.4 ms |

Presupuesto F0: parse < 2 s. Resultado: **~200× por debajo** (peor caso
9.8 ms). La tesela de rendimiento del lienzo, no del parser, será el cuello de
botella.

Prueba adicional: `parcheo quirúrgico` — cambiar el valor de un `<Top>` altera
**exactamente 1 carácter** del XML de salida (misma longitud, resto intacto).

Memoria retenida (10 documentos en heap, con `gc()` forzado):
**12,9 MB para 2,18 MB de XML (~5,9×)**. Extrapolando, un fichero de 500 KB
retiene ~3 MB — muy por debajo de la estimación pesimista del documento de
pendientes (30-100 MB por fichero grande). El presupuesto de RAM no corre
peligro por el DOM lossless.

## Hallazgos del corpus relevantes para el guardado

- Los 10 ficheros empiezan con **BOM UTF-8** (`EF BB BF`).
- Saltos de línea **CRLF**.
- Namespaces `rd:` en atributos y nodos (`rd:DefaultName`, `rd:DataSourceID`, ...).
- `<Value>` puede ser texto plano, expresión (`=Fields!X.Value`) o mixto
  (varios `TextRun`).
- La estructura 2016 usa `ReportSection` → `Body` + `Page` → `PageHeader` /
  `PageFooter`; `PalletOutput.rdlc` no tiene `<Page>` (caso límite tolerado).

## Consecuencias

- La escritura debe preservar BOM y CRLF (el adaptador ya lo hace).
- Regla de guardado: serializar desde el DOM y comparar; si el documento no se
  tocó, bytes idénticos.
- `fast-xml-parser` queda prohibido para el camino de escritura (puede usarse
  para lectura rápida/consulta si algún día hace falta, nunca para emitir).
- Plan B si `xml-trueformat` falla en el futuro: vendorizar la librería en
  `packages/` (MIT) o implementar tokenizer propio (~3-4 semanas).
