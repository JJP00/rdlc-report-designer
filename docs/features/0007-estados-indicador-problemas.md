# Estados del indicador Problemas

## Inventario de estados

El indicador es el contador del pie; el panel es la franja que abre. Un resultado es **vigente** cuando se calculó sobre la versión del documento que se ve (`sessionId` y `version` iguales a los de la proyección). El lint tarda 4–38 ms en los informes más grandes del repositorio (`CartaCMR.rdlc`, `BTCSalesQuote.rdlc`, `SalesCreditMemoESP.rdlc`, 15 pasadas cada uno), así que la espera que se nota es el retardo tras un cambio, no el cálculo.

| Estado | Cuándo | Contador del pie | Panel | Qué puede hacer | Cómo sale |
| --- | --- | --- | --- | --- | --- |
| Sin problemas | Resultado vigente, completo, sin hallazgos | ✓ «Sin problemas» | ✓ «Sin problemas» | Cerrar el panel | Un cambio pasa a «Pendiente tras un cambio» |
| Pendiente tras un cambio | Hubo un cambio y no ha llegado el resultado de esa versión, durante menos de 1 s | El último resultado, sin cambios | El último resultado, sin cambios | Seguir editando; pulsar un hallazgo | Llega el resultado → su estado; pasa 1 s → «Comprobando» |
| Primer resultado pendiente | Se abre un informe o se cambia a una pestaña sin resultado vigente guardado, durante menos de 1 s | Hueco vacío, sin icono ni texto | Cabecera sin lista | Nada que hacer: dura lo que el lint | Llega el resultado → su estado; pasa 1 s → «Comprobando» |
| Comprobando | Sin resultado de la versión vigente tras 1 s | Icono de carga + «Comprobando…» (sin giro con movimiento reducido) | La lista anterior atenuada, `aria-busy="true"`, y «Comprobando…» bajo la cabecera | Seguir editando | Llega el resultado → su estado; 5 s sin respuesta → «No se pudo comprobar» |
| No se pudo comprobar | El IPC falla, responde `ok:false` o no responde en 5 s | Círculo discontinuo, en el gris del pie + «Sin comprobar» | «No se pudo comprobar el informe. Puedes seguir editando y guardar.» (sin respuesta en 5 s: «La comprobación tardó demasiado. Puedes seguir editando y guardar.») y «Reintentar»; sin lista | Reintentar; seguir editando | «Reintentar» pide el lint al momento; cualquier cambio del documento también |
| Comprobación incompleta | Una o más reglas fallan y las demás terminan | Los contadores de lo que sí se comprobó + círculo discontinuo; con cero hallazgos, círculo discontinuo + «Comprobación incompleta» | Una línea por regla que falló («No se pudieron comprobar los campos del dataset.») y «Reintentar», encima de la lista | Trabajar con los hallazgos que hay; reintentar | Como «No se pudo comprobar» |
| Sin lint disponible | El front corre sin backend (navegador de desarrollo) | Oculto | No se abre | — | — |

**Nombre accesible del contador**, por estado: «Sin problemas»; el último resultado («2 errores, 0 avisos, 0 sugerencias») mientras está pendiente; «Comprobando el informe»; «No se pudo comprobar el informe»; «Comprobación incompleta: 2 errores, 0 avisos, 0 sugerencias».

**Anuncios** (`aria-live="polite"`): al llegar a «Sin problemas» o cambiar los contadores, y al entrar en «No se pudo comprobar» o «Comprobación incompleta». Nunca en «Pendiente tras un cambio», «Primer resultado pendiente» ni «Comprobando».

**«Reintentar»** pide el lint sin retardo y queda deshabilitado mientras espera. Si vuelve a fallar, el estado se queda; no hay reintento automático en bucle, porque un fallo de una regla con el mismo documento se repite.

## Catálogo de casos límite

| Categoría | Caso | Hoy | Debe | Prioridad |
| --- | --- | --- | --- | --- |
| Tiempo | Cambio y respuesta | Retardo de 600 ms para un cálculo de 4–38 ms | Retardo de 250 ms: sigue agrupando ráfagas (deshacer repetido, pegado múltiple) y acorta la ventana con resultado anterior | Menor |
| Tiempo | Dos cambios seguidos | Se descarta la petición superada por cancelación del efecto | Además, el resultado trae `version` y se ignora si no es la de la proyección | Importante |
| Comportamiento | Cambio de pestaña y vuelta | El resultado de la otra sesión se oculta y el contador dice «Sin problemas» hasta que llega el nuevo | Último resultado guardado por sesión; si su `version` sigue vigente se muestra al instante, si no, «Primer resultado pendiente». Se borra al cerrar la pestaña | Menor |
| Volumen | Dataset renombrado en AL: falla cada `Fields!` | Una fila por uso | Los grupos de más de 5 usos empiezan plegados, con «{n} usos» en la fila del problema | Menor |
| Contenido | Una regla lanza con un informe inesperado | Todo el lint falla y el contador dice «Sin problemas» | Cada regla se ejecuta aislada; el resultado trae los hallazgos de las que terminaron y la lista de las que fallaron | Importante |

El resultado del lint pasa a traer, además de los hallazgos, `version` (la de la sesión al calcularlo) y las reglas que fallaron con su motivo.

## Resultados de las pruebas de estrés

| Prueba | Resultado hoy | Estado o caso |
| --- | --- | --- |
| IPC que responde `ok:false` | ✓ «Sin problemas» | No se pudo comprobar |
| IPC que no responde | ✓ «Sin problemas» indefinidamente | No se pudo comprobar |
| Regla que lanza | ✓ «Sin problemas» | Comprobación incompleta; Una regla lanza con un informe inesperado |
| Cambio de pestaña con errores en la de destino | ✓ «Sin problemas» hasta que llega el resultado | Cambio de pestaña y vuelta |

## Recomendaciones de resiliencia

**Importantes**
- No se pudo comprobar
- Comprobación incompleta
- Sin problemas
- Dos cambios seguidos
- Una regla lanza con un informe inesperado

**Menores**
- Primer resultado pendiente
- Cambio de pestaña y vuelta
- Cambio y respuesta
- Dataset renombrado en AL: falla cada `Fields!`

**Cosméticas**
- Comprobando
