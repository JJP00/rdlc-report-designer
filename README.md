<div align="center">

# RDLC Report Designer

**Editor visual de informes `.rdlc` de Business Central y `.rdl` de SSRS.**
Una alternativa moderna al Report Builder: edita el layout con el ratón y obtén un XML que se guarda **sin alterar nada de lo que no tocaste**.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Konva](https://img.shields.io/badge/Konva-10-0D83CD)
![Monaco](https://img.shields.io/badge/Monaco-editor-007ACC?logo=visualstudiocode&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-3-6E9F18?logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-dark.png">
  <img alt="RDLC Report Designer: lienzo con un informe de factura, pestañas y panel de propiedades" src="docs/assets/screenshot-light.png" width="920">
</picture>

</div>

---

## Por qué

El Report Builder está obsoleto y los `.rdlc` de Business Central se editan hoy a mano o con herramientas que reescriben el fichero entero. RDLC Report Designer:

- abre informes reales de BC y los **guarda byte a byte igual** salvo lo que cambies.
- valida contra el **XSD oficial RDL 2016/01** antes de guardar.
- es compatible con lo que **Report Builder y BC** esperan al abrir el informe.

## Características

| Área                         | Qué incluye                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fiel al fichero**          | XML _lossless_ como fuente de verdad: round-trip byte a byte (10/10 informes del corpus), undo byte-exacto, validación XSD al importar y al guardar.                                      |
| **Lienzo**                   | Papel, márgenes y bandas, reglas mm/cm, imán, flechas de 1 pt / 10 pt, zoom hasta 400 %, multiselección, 8 tiradores, z-order, culling por ventana visible (≈60 fps con ~1000 textboxes). |
| **Tablix completo**          | Celdas, filas y columnas, combinar/separar celdas, grupos de fila y de columna (Matrix), totales, visibilidad, filtros, cabeceras estilo Report Builder, cabeceras y esquina.             |
| **Texto y estilo**           | Runs y párrafos con precedencia `run > párrafo > item`, barra de formato, fuentes disponibles en BC, bordes por lado, relleno, color de fondo literal o expresión, formato numérico.      |
| **Expresiones**              | Monaco con resaltado y autocompletado para expresiones y para el bloque `<Code>` (VB), panel de variables con búsqueda.                                                                   |
| **Productividad**            | Paleta de comandos <kbd>Ctrl</kbd>+<kbd>K</kbd>, menú contextual, copiar/cortar/pegar, duplicar, insertar arrastrando desde la barra, tema claro/oscuro.                                  |
| **Varios informes a la vez** | Una pestaña por informe con undo, _dirty_ y conflicto independientes; reordenar, cerrar en lote y «Guardar todas».                                                                        |
| **Resiliente**               | Recarga en vivo si el fichero cambia por fuera, recuperación tras caída de la interfaz, aviso de conflicto al guardar y de fichero borrado.                                               |
| **Seguro**                   | Electron con sandbox, `contextIsolation`, navegación/ventanas/permisos bloqueados y rutas de fichero confiables solo si el usuario las eligió.                                            |
| **Formatos**                 | `.rdlc` de Business Central y `.rdl` de SSRS (esquema 2016/01).                                                                                                                           |

## Instalación

Descarga el instalador desde la sección **Releases** del repositorio:

| Fichero                                       | Uso                       |
| --------------------------------------------- | ------------------------- |
| `RDLC-Report-Designer-<versión>-setup.exe`    | Instalador clásico (NSIS) |
| `RDLC-Report-Designer-<versión>.msi`          | Despliegue corporativo    |
| `RDLC-Report-Designer-<versión>-portable.exe` | Sin instalación           |

> Los instaladores se firman solo si el pipeline dispone del certificado; una build sin firmar muestra el aviso de SmartScreen de Windows. Detalle en [docs/release](./docs/release/0001-empaquetado-windows.md).

También puedes abrir un informe desde la línea de comandos o arrastrándolo a la ventana:

```bash
"RDLC Report Designer.exe" C:\ruta\al\informe.rdlc
```

## Desarrollo

**Requisitos:** Node.js ≥ 22 y pnpm 9 (`npm install -g pnpm@9.15.4`).

```bash
pnpm install
pnpm --filter @rdlc-designer/back dev     # Electron en modo dev (HMR del renderer)
```

| Comando                                   | Qué hace                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                               | Tests unitarios (Vitest): golden round-trip, dominio, aplicación, front |
| `pnpm e2e`                                | Playwright sobre la app Electron (compila `out/` y lanza los E2E)       |
| `pnpm typecheck`                          | `tsc` en todos los paquetes                                             |
| `pnpm lint` · `pnpm format:check`         | Lint y formato                                                          |
| `pnpm --filter @rdlc-designer/back build` | Build de producción (main + preload + renderer)                         |
| `pnpm dist`                               | Instaladores Windows (NSIS + MSI) en `apps/back/release/`               |
| `pnpm dist:dir`                           | App desempaquetada, para un _smoke test_ sin instalador                 |

### Arquitectura

```
apps/back/            Electron main + NestJS (hexágono: dominio / aplicación / presentación / infraestructura)
apps/front/           React 19 — Tailwind v4 + shadcn/ui (radix-nova) + Konva
packages/contracts/   zod: comandos, proyección e IPC compartidos
fixtures/corpus/      10 informes reales para los golden tests
docs/                 ADR, rendimiento, empaquetado, UX, bugs y diseño de funcionalidades
```

El renderer nunca toca el XML: envía **comandos** tipados al backend, que los aplica al árbol _lossless_ (con su inverso para el undo) y devuelve una **proyección** para pintar. Más en la [documentación de arquitectura](./RDLC%20Report%20Designer%20-%20arquitectura.md) y en los ADR: [parser XML lossless](./docs/adr/0001-parser-xml-lossless.md) · [NestJS en el proceso main](./docs/adr/0002-nest-en-electron-main.md).

<details>
<summary><b>Solución de problemas</b></summary>

- **`Error: Electron uninstall` al arrancar en dev:** pnpm no ejecutó el postinstall de Electron. Descarga el binario a mano: `node apps/back/node_modules/electron/install.js`.
- **La app arranca como Node y falla con `does not provide an export named 'BrowserWindow'`:** la variable de entorno `ELECTRON_RUN_AS_NODE` está definida en tu terminal. Quítala (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) y vuelve a lanzar.

</details>

<details>
<summary><b>Benchmark del lienzo</b></summary>

```bash
# 3 pasadas del escenario de 972 textboxes sobre el build de producción
pnpm --filter @rdlc-designer/back bench
# Otro tamaño / nº de pasadas: node apps/back/scripts/bench.mjs 5000 5
```

Resultado actual: **59,5–59,9 fps p50** con 972 textboxes (presupuesto 60). Detalle en [docs/perf](./docs/perf/0001-baseline-lienzo.md).

</details>

<details>
<summary><b>Modo QA: capturas y guiones sobre la app real</b></summary>

Electron puede abrir un informe, ejecutar un guion en el renderer y sacar una captura sin tocar nada a mano. Es como se generaron las capturas de este README.

```powershell
$env:RDLC_OPEN='C:\ruta\al\informe.rdlc'    # fichero a abrir al arrancar
$env:RDLC_SHOT='C:\ruta\salida.png'         # captura al terminar
$env:RDLC_SHOT_DELAY='6000'                 # ms antes de ejecutar el guion
$env:RDLC_SHOT_DRAG='x1,y1,x2,y2'           # arrastre/click previo (px de ventana)
$env:RDLC_SHOT_SCRIPT='...'                 # JS a evaluar en el renderer
$env:RDLC_SHOT_QUIT='1'                     # cerrar al acabar
pnpm --filter @rdlc-designer/back dev
```

En dev (y en el build `--mode e2e`) el renderer expone ganchos para los guiones: `__rdlcSelection`, `__rdlcCell`, `__rdlcMenuHit`, `__rdlcResizeHandle`, `__rdlcStage` y `__rdlcProjection`. Los tests de interacción viven en Playwright (`pnpm e2e`).

</details>

## Documentación

- [Documentación funcional](./RDLC%20Report%20Designer.md)
- [Arquitectura](./RDLC%20Report%20Designer%20-%20arquitectura.md)
- [Estado de desarrollo](./docs/estado-desarrollo.md): fases, sesiones y cambios recientes
- [Pendientes y backlog](./RDLC%20Report%20Designer%20-%20Pendientes.md)
- [Empaquetado y CI](./docs/release/0001-empaquetado-windows.md)

## Licencia

[MIT](./LICENSE) © 2026 JunPeng Jin
